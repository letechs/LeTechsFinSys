import { MT5Account, Trade, Command } from '../../models';
import { ACCOUNT_TYPES, COMMAND_STATUS } from '../../config/constants';
import { logger } from '../../utils/logger';
import { detectMasterTrades } from '../copyTrading/signalDetectionService';
import { evaluateRules } from '../trading/ruleService';
import { cacheService, CachedAccountData } from '../realtime/cacheService';
import { webSocketService, AccountUpdate, TradeUpdate } from '../realtime/websocketService';

export interface HeartbeatData {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  openTrades: Array<{
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    sl?: number;
    tp?: number;
    swap?: number;
    commission?: number;
    magicNumber?: number;
    comment?: string;
    openTime: string;
  }>;
  executedCommands?: Array<{
    commandId: string;
    status: 'success' | 'failed';
    orderTicket?: number;
    error?: string;
    errorCode?: number;
  }>;
  mt5Version?: string;
  eaVersion?: string;
}

export class HeartbeatService {
  // Store previous trade snapshots for master accounts
  private masterTradeSnapshots: Map<string, number[]> = new Map();

  /**
   * Process heartbeat from EA
   * Commercial-grade: Uses Redis cache + WebSocket for real-time updates
   * Does NOT store trading data in DB (only user/copy link data)
   */
  async processHeartbeat(accountId: string, data: HeartbeatData): Promise<void> {
    try {
      // Normalize accountId to string (handle ObjectId, string, etc.)
      const accountIdStr = String(accountId || '').trim();
      if (!accountIdStr) {
        return;
      }

      // Check MongoDB connection first
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        return; // Exit early if DB not connected
      }


      // 1. Cache account data in Redis (for fast retrieval, 2s TTL)
      try {
        const cachedData: CachedAccountData = {
          balance: data.balance || 0,
          equity: data.equity || 0,
          margin: data.margin || 0,
          freeMargin: data.freeMargin || 0,
          marginLevel: data.marginLevel || 0,
          connectionStatus: 'online',
          lastHeartbeat: new Date().toISOString(),
          openTrades: data.openTrades || [],
          timestamp: new Date().toISOString(),
        };
        await cacheService.cacheAccountData(accountIdStr, cachedData);
      } catch (error: any) {
        // Continue - caching is optional
      }

      // 2. Emit real-time WebSocket update (instant frontend update)
      try {
        const accountUpdate: AccountUpdate = {
          accountId: accountIdStr,
          balance: data.balance,
          equity: data.equity,
          margin: data.margin,
          freeMargin: data.freeMargin,
          marginLevel: data.marginLevel,
          connectionStatus: 'online',
          lastHeartbeat: new Date(),
        };
        webSocketService.emitAccountUpdate(accountUpdate);
      } catch (error: any) {
        logger.error(`Failed to emit WebSocket update for ${accountIdStr}:`, error);
        // Continue - WebSocket is optional
      }

      // 3. Update only connection status in DB (minimal write)
      try {
        await MT5Account.findByIdAndUpdate(
          accountIdStr,
          {
            lastHeartbeat: new Date(),
            connectionStatus: 'online',
          },
          { new: false, runValidators: false }
        );
      } catch (error: any) {
        logger.error(`Error updating account connection status for ${accountIdStr}:`, error);
        // Continue even if this fails
      }

      // 4. Process trade events (detect new/closed trades for copy trading)
      if (data.openTrades && Array.isArray(data.openTrades)) {
        try {
          // Emit trade updates via WebSocket (real-time)
          await this.processTradeEvents(accountIdStr, data.openTrades);
        } catch (error) {
          logger.error(`Error processing trade events for ${accountIdStr}:`, error);
          // Continue even if this fails
        }
      }

      // 5. Process command acknowledgments
      if (data.executedCommands && data.executedCommands.length > 0) {
        try {
          await this.processCommandAcks(data.executedCommands);
        } catch (error) {
          logger.error(`Error processing command acks for ${accountIdStr}:`, error);
          // Continue even if this fails
        }
      }

      // 6. Detect master trades (if this is a master account) - for copy trading
      try {
        const account = await MT5Account.findById(accountIdStr).lean();
        if (account && account.accountType === ACCOUNT_TYPES.MASTER) {
          const openTrades = data.openTrades || [];
          console.log(`[CLOSE-DETECT] 📥 Heartbeat received: Master ${accountIdStr.substring(0, 8)}... | Open trades: ${openTrades.length}`);
          await detectMasterTrades(accountIdStr, openTrades, this.masterTradeSnapshots);
        }
      } catch (error) {
        logger.error(`Error detecting master trades for ${accountIdStr}:`, error);
        // Continue even if this fails
      }

      // 7. Evaluate rules (optional, don't fail if it errors)
      try {
        if (data.openTrades && Array.isArray(data.openTrades)) {
          await evaluateRules(accountIdStr, data);
        }
      } catch (ruleError) {
        // Rules evaluation is optional, don't fail heartbeat if it errors
      }
    } catch (error: any) {
      logger.error(`Critical error processing heartbeat for account ${accountId}:`, error);
      // Don't throw - allow heartbeat to succeed even if some processing fails
      // This ensures EA doesn't get disconnected
    }
  }

  /**
   * Process trade events and emit via WebSocket
   * Does NOT store trades in DB - only for real-time display
   */
  private async processTradeEvents(
    accountId: string,
    openTrades: HeartbeatData['openTrades']
  ): Promise<void> {
    if (!openTrades || !Array.isArray(openTrades)) {
      return;
    }

    // Get previous trade snapshot
    const previousTickets = this.masterTradeSnapshots.get(accountId) || [];
    const currentTickets = openTrades.map(t => t.ticket).filter(t => t != null);

    // Detect new trades
    const newTrades = openTrades.filter(t => !previousTickets.includes(t.ticket));
    for (const trade of newTrades) {
      const tradeUpdate: TradeUpdate = {
        accountId,
        type: 'open',
        trade: {
          ticket: trade.ticket,
          symbol: trade.symbol || '',
          type: trade.type || 'BUY',
          volume: trade.volume || 0,
          openPrice: trade.openPrice || 0,
          currentPrice: trade.currentPrice || trade.openPrice || 0,
          profit: trade.profit || 0,
          sl: trade.sl,
          tp: trade.tp,
          openTime: trade.openTime || new Date().toISOString(),
        },
      };
      webSocketService.emitTradeUpdate(tradeUpdate);
    }

    // Detect closed trades
    const closedTickets = previousTickets.filter(t => !currentTickets.includes(t));
    for (const ticket of closedTickets) {
      // Find the trade data before it was closed (from previous snapshot)
      const closedTrade = openTrades.find(t => t.ticket === ticket);
      if (closedTrade) {
        const tradeUpdate: TradeUpdate = {
          accountId,
          type: 'close',
          trade: {
            ticket: closedTrade.ticket,
            symbol: closedTrade.symbol || '',
            type: closedTrade.type || 'BUY',
            volume: closedTrade.volume || 0,
            openPrice: closedTrade.openPrice || 0,
            currentPrice: closedTrade.currentPrice || closedTrade.openPrice || 0,
            profit: closedTrade.profit || 0,
            sl: closedTrade.sl,
            tp: closedTrade.tp,
            openTime: closedTrade.openTime || new Date().toISOString(),
          },
        };
        webSocketService.emitTradeUpdate(tradeUpdate);
      }
    }

    // NOTE: Snapshot update is handled by detectMasterTrades() after closed trade detection
    // Do NOT update snapshot here - it would prevent closed trade detection
  }

  // Removed updateAccountStatus and updateTrades methods
  // Trading data is now cached in Redis and sent via WebSocket
  // DB only stores connection status (minimal writes)

  /**
   * Process command execution acknowledgments
   */
  private async processCommandAcks(
    acks: HeartbeatData['executedCommands']
  ): Promise<void> {
    if (!acks) return;

    for (const ack of acks) {
      const command = await Command.findById(ack.commandId);

      if (!command) {
        continue;
      }

      command.status = ack.status === 'success' ? COMMAND_STATUS.EXECUTED : COMMAND_STATUS.FAILED;
      command.executedAt = new Date();
      command.executionResult = {
        success: ack.status === 'success',
        orderTicket: ack.orderTicket,
        error: ack.error,
        errorCode: ack.errorCode,
      };

      await command.save();
    }
  }
}

export const heartbeatService = new HeartbeatService();

