import { MT5Account, MasterTradeSignal, Trade, Command } from '../../models';
import { logger } from '../../utils/logger';
import { tradeExecutionService } from './tradeExecutionService';
import { SOURCE_TYPES } from '../../config/constants';

/**
 * Normalize price value (SL/TP) to a consistent representation
 * Converts null, undefined, NaN, or <= 0 to 0
 * Rounds to 5 decimal places for consistency
 */
function normalizePrice(value?: number | null): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 0;
  }
  // CRITICAL: Only convert to 0 if value is explicitly 0 or negative
  // Don't convert small positive values (they might be valid SL/TP)
  if (value <= 0) {
    return 0;
  }
  // Round to 5 decimal places for consistency (handles floating point precision issues)
  return Number(value.toFixed(5));
}

/**
 * Detect new master trades by comparing snapshots
 */
export async function detectMasterTrades(
  masterAccountId: string,
  currentTrades: Array<{
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    sl?: number;
    tp?: number;
  }>,
  snapshots: Map<string, number[]>
): Promise<void> {
  // Get previous snapshot
  let previousTickets = snapshots.get(masterAccountId) || [];

  // Initialize snapshot from DB if empty (backend restart)
  if (previousTickets.length === 0) {
    const dbTrades = await Trade.find({
      accountId: masterAccountId,
      status: 'open',
    }).select('ticket').lean();

    previousTickets = dbTrades.map(t => t.ticket).filter(t => t != null && t > 0);

    if (previousTickets.length > 0) {
      snapshots.set(masterAccountId, previousTickets);
    }
  }

  // Current tickets
  const currentTickets = currentTrades.map(t => t.ticket).filter(t => t != null && t > 0);

  // Log snapshot comparison for close detection debugging
  logger.debug('Snapshot comparison for close detection', {
    previous: previousTickets.length > 0 ? previousTickets.join(', ') : 'empty',
    current: currentTickets.length > 0 ? currentTickets.join(', ') : 'empty',
  });

  // First run handling
  const isFirstRun = previousTickets.length === 0 && currentTickets.length > 0;
  if (isFirstRun) {
    const trulyNewTrades: typeof currentTrades = [];
    for (const trade of currentTrades) {
      if (trade.ticket) {
        const dbTrade = await Trade.findOne({ accountId: masterAccountId, ticket: trade.ticket });
        if (!dbTrade) trulyNewTrades.push(trade);
      }
    }
    for (const trade of trulyNewTrades) {
      await createMasterTradeSignal(masterAccountId, trade, 'OPEN');
    }
    for (const trade of currentTrades) {
      if (trade.ticket) await storeTradeInDatabase(masterAccountId, trade);
    }
    snapshots.set(masterAccountId, currentTickets);
    return;
  }

  // Detect new trades
  const newTickets: number[] = [];
  for (const ticket of currentTickets) {
    const existingTrade = await Trade.findOne({ accountId: masterAccountId, ticket });
    if (!existingTrade) newTickets.push(ticket);
  }

  const trulyNewTickets: number[] = [];
  for (const ticket of newTickets) {
    const dbTrade = await Trade.findOne({ accountId: masterAccountId, ticket });
    const existingCommands = await Command.countDocuments({
      masterAccountId,
      comment: new RegExp(`Ticket #${ticket}`),
    });
    const existingSignal = await MasterTradeSignal.findOne({
      masterAccountId,
      ticket,
      eventType: 'OPEN',
    });
    if (!dbTrade && existingCommands === 0 && !existingSignal) {
      trulyNewTickets.push(ticket);
    }
  }

  // Process new trades
  if (trulyNewTickets.length > 0) {
    for (const ticket of trulyNewTickets) {
      const trade = currentTrades.find(t => t.ticket === ticket);
      if (trade) await storeTradeInDatabase(masterAccountId, trade);
    }
    await Promise.all(trulyNewTickets.map(async (ticket) => {
      const trade = currentTrades.find(t => t.ticket === ticket);
      if (trade) {
        try {
          await createMasterTradeSignal(masterAccountId, trade, 'OPEN');
        } catch (error: any) {
          logger.error(`Error creating signal for ticket ${ticket}:`, error);
        }
      }
    }));
  }

  // Detect closed trades
  const closedTickets = previousTickets.filter(ticket => !currentTickets.includes(ticket));
  let trulyClosedTickets: number[] = [];
  
  if (closedTickets.length > 0) {
    logger.debug('Closed trades detected', { count: closedTickets.length, tickets: closedTickets });
    
    for (const ticket of closedTickets) {
      const trade = await Trade.findOne({ accountId: masterAccountId, ticket, status: 'open' });
      if (trade) {
        logger.debug('Processing closed trade', { ticket, symbol: trade.symbol, orderType: trade.orderType, volume: trade.volume });
        
        // ✅ Add to trulyClosedTickets so summary and downstream logic see it
        trulyClosedTickets.push(ticket);
  
        // Create CLOSE signal immediately
        try {
          const signal = await createMasterTradeSignal(masterAccountId, {
            ticket: trade.ticket,
            symbol: trade.symbol,
            type: trade.orderType,
            volume: trade.volume,
            openPrice: trade.openPrice,
            sl: trade.sl,
            tp: trade.tp,
          }, 'CLOSE');
          
          if (signal) {
            logger.debug('CLOSE signal created', { signalId: signal._id, ticket });
          } else {
            logger.debug('CLOSE signal skipped (duplicate prevented)', { ticket });
          }
        } catch (error: any) {
          logger.error(`Error creating CLOSE signal for ticket ${ticket}:`, error);
        }
  
        // Then mark trade closed
        trade.status = 'closed';
        trade.closeTime = new Date();
        await trade.save();
        logger.debug('Trade marked as closed in DB', { ticket });
      } else {
        logger.debug('Trade not found or already closed', { ticket });
      }
    }
    
    if (trulyClosedTickets.length > 0) {
      logger.debug('Closed trades summary', { count: trulyClosedTickets.length, tickets: trulyClosedTickets });
    }
  } else if (previousTickets.length > 0 || currentTickets.length > 0) {
    logger.debug('No closed trades detected', { previousCount: previousTickets.length, currentCount: currentTickets.length });
  }
  


  // Detect modify signals
  const modifySignals: Array<{ ticket: number; sl?: number; tp?: number }> = [];
  for (const currentTrade of currentTrades) {
    if (!currentTrade.ticket) continue;
    const dbTrade = await Trade.findOne({ accountId: masterAccountId, ticket: currentTrade.ticket, status: 'open' });
    if (!dbTrade) continue;
    const currentSL = normalizePrice(currentTrade.sl);
    const currentTP = normalizePrice(currentTrade.tp);
    const dbSL = normalizePrice(dbTrade.sl);
    const dbTP = normalizePrice(dbTrade.tp);
    if (currentSL !== dbSL || currentTP !== dbTP) {
      modifySignals.push({ ticket: currentTrade.ticket, sl: currentSL, tp: currentTP });
      await Trade.updateOne(
        { accountId: masterAccountId, ticket: currentTrade.ticket, status: 'open' },
        { $set: { sl: currentSL, tp: currentTP, lastUpdate: new Date() } }
      );
    }
  }
  if (modifySignals.length > 0) {
    await Promise.all(modifySignals.map(async ({ ticket, sl, tp }) => {
      const trade = currentTrades.find(t => t.ticket === ticket);
      if (trade) {
        try {
          await createMasterTradeSignal(masterAccountId, {
            ticket: trade.ticket,
            symbol: trade.symbol,
            type: trade.type,
            volume: trade.volume,
            openPrice: trade.openPrice,
            sl: normalizePrice(sl),
            tp: normalizePrice(tp),
          }, 'MODIFY');
        } catch (error: any) {
          logger.error(`Error creating MODIFY signal for ticket ${ticket}:`, error);
        }
      }
    }));
  }

  // ✅ Update snapshot AFTER all signals are processed
  snapshots.set(masterAccountId, currentTickets);
}

/**
 * Create master trade signal
 */
async function createMasterTradeSignal(
  masterAccountId: string,
  trade: {
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    sl?: number;
    tp?: number;
  },
  eventType: 'OPEN' | 'CLOSE' | 'MODIFY'
): Promise<any> {
  // CRITICAL: Only prevent duplicate OPEN signals
  // MODIFY and CLOSE signals must be allowed multiple times (SL/TP can change, close must always execute)
  if (eventType === 'OPEN') {
    const existing = await MasterTradeSignal.findOne({
      masterAccountId,
      ticket: trade.ticket,
      eventType,
    });

    if (existing) {
      return existing; // Return existing signal
    }

    // CRITICAL: Only check for duplicate OPEN commands (BUY/SELL)
    // MODIFY and CLOSE commands are allowed even if BUY command exists
    const existingCommands = await Command.countDocuments({
      masterAccountId: masterAccountId,
      symbol: trade.symbol,
      commandType: trade.type === 'BUY' ? 'BUY' : 'SELL',
      comment: new RegExp(`Ticket #${trade.ticket}`),
      // Don't filter by status - if command exists in ANY status, it means it was already processed
      // Don't filter by targetAccountId - check ALL accounts to prevent any duplicate
    });

    if (existingCommands > 0) {
      return null; // Commands already exist, skip signal creation
    }
  }
  // For MODIFY and CLOSE, always allow signal creation (they can execute multiple times)

  // Create signal with normalized SL/TP for consistency
  const signal = new MasterTradeSignal({
    masterAccountId,
    ticket: trade.ticket,
    symbol: trade.symbol,
    orderType: trade.type,
    volume: trade.volume,
    openPrice: trade.openPrice,
    sl: normalizePrice(trade.sl), // Normalize to ensure consistent representation
    tp: normalizePrice(trade.tp), // Normalize to ensure consistent representation
    eventType,
    status: 'pending',
    commandsGenerated: 0,
    commandsExecuted: 0,
  });

  await signal.save();

  // Automatically process the signal to generate commands for slave accounts
  try {
    await tradeExecutionService.processMasterTradeSignal(signal._id.toString());
  } catch (error: any) {
    logger.error(`Error processing signal ${signal._id} automatically:`, error);
    // Don't throw - signal is saved, can be processed later
  }

  return signal; // Return the created signal
}

/**
 * Store trade in database
 */
async function storeTradeInDatabase(
  accountId: string,
  trade: {
    ticket: number;
    symbol: string;
    type: 'BUY' | 'SELL';
    volume: number;
    openPrice: number;
    currentPrice?: number;
    sl?: number;
    tp?: number;
  }
): Promise<void> {
  // Check if trade already exists
  const existing = await Trade.findOne({
    accountId,
    ticket: trade.ticket,
  });

  if (existing) {
    // Update existing trade with normalized SL/TP
    existing.currentPrice = trade.currentPrice || trade.openPrice;
    existing.sl = normalizePrice(trade.sl);
    existing.tp = normalizePrice(trade.tp);
    existing.lastUpdate = new Date();
    await existing.save();
    return;
  }

  // Create new trade with normalized SL/TP
  const newTrade = new Trade({
    accountId,
    ticket: trade.ticket,
    symbol: trade.symbol,
    orderType: trade.type,
    volume: trade.volume,
    openPrice: trade.openPrice,
    currentPrice: trade.currentPrice || trade.openPrice,
    sl: normalizePrice(trade.sl), // Normalize to ensure consistent representation
    tp: normalizePrice(trade.tp), // Normalize to ensure consistent representation
    status: 'open',
    openTime: new Date(),
    profit: 0,
    swap: 0,
    commission: 0,
    sourceType: SOURCE_TYPES.MASTER_TRADE,
    lastUpdate: new Date(),
  });

  await newTrade.save();
}



