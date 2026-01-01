import { Request, Response, NextFunction } from 'express';
import { Trade, MT5Account } from '../models';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { detectMasterTrades } from '../services/copyTrading/signalDetectionService';
import { tradeExecutionService } from '../services/copyTrading/tradeExecutionService';

export class MT5WebhookController {
  /**
   * Handle trade update from MT5 EA
   * POST /api/webhooks/mt5/trade-update
   */
  handleTradeUpdate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.eaAccount) {
        throw new ValidationError('EA account not authenticated');
      }

      const {
        eventType,
        ticket,
        symbol,
        orderType,
        volume,
        openPrice,
        closePrice,
        sl,
        tp,
        profit,
        comment,
        error,
      } = req.body;

      if (!eventType || !ticket) {
        throw new ValidationError('eventType and ticket are required');
      }

      const accountId = req.eaAccount._id.toString();

      // Handle different event types
      switch (eventType) {
        case 'ORDER_OPENED':
          // Create or update trade record
          if (!symbol || !orderType || !volume || !openPrice) {
            throw new ValidationError('symbol, orderType, volume, and openPrice are required for ORDER_OPENED');
          }

          // Check if this is a master account
          const account = await MT5Account.findById(accountId);
          const isMasterAccount = account?.accountType === 'master';

          // Extract master ticket from comment if this is a slave trade
          let masterAccountId: string | undefined;
          let masterTicket: number | undefined;
          if (!isMasterAccount && comment) {
            // Comment format: "Copy from Master #12345 Ticket #67890"
            const masterMatch = comment.match(/Master #(\d+).*Ticket #(\d+)/);
            if (masterMatch) {
              const masterLoginId = masterMatch[1];
              masterTicket = parseInt(masterMatch[2]);
              // Find master account by login ID
              const masterAcc = await MT5Account.findOne({ loginId: masterLoginId, accountType: 'master' });
              if (masterAcc) {
                masterAccountId = masterAcc._id.toString();
              }
            }
          }

          await Trade.findOneAndUpdate(
            {
              accountId,
              ticket,
            },
            {
              accountId,
              ticket,
              symbol,
              orderType: orderType as 'BUY' | 'SELL',
              volume,
              openPrice,
              currentPrice: openPrice, // Initially same as open price
              sl: sl || undefined,
              tp: tp || undefined,
              comment: comment || '',
              status: 'open',
              openTime: new Date(),
              profit: 0,
              swap: 0,
              commission: 0,
              sourceType: isMasterAccount ? 'master_copy' : masterAccountId ? 'master_copy' : 'manual',
              masterAccountId: isMasterAccount ? accountId : masterAccountId,
              masterTicket: isMasterAccount ? ticket : masterTicket,
              lastUpdate: new Date(),
            },
            {
              upsert: true,
              new: true,
            }
          );

          logger.info(`Trade opened: Ticket ${ticket} on account ${accountId}`);

          // If this is a master account, trigger signal detection and processing
          if (isMasterAccount) {
            // Trigger signal detection asynchronously
            this.processMasterTrade(accountId, ticket, 'OPEN').catch((error) => {
              logger.error(`Error processing master trade signal:`, error);
            });
          }
          break;

        case 'ORDER_CLOSED':
          // Update trade record
          const closedTrade = await Trade.findOneAndUpdate(
            {
              accountId,
              ticket,
            },
            {
              currentPrice: closePrice || undefined,
              profit: profit || 0,
              status: 'closed',
              closeTime: new Date(),
              lastUpdate: new Date(),
            },
            {
              new: true,
            }
          );

          if (!closedTrade) {
            logger.warn(`Trade close reported but trade not found: Ticket ${ticket} on account ${accountId}`);
          } else {
            logger.info(`Trade closed: Ticket ${ticket} on account ${accountId}, Profit: ${profit}`);

            // If this is a master account, trigger signal detection
            const account = await MT5Account.findById(accountId);
            if (account?.accountType === 'master') {
              this.processMasterTrade(accountId, ticket, 'CLOSE').catch((error) => {
                logger.error(`Error processing master trade close signal:`, error);
              });
            }
          }
          break;

        case 'ORDER_MODIFIED':
          // Update SL/TP
          await Trade.findOneAndUpdate(
            {
              accountId,
              ticket,
            },
            {
              sl: sl || undefined,
              tp: tp || undefined,
              updatedAt: new Date(),
            }
          );

          logger.info(`Trade modified: Ticket ${ticket} on account ${accountId}`);
          break;

        case 'ORDER_FAILED':
          // Log failed order
          logger.error(`Order failed: Ticket ${ticket} on account ${accountId}, Error: ${error || 'Unknown error'}`);
          break;

        default:
          logger.warn(`Unknown event type: ${eventType} for ticket ${ticket}`);
      }

      res.json({
        success: true,
        message: 'Trade update processed',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Process master trade and trigger copy trading
   */
  private async processMasterTrade(
    accountId: string,
    ticket: number,
    eventType: 'OPEN' | 'CLOSE' | 'MODIFY'
  ): Promise<void> {
    try {
      // Get the trade details
      const trade = await Trade.findOne({
        accountId,
        ticket,
      });

      if (!trade) {
        logger.warn(`Trade not found for processing: Ticket ${ticket} on account ${accountId}`);
        return;
      }

      // Create master trade signal
      const { MasterTradeSignal } = await import('../models');
      const existingSignal = await MasterTradeSignal.findOne({
        masterAccountId: accountId,
        ticket,
        eventType,
        status: 'pending',
      });

      if (existingSignal) {
        logger.debug(`Signal already exists for ticket ${ticket}, event ${eventType}`);
        return;
      }

      const signal = new MasterTradeSignal({
        masterAccountId: accountId,
        ticket: trade.ticket,
        symbol: trade.symbol,
        orderType: trade.orderType,
        volume: trade.volume,
        openPrice: trade.openPrice,
        sl: trade.sl,
        tp: trade.tp,
        eventType,
        status: 'pending',
        commandsGenerated: 0,
        commandsExecuted: 0,
      });

      await signal.save();
      logger.info(`Master trade signal created: ${signal._id} for account ${accountId}, ticket ${ticket}`);

      // Process the signal immediately
      await tradeExecutionService.processMasterTradeSignal(signal._id.toString());
    } catch (error: any) {
      logger.error(`Error in processMasterTrade:`, error);
      throw error;
    }
  }
}

export const mt5WebhookController = new MT5WebhookController();

