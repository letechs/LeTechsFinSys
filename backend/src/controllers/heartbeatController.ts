import { Request, Response, NextFunction } from 'express';
import { heartbeatService } from '../services/mt5/heartbeatService';
import { commandQueueService } from '../services/commands/commandQueueService';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

export class HeartbeatController {
  /**
   * Receive heartbeat from EA
   * POST /api/ea/heartbeat
   */
  receiveHeartbeat = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.eaAccount) {
        logger.error('Heartbeat received without authenticated account');
        res.status(401).json({
          success: false,
          message: 'EA account not authenticated',
        });
        return;
      }

      const heartbeatData = req.body || {};
      const accountId = req.eaAccount._id.toString();
      
      // Ensure openTrades is an array (default to empty if not provided)
      if (!heartbeatData.openTrades || !Array.isArray(heartbeatData.openTrades)) {
        heartbeatData.openTrades = [];
      }

      // Process heartbeat (errors are logged but don't fail the request)
      try {
        await heartbeatService.processHeartbeat(
          accountId,
          heartbeatData
        );
      } catch (processError: any) {
        // Log error but still return success to keep EA connected
        logger.error(`Error in heartbeat processing for account ${req.eaAccount._id}:`, {
          message: processError?.message || String(processError),
          stack: processError?.stack,
          heartbeatData: {
            balance: heartbeatData.balance,
            equity: heartbeatData.equity,
            margin: heartbeatData.margin,
            freeMargin: heartbeatData.freeMargin,
            marginLevel: heartbeatData.marginLevel,
            openTradesCount: heartbeatData.openTrades?.length || 0,
          },
        });
        // Continue - don't fail the request
      }

      // Always return success to keep EA connected
      res.json({
        success: true,
        message: 'Heartbeat received',
        accountStatus: 'online',
        serverTime: new Date().toISOString(),
      });
    } catch (error: any) {
      // Log authentication/validation errors
      logger.error('Heartbeat endpoint error:', {
        message: error?.message || String(error),
        stack: error?.stack,
        accountId: req.eaAccount?._id,
        path: req.path,
      });
      // Always return success to keep EA connected, even on errors
      if (!res.headersSent) {
        res.json({
          success: true,
          message: 'Heartbeat received (with warnings)',
          accountStatus: 'online',
          serverTime: new Date().toISOString(),
        });
      }
    }
  };

  /**
   * EA polls for commands
   * GET /api/ea/commands
   */
  getCommands = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.eaAccount) {
        res.status(401).json({
          success: false,
          message: 'EA account not authenticated',
        });
        return;
      }

      const accountId = req.eaAccount._id.toString();
      const limit = parseInt(req.query.limit as string) || 10;
      const commands = await commandQueueService.getPendingCommands(accountId, limit);
      
      const responseData = {
        success: true,
        commands: await Promise.all(commands.map(async (cmd) => {
          // CRITICAL FIX: For all commands, ensure masterTicket is correct
          // MODIFY/CLOSE commands use "MASTER_TICKET|XXXXX" format, BUY/SELL use "Ticket #XXXXX" format
          if (!cmd.masterTicket || cmd.masterTicket <= 0) {
            logger.error(`Command ${cmd._id} (${cmd.commandType}) missing masterTicket: ${cmd.masterTicket}`);
            
            // Try to extract master ticket from comment
            if (cmd.comment) {
              let extractedTicket = 0;
              
              // Try format 1: "COPY|MASTER_TICKET|XXXXX|Modify" or "COPY|MASTER_TICKET|XXXXX|Close"
              const masterTicketMatch = cmd.comment.match(/MASTER_TICKET\|(\d+)/);
              if (masterTicketMatch && masterTicketMatch[1]) {
                extractedTicket = parseInt(masterTicketMatch[1], 10);
              }
              
              // Try format 2: "Ticket #XXXXX" (for BUY/SELL)
              if (extractedTicket <= 0) {
                const ticketMatch = cmd.comment.match(/Ticket #(\d+)/);
                if (ticketMatch && ticketMatch[1]) {
                  extractedTicket = parseInt(ticketMatch[1], 10);
                }
              }
              
              if (extractedTicket > 0) {
                cmd.masterTicket = extractedTicket;
                await cmd.save();
              }
            }
          }
          
          const responseCmd = {
            _id: cmd._id,
            commandType: cmd.commandType,
            symbol: cmd.symbol,
            volume: cmd.volume,
            orderType: cmd.orderType,
            price: cmd.price,
            sl: cmd.sl,
            tp: cmd.tp,
            slPips: cmd.slPips,
            tpPips: cmd.tpPips,
            ticket: cmd.ticket,
            modifyTicket: cmd.modifyTicket,
            newSl: cmd.newSl,
            newTp: cmd.newTp,
            masterTicket: cmd.masterTicket || 0, // CRITICAL: Master ticket for EA to use (default to 0 if missing)
            comment: cmd.comment,
            magicNumber: cmd.magicNumber,
            priority: cmd.priority,
            createdAt: cmd.createdAt,
          };
          
          return responseCmd;
        })),
      };
      
      res.json(responseData);
    } catch (error: any) {
      // Return empty list on error to keep EA connected
      if (!res.headersSent) {
        res.json({
          success: true,
          commands: [],
        });
      }
    }
  };

  /**
   * EA updates command execution status
   * PATCH /api/ea/commands/:id/status
   */
  updateCommandStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.eaAccount) {
        throw new ValidationError('EA account not authenticated');
      }

      const { id } = req.params;
      const { status, executionResult } = req.body;

      if (!status || !['executed', 'failed'].includes(status)) {
        throw new ValidationError('Invalid status. Must be "executed" or "failed"');
      }

      const command = await commandQueueService.updateCommandStatus(
        id,
        req.eaAccount._id.toString(),
        status,
        executionResult
      );

      res.json({
        success: true,
        message: `Command ${status} successfully`,
        data: command,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const heartbeatController = new HeartbeatController();

