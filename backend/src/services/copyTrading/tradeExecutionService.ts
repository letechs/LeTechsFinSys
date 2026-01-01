import { CopyLink, ICopyLink, MT5Account, MasterTradeSignal, Command, ICommand, Trade } from '../../models';
import { commandQueueService } from '../commands/commandQueueService';
import { COMMAND_TYPES, COMMAND_STATUS, SOURCE_TYPES } from '../../config/constants';
import { logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';

export class TradeExecutionService {
  /**
   * Process master trade signal and create commands for slave accounts
   */
  async processMasterTradeSignal(signalId: string): Promise<void> {
    const signal = await MasterTradeSignal.findById(signalId);

    if (!signal) {
      console.error(`[ERROR] Signal ${signalId} not found`);
      throw new ValidationError('Master trade signal not found');
    }

    if (signal.status !== 'pending') {
      return; // Already processed
    }

    // CRITICAL: Check if commands already exist for this signal BEFORE processing
    // IMPORTANT: For OPEN signals, block if any command exists. For MODIFY/CLOSE, allow multiple.
    if (signal.eventType === 'OPEN') {
      // For OPEN signals, check if commands already exist (prevent duplicate BUY/SELL)
      let existingCommandsCount = await Command.countDocuments({
        sourceId: signal._id,
        // Check for ANY status - if commands exist in any status, they were already processed
      });

      // If not found by sourceId, check by masterAccountId + ticket (in case signal was recreated after restart)
      if (existingCommandsCount === 0) {
        existingCommandsCount = await Command.countDocuments({
          masterAccountId: signal.masterAccountId,
          comment: new RegExp(`Ticket #${signal.ticket}`),
          commandType: { $in: [COMMAND_TYPES.BUY, COMMAND_TYPES.SELL] }, // Only check BUY/SELL commands
          // Check for ANY status
        });
      }

      if (existingCommandsCount > 0) {
        // Mark signal as processed even though we didn't create new commands
        signal.status = 'processed';
        signal.commandsGenerated = existingCommandsCount;
        await signal.save();
        return; // Commands already exist, skip
      }
    }
    // For MODIFY and CLOSE signals, we allow processing (duplicate prevention is handled in their respective methods)

    // Get master account
    const masterAccount = await MT5Account.findById(signal.masterAccountId);
    if (!masterAccount) {
      throw new ValidationError('Master account not found');
    }

    // Find all active copy links for this master
    const masterIdStr = signal.masterAccountId.toString();
    const copyLinks = await CopyLink.find({
      masterAccountId: signal.masterAccountId,
      status: 'active',
    }).populate('slaveAccountId');

    if (copyLinks.length === 0) {
      signal.status = 'processed';
      signal.commandsGenerated = 0;
      await signal.save();
      return;
    }

    // CRITICAL FIX: Process all copy links in PARALLEL (like signals)
    // This ensures all commands are created quickly, not one after another
    const commandPromises = copyLinks.map(async (copyLink) => {
      try {
        // Handle populated or non-populated slaveAccountId
        let slaveAccount: any;
        const slaveId = (copyLink.slaveAccountId as any)?._id || copyLink.slaveAccountId;
        
        if (copyLink.slaveAccountId && typeof copyLink.slaveAccountId === 'object' && (copyLink.slaveAccountId as any)._id) {
          // Already populated
          slaveAccount = copyLink.slaveAccountId;
        } else {
          // Need to populate
          slaveAccount = await MT5Account.findById(slaveId);
        }
        
        if (!slaveAccount) {
          logger.warn(`Slave account not found for copy link ${copyLink._id}`);
          return 0; // Return 0 commands generated for this link
        }

        // Check if symbol should be copied
        if (!this.shouldCopySymbol(signal.symbol, copyLink)) {
          return 0; // Return 0 commands generated for this link
        }

        // Handle different event types
        if (signal.eventType === 'OPEN') {
          await this.createOpenOrderCommand(signal, copyLink, masterAccount, slaveAccount);
          return 1; // 1 command generated
        } else if (signal.eventType === 'CLOSE') {
          await this.createCloseOrderCommand(signal, copyLink, slaveAccount);
          return 1; // 1 command generated
        } else if (signal.eventType === 'MODIFY' && copyLink.copyModifications) {
          await this.createModifyOrderCommand(signal, copyLink, slaveAccount);
          return 1; // 1 command generated
        } else if (signal.eventType === 'MODIFY' && !copyLink.copyModifications) {
          return 0; // No command generated
        }
        
        return 0; // No command generated for this event type
      } catch (error: any) {
        console.error(`[COPY] ❌ ERROR processing copy link ${copyLink._id}:`, error);
        logger.error(`Error processing copy link ${copyLink._id}:`, error);
        return 0; // Return 0 on error
      }
    });

    // Wait for all commands to be created in parallel
    const commandCounts = await Promise.all(commandPromises);
    const commandsGenerated = commandCounts.reduce<number>((sum, count) => sum + count, 0);

    // Update signal status
    signal.status = 'processed';
    signal.commandsGenerated = commandsGenerated;
    await signal.save();
    
    // NOTE: MODIFY commands are NOT auto-marked as executed here
    // They should remain PENDING until EA acknowledges them
    // Oscillation prevention is handled by:
    // 1. Invalidating old MODIFY signals in signalDetectionService (superseded status)
    // 2. Filtering superseded commands in commandQueueService
    // 3. Only fetching PENDING commands (never resending SENT)

    logger.info(`Processed signal ${signalId}: Generated ${commandsGenerated} commands`);
  }

  /**
   * Check if symbol should be copied based on copy link filters
   */
  private shouldCopySymbol(symbol: string, copyLink: ICopyLink): boolean {
    // If copySymbols is specified, only copy those symbols
    if (copyLink.copySymbols.length > 0) {
      return copyLink.copySymbols.includes(symbol);
    }

    // If excludeSymbols is specified, exclude those symbols
    if (copyLink.excludeSymbols.length > 0) {
      return !copyLink.excludeSymbols.includes(symbol);
    }

    // Default: copy all symbols
    return true;
  }

  /**
   * Create open order command for slave account
   */
  private async createOpenOrderCommand(
    signal: any,
    copyLink: ICopyLink,
    masterAccount: any,
    slaveAccount: any
  ): Promise<void> {
    // CRITICAL: Check if command already exists for this signal + slave to prevent duplicates
    // Use multiple checks to catch duplicates even after backend restart
    
    // Check 1: By sourceId (most specific - same signal)
    let existingCommand = await Command.findOne({
      targetAccountId: slaveAccount._id,
      sourceId: signal._id,
      // Check for ANY status - if command exists in any status, it was already processed
    });

    // Check 2: By masterAccountId + ticket + targetAccountId (in case signal was recreated after restart)
    if (!existingCommand) {
      existingCommand = await Command.findOne({
        targetAccountId: slaveAccount._id,
        masterAccountId: masterAccount._id,
        commandType: signal.orderType === 'BUY' ? COMMAND_TYPES.BUY : COMMAND_TYPES.SELL,
        symbol: signal.symbol,
        comment: new RegExp(`Ticket #${signal.ticket}`),
        // Check for ANY status - PENDING, SENT, EXECUTED, FAILED all mean it was processed
      });
    }

    // Check 3: By comment pattern only (most permissive - catches any command for this master ticket)
    if (!existingCommand) {
      const commentPattern = `Ticket #${signal.ticket}`;
      existingCommand = await Command.findOne({
        targetAccountId: slaveAccount._id,
        comment: new RegExp(commentPattern),
        // Check for ANY status
      });
    }

    // Check 4: Check if trade already exists in slave account (by masterTicket in database)
    // This catches cases where trade was executed but command wasn't marked as executed
    if (!existingCommand) {
      const existingSlaveTrade = await Trade.findOne({
        accountId: slaveAccount._id,
        masterTicket: signal.ticket,
        masterAccountId: masterAccount._id,
        status: 'open', // Only check open trades
      });
      
      if (existingSlaveTrade) {
        // Don't create command - trade already exists
        return;
      }
    }

    // Check 5: DISABLED - Was checking cached openTrades but too aggressive and blocking new trades
    // The backend already has Check 4 (database check) which is more reliable
    // For EA restart duplicate prevention, we rely on:
    // 1. Database check (Check 4) - most reliable
    // 2. Command existence checks (Checks 1-3) - prevent duplicate commands
    // 3. EA-side duplicate prevention (IsCommandExecuted) - prevents re-execution
    // Cache check was causing false positives and blocking legitimate new trades

    if (existingCommand) {
      return; // Command already exists, skip
    }

    // All duplicate checks passed - proceed with command creation

    // Calculate lot size based on risk mode
    const slaveLotSize = this.calculateLotSize(
      signal.volume,
      copyLink.lotMultiplier,
      copyLink.riskMode,
      copyLink.riskPercent,
      masterAccount,
      slaveAccount
    );

    if (slaveLotSize <= 0) {
      logger.warn(`Invalid lot size calculated: ${slaveLotSize} for slave ${slaveAccount._id}`);
      return;
    }

    // Determine order type (MARKET for now, can be enhanced for pending orders)
    const orderType = 'MARKET';

    // Create command
    // CRITICAL: Include masterTicket field so EA can use it directly without parsing comment
    // signal.ticket is the master trade ticket from the heartbeat
    const masterTicketValue = signal.ticket;
    
    // CRITICAL VALIDATION: Ensure masterTicket is set and valid
    if (!masterTicketValue || masterTicketValue <= 0) {
      logger.error(`Cannot create command: masterTicket is invalid (${masterTicketValue}) for signal ${signal._id}`);
      throw new ValidationError(`Invalid master ticket: ${masterTicketValue}. Signal ticket: ${signal.ticket}`);
    }
    
    const command = new Command({
      targetAccountId: slaveAccount._id,
      commandType: signal.orderType === 'BUY' ? COMMAND_TYPES.BUY : COMMAND_TYPES.SELL,
      symbol: signal.symbol,
      volume: slaveLotSize,
      orderType,
      sl: signal.sl,
      tp: signal.tp,
      comment: `Copy from Master #${masterAccount.loginId} Ticket #${signal.ticket}`,
      masterTicket: masterTicketValue, // CRITICAL: Master ticket for EA to embed in position comment
      magicNumber: this.generateMagicNumber(copyLink._id.toString()),
      sourceType: SOURCE_TYPES.MASTER_TRADE,
      sourceId: signal._id,
      masterAccountId: masterAccount._id,
      status: COMMAND_STATUS.PENDING,
      priority: Math.min(10, Math.max(0, copyLink.priority ?? 5)), // Clamp to valid range (0-10), default 5 for OPEN
    });
    
    // CRITICAL: Verify masterTicket was set correctly in command object BEFORE saving
    if (!command.masterTicket || command.masterTicket !== masterTicketValue) {
      logger.error(`Command masterTicket mismatch: Expected ${masterTicketValue}, Got ${command.masterTicket}`);
      // Force set it
      command.masterTicket = masterTicketValue;
    }

    const slaveAccountId = slaveAccount._id.toString();
    const slaveLoginId = slaveAccount.loginId || 'unknown';
    
    try {
      await commandQueueService.enqueueCommand(slaveAccountId, command);
      
      // CRITICAL: Verify masterTicket was saved correctly AFTER enqueueCommand
      const savedCommand = await Command.findById(command._id);
      if (savedCommand && (!savedCommand.masterTicket || savedCommand.masterTicket !== masterTicketValue)) {
        logger.error(`Command masterTicket not saved: Expected ${masterTicketValue}, Got ${savedCommand.masterTicket}`);
        // Update it
        savedCommand.masterTicket = masterTicketValue;
        await savedCommand.save();
      }
    } catch (error) {
      logger.error('Failed to save command:', error);
      throw error; // Re-throw to prevent continuing with invalid command
    }
    logger.info(
      `Created ${command.commandType} command for slave ${slaveAccount._id}: ` +
      `${slaveLotSize} lots of ${signal.symbol} (Master: ${signal.volume} lots)`
    );
  }

  /**
   * Create close order command for slave account
   */
  private async createCloseOrderCommand(
    signal: any,
    copyLink: ICopyLink,
    slaveAccount: any
  ): Promise<void> {
    // CRITICAL FIX: Do NOT depend on slaveTrade lookup
    // EA finds positions by matching MASTER_TICKET in comment, not by slave ticket
    // This makes CLOSE work even if Trade DB doesn't have masterTicket stored
    
    // CRITICAL: Check if CLOSE command already exists to prevent duplicates (match by masterTicket)
    const existingCloseCommand = await Command.findOne({
      targetAccountId: slaveAccount._id,
      commandType: COMMAND_TYPES.CLOSE,
      masterTicket: signal.ticket, // Match by master ticket, not slave ticket
      status: { $in: [COMMAND_STATUS.PENDING, COMMAND_STATUS.SENT, COMMAND_STATUS.EXECUTED] },
    });

    if (existingCloseCommand) {
      return;
    }

    // Create close command
    // CRITICAL: EA finds position by matching MASTER_TICKET in comment, so we only need masterTicket
    const command = new Command({
      targetAccountId: slaveAccount._id,
      commandType: COMMAND_TYPES.CLOSE,
      // ticket field not needed - EA doesn't use it for CLOSE
      masterTicket: signal.ticket, // CRITICAL: Master ticket for EA to find position by comment
      comment: `COPY|MASTER_TICKET|${signal.ticket}|Close`, // Use same format as BUY/SELL for consistent matching
      sourceType: SOURCE_TYPES.MASTER_TRADE,
      sourceId: signal._id,
      masterAccountId: signal.masterAccountId,
      status: COMMAND_STATUS.PENDING,
      priority: Math.min(10, Math.max(0, copyLink.priority ?? 8)), // Clamp to valid range (0-10), default 8 for CLOSE
    });

    // CRITICAL: Save command explicitly before enqueueing for safety
    // This ensures command is persisted even if enqueueCommand implementation changes
    await command.save();
    
    // CRITICAL: Ensure command is immediately visible (read-after-write consistency)
    // Refresh the command from database to ensure it's visible to queries
    await Command.findById(command._id);
    
    await commandQueueService.enqueueCommand(slaveAccount._id.toString(), command);
  }

  /**
   * Create modify order command for slave account
   */
  private async createModifyOrderCommand(
    signal: any,
    copyLink: ICopyLink,
    slaveAccount: any
  ): Promise<void> {
    // CRITICAL FIX: Do NOT depend on slaveTrade lookup
    // EA finds positions by matching MASTER_TICKET in comment, not by slave ticket
    // This makes MODIFY work even if Trade DB doesn't have masterTicket stored

    // CRITICAL: Normalize SL/TP values to ensure consistent representation
    // Converts null/undefined/NaN/<=0 to 0 for consistent comparison
    const normalizePrice = (value?: number | null): number => {
      if (value === null || value === undefined || Number.isNaN(value) || value <= 0) {
        return 0;
      }
      return Number(value.toFixed(5)); // Round to 5 decimal places
    };
    
    // Create modify command
    // CRITICAL: EA finds position by matching MASTER_TICKET in comment, so we only need masterTicket
    // CRITICAL: Always send BOTH SL and TP (normalized) to prevent partial updates
    // CRITICAL: MODIFY commands get HIGHEST priority (clamped to 9) to ensure immediate processing
    // This prevents delays when SL/TP changes need to be applied quickly
    const command = new Command({
      targetAccountId: slaveAccount._id,
      commandType: COMMAND_TYPES.MODIFY,
      // modifyTicket field not needed - EA doesn't use it for MODIFY
      masterTicket: signal.ticket, // CRITICAL: Master ticket for EA to find position by comment
      newSl: normalizePrice(signal.sl), // Always send normalized value (0 if removed)
      newTp: normalizePrice(signal.tp), // Always send normalized value (0 if removed)
      comment: `COPY|MASTER_TICKET|${signal.ticket}|Modify`, // Use same format as BUY/SELL for consistent matching
      sourceType: SOURCE_TYPES.MASTER_TRADE,
      sourceId: signal._id,
      masterAccountId: signal.masterAccountId,
      status: COMMAND_STATUS.PENDING,
      priority: Math.min(10, Math.max(0, copyLink.priority ?? 9)), // Clamp to valid range (0-10), default 9 for MODIFY (highest)
    });

    // CRITICAL: Save command explicitly before enqueueing for safety
    // This ensures command is persisted even if enqueueCommand implementation changes
    await command.save();
    await commandQueueService.enqueueCommand(slaveAccount._id.toString(), command);
    logger.info(`Created MODIFY command for slave ${slaveAccount._id}: Master ticket ${signal.ticket} | SL=${signal.sl} TP=${signal.tp}`);
  }

  /**
   * Calculate lot size for slave account based on risk mode
   */
  private calculateLotSize(
    masterVolume: number,
    lotMultiplier: number,
    riskMode: 'fixed' | 'percentage' | 'balance_ratio',
    riskPercent: number,
    masterAccount: any,
    slaveAccount: any
  ): number {
    let slaveLotSize: number;

    switch (riskMode) {
      case 'fixed':
        // Simple multiplier
        slaveLotSize = masterVolume * lotMultiplier;
        break;

      case 'percentage':
        // Percentage of slave balance
        const slaveBalance = slaveAccount.balance || 0;
        const riskAmount = (slaveBalance * riskPercent) / 100;
        // Calculate lot size based on risk amount (simplified - would need symbol info for proper calculation)
        slaveLotSize = (masterVolume * lotMultiplier * riskAmount) / (slaveBalance || 1);
        break;

      case 'balance_ratio':
        // Ratio of slave balance to master balance
        const masterBalance = masterAccount.balance || 1;
        const slaveBalance2 = slaveAccount.balance || 0;
        const balanceRatio = slaveBalance2 / masterBalance;
        slaveLotSize = masterVolume * balanceRatio * lotMultiplier;
        break;

      default:
        slaveLotSize = masterVolume * lotMultiplier;
    }

    // Round to 2 decimal places (standard lot size precision)
    return Math.round(slaveLotSize * 100) / 100;
  }

  /**
   * Find slave trade that corresponds to a master trade ticket
   * Searches both database and current open trades from cache/heartbeat
   */
  private async findSlaveTradeByMasterTicket(
    slaveAccountId: string,
    masterAccountId: string,
    masterTicket: number
  ): Promise<any> {
    // First, try to find in database by masterTicket
    let slaveTrade = await Trade.findOne({
      accountId: slaveAccountId,
      masterAccountId: masterAccountId,
      masterTicket: masterTicket,
      status: 'open',
    });

    if (slaveTrade) {
      console.log(`[FLOW-6] ✅ Found slave trade in DB: Ticket ${slaveTrade.ticket} for master ticket ${masterTicket}`);
      return slaveTrade;
    }

    // If not found in DB, try to find by comment pattern in database
    // Comment format: "Copy from Master #XXXXX Ticket #YYYYY"
    const masterAccount = await MT5Account.findById(masterAccountId).lean();
    if (masterAccount && masterAccount.loginId) {
      const commentPattern = `Ticket #${masterTicket}`;
      slaveTrade = await Trade.findOne({
        accountId: slaveAccountId,
        comment: new RegExp(commentPattern),
        status: 'open',
      });

      if (slaveTrade) {
        console.log(`[FLOW-6] ✅ Found slave trade in DB by comment: Ticket ${slaveTrade.ticket} for master ticket ${masterTicket}`);
        // Update the trade to include masterTicket for future lookups
        await Trade.updateOne(
          { _id: slaveTrade._id },
          {
            $set: {
              masterAccountId: masterAccountId,
              masterTicket: masterTicket,
            },
          }
        );
        return slaveTrade;
      }
    }

    // If still not found, try to get from cache (current open trades from heartbeat)
    // This handles cases where trade exists in MT5 but not yet in database
    try {
      const { cacheService } = await import('../realtime/cacheService');
      const cachedData = await cacheService.getCachedAccountData(slaveAccountId);
      
      if (cachedData && cachedData.openTrades && Array.isArray(cachedData.openTrades)) {
        // Search for trade with matching comment (comment may be in cached data if it was in heartbeat)
        const masterAccount = await MT5Account.findById(masterAccountId).lean();
        if (masterAccount && masterAccount.loginId) {
          const commentPattern = `Ticket #${masterTicket}`;
          // Type assertion to allow comment field (it may exist in cached data even if not in interface)
          const matchingTrade = cachedData.openTrades.find((trade: any) => {
            return trade.comment && typeof trade.comment === 'string' && trade.comment.includes(commentPattern);
          });

          if (matchingTrade) {
            console.log(`[FLOW-6] ✅ Found slave trade in cache: Ticket ${matchingTrade.ticket} for master ticket ${masterTicket}`);
            // Return a trade-like object with the ticket
            return {
              ticket: matchingTrade.ticket,
              symbol: matchingTrade.symbol,
              orderType: matchingTrade.type,
              volume: matchingTrade.volume,
              openPrice: matchingTrade.openPrice,
              status: 'open',
            };
          } else {
            console.log(`[FLOW-6] ℹ️  Cache has ${cachedData.openTrades.length} open trade(s) but none match master ticket ${masterTicket}`);
          }
        }
      }
    } catch (error) {
      console.log(`[FLOW-6] ⚠️ Could not check cache for slave trade: ${error instanceof Error ? error.message : String(error)}`);
    }

    console.log(`[FLOW-6] ⚠️ No slave trade found for master ticket ${masterTicket} in slave account ${slaveAccountId.substring(0, 8)}...`);
    return null;
  }

  /**
   * Generate magic number for identifying copied trades
   */
  private generateMagicNumber(copyLinkId: string): number {
    // Generate a consistent magic number based on copy link ID
    // This helps identify which trades belong to which copy link
    const hash = copyLinkId.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return Math.abs(hash) % 1000000; // Keep it within reasonable range
  }

  /**
   * Process all pending master trade signals
   */
  async processPendingSignals(): Promise<void> {
    const pendingSignals = await MasterTradeSignal.find({
      status: 'pending',
    }).limit(100); // Process in batches

    logger.info(`Processing ${pendingSignals.length} pending signals`);

    for (const signal of pendingSignals) {
      try {
        await this.processMasterTradeSignal(signal._id.toString());
      } catch (error: any) {
        logger.error(`Error processing signal ${signal._id}:`, error);
        signal.status = 'failed';
        await signal.save();
      }
    }
  }
}

export const tradeExecutionService = new TradeExecutionService();

