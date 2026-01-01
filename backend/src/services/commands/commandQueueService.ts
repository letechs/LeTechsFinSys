import { Command, ICommand } from '../../models';
import { redisClient } from '../../config/redis';
import { COMMAND_STATUS, COMMAND_TYPES } from '../../config/constants';
import { logger } from '../../utils/logger';

export class CommandQueueService {
  private readonly QUEUE_PREFIX = 'commands:';
  private readonly PENDING_PREFIX = 'pending:';

  /**
   * Add command to queue (Redis + MongoDB)
   */
  async enqueueCommand(accountId: string, command: ICommand): Promise<void> {
    // Save to MongoDB with write concern "majority" for immediate read consistency
    await command.save({ w: 'majority' });

    // Add to Redis queue for fast access (optional)
    const queueKey = `${this.QUEUE_PREFIX}${accountId}`;
    const pendingKey = `${this.PENDING_PREFIX}${accountId}`;

    try {
      if (redisClient.isReady) {
        await redisClient.lPush(queueKey, command._id.toString());
        await redisClient.sAdd(pendingKey, command._id.toString());
      }
    } catch (error) {
      // Redis is optional - continue even if it fails
    }
  }

  /**
   * Get pending commands for EA (polling)
   */
  async getPendingCommands(accountId: string, limit: number = 10): Promise<ICommand[]> {
    // Get from MongoDB (source of truth)
    // CRITICAL FIX: Only fetch PENDING commands - never resend SENT/EXECUTED
    // This prevents infinite resending loops and command oscillation
    // SENT commands should only be marked as EXECUTED by EA acknowledgment, not resent
    let commands = await Command.find({
      targetAccountId: accountId,
      status: COMMAND_STATUS.PENDING, // ONLY PENDING - never resend SENT commands
    })
      .sort({ priority: -1, createdAt: 1 })
      .limit(limit);
    
    // CRITICAL: Filter out MODIFY commands from superseded signals (state-driven, not event-driven)
    // This ensures only the latest MODIFY state is sent, preventing oscillation
    if (commands.length > 0) {
      const { MasterTradeSignal } = require('../../models');
      const validCommands = [];
      for (const cmd of commands) {
        if (cmd.commandType === COMMAND_TYPES.MODIFY && cmd.sourceId) {
          // Check if the source signal is superseded
          const sourceSignal = await MasterTradeSignal.findById(cmd.sourceId);
          if (sourceSignal && sourceSignal.status === 'superseded') {
            console.log(`[COMMANDS] ⏭️  SKIPPED MODIFY command ${cmd._id} from superseded signal ${cmd.sourceId} (old state, not sending)`);
            continue; // Skip this command - it's from an old MODIFY state
          }
        }
        validCommands.push(cmd);
      }
      commands = validCommands;
    }
    
    // CRITICAL FIX: For BUY/SELL commands, ensure masterTicket is correct
    for (const cmd of commands) {
      if ((cmd.commandType === 'BUY' || cmd.commandType === 'SELL') && (!cmd.masterTicket || cmd.masterTicket <= 0)) {
        if (cmd.comment) {
          const ticketMatch = cmd.comment.match(/Ticket #(\d+)/);
          if (ticketMatch && ticketMatch[1]) {
            const extractedTicket = parseInt(ticketMatch[1], 10);
            if (extractedTicket > 0) {
              cmd.masterTicket = extractedTicket;
              await cmd.save();
            }
          }
        }
      }
    }
    
    // If query returned 0, check if there are actually pending or sent commands (read-after-write consistency issue)
    if (commands.length === 0) {
      // Check both PENDING and SENT commands that need resending
      const pendingCount = await Command.countDocuments({
        targetAccountId: accountId,
        status: COMMAND_STATUS.PENDING,
      });
      
      // If there are pending commands but query returned 0, retry after small delay (MongoDB read-after-write)
      if (pendingCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay for better consistency (200ms for read-after-write)
        
        // Retry with PENDING only (never resend SENT)
        commands = await Command.find({
          targetAccountId: accountId,
          status: COMMAND_STATUS.PENDING, // ONLY PENDING - never resend SENT commands
        })
          .sort({ priority: -1, createdAt: 1 })
          .limit(limit);
        
        // Retry successful - commands found
      }
    }
    
    // Log command dispatch only when commands are found
    if (commands.length > 0) {
      const closeCommands = commands.filter(c => c.commandType === COMMAND_TYPES.CLOSE);
      const modifyCommands = commands.filter(c => c.commandType === COMMAND_TYPES.MODIFY);
      const buySellCommands = commands.filter(c => c.commandType === COMMAND_TYPES.BUY || c.commandType === COMMAND_TYPES.SELL);
      
      console.log(`[COMMANDS] 📤 Dispatching ${commands.length} command(s) to account ${accountId.substring(0, 8)}... | ` +
        `${buySellCommands.length} BUY/SELL, ${modifyCommands.length} MODIFY, ${closeCommands.length} CLOSE`);
      // Mark as sent AFTER we've retrieved them but BEFORE returning
      const commandIds = commands.map(c => c._id);
      await Command.updateMany(
        { _id: { $in: commandIds } },
        {
          status: COMMAND_STATUS.SENT,
          sentAt: new Date(),
        }
      );

      // Update Redis (optional - MongoDB is source of truth)
      try {
        if (redisClient.isReady) {
          const pendingKey = `${this.PENDING_PREFIX}${accountId}`;
          for (const cmd of commands) {
            await redisClient.sRem(pendingKey, cmd._id.toString());
          }
        }
      } catch (error) {
        // Redis is optional - continue even if it fails
      }
    }
    return commands;
  }

  /**
   * Mark command as sent
   */
  async markCommandSent(commandId: string): Promise<void> {
    await Command.findByIdAndUpdate(commandId, {
      status: COMMAND_STATUS.SENT,
      sentAt: new Date(),
    });
  }

  /**
   * Remove command from queue
   */
  async dequeueCommand(commandId: string): Promise<void> {
    const command = await Command.findById(commandId);

    if (!command) {
      return;
    }

    // Remove from Redis
    try {
      const queueKey = `${this.QUEUE_PREFIX}${command.targetAccountId}`;
      const pendingKey = `${this.PENDING_PREFIX}${command.targetAccountId}`;
      await redisClient.lRem(queueKey, 0, commandId);
      await redisClient.sRem(pendingKey, commandId);
    } catch (error) {
      logger.error('Redis dequeue error:', error);
    }
  }

  /**
   * Get command count for account
   */
  async getCommandCount(accountId: string, status?: string): Promise<number> {
    const query: any = { targetAccountId: accountId };
    if (status) {
      query.status = status;
    }

    return Command.countDocuments(query);
  }

  /**
   * Update command execution status
   */
  async updateCommandStatus(
    commandId: string,
    accountId: string,
    status: 'executed' | 'failed',
    executionResult?: {
      success: boolean;
      orderTicket?: number;
      error?: string;
      errorCode?: number;
    }
  ): Promise<ICommand> {
    const command = await Command.findOne({
      _id: commandId,
      targetAccountId: accountId,
    });

    if (!command) {
      throw new Error('Command not found');
    }

    command.status = status === 'executed' ? COMMAND_STATUS.EXECUTED : COMMAND_STATUS.FAILED;
    command.executedAt = new Date();
    
    if (executionResult) {
      command.executionResult = executionResult;
    }

    await command.save();

    // Remove from Redis queue
    await this.dequeueCommand(commandId);

    logger.info(`Command ${commandId} status updated to ${status}`);

    return command;
  }
}

export const commandQueueService = new CommandQueueService();

