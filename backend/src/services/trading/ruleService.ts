import { MT5Account, Command, ICommand, IMT5Account } from '../../models';
import { COMMAND_TYPES, COMMAND_STATUS, SOURCE_TYPES } from '../../config/constants';
import { logger } from '../../utils/logger';
import { commandQueueService } from '../commands/commandQueueService';

export interface HeartbeatData {
  equity: number;
  balance: number;
  openTrades: any[];
}

/**
 * Evaluate all rules for an account
 */
export async function evaluateRules(
  accountId: string,
  data: HeartbeatData
): Promise<ICommand[]> {
  const account = await MT5Account.findById(accountId);

  if (!account) {
    return [];
  }

  const commands: ICommand[] = [];

  // Check equity stop
  const equityStopCmd = await checkEquityStop(account, data.equity);
  if (equityStopCmd) {
    commands.push(equityStopCmd);
  }

  // Check daily loss limit
  const dailyLossCmd = await checkDailyLossLimit(account, data.balance, data.equity);
  if (dailyLossCmd) {
    commands.push(dailyLossCmd);
  }

  // Check max trades limit
  const maxTradesCmd = await checkMaxTrades(account, data.openTrades.length);
  if (maxTradesCmd) {
    commands.push(maxTradesCmd);
  }

  // Enqueue all commands
  for (const cmd of commands) {
    await commandQueueService.enqueueCommand(accountId, cmd);
  }

  return commands;
}

/**
 * Check equity stop rule
 */
async function checkEquityStop(
  account: IMT5Account,
  equity: number
): Promise<ICommand | null> {
  if (!account.rules.equityStop.enabled) {
    return null;
  }

  if (equity <= account.rules.equityStop.threshold) {
    logger.warn(`Equity stop triggered for account ${account._id}: ${equity} <= ${account.rules.equityStop.threshold}`);

    return new Command({
      targetAccountId: account._id,
      commandType: COMMAND_TYPES.CLOSE_ALL,
      sourceType: SOURCE_TYPES.RULE,
      status: COMMAND_STATUS.PENDING,
      priority: 10, // High priority
    });
  }

  return null;
}

/**
 * Check daily loss limit
 */
async function checkDailyLossLimit(
  account: IMT5Account,
  balance: number,
  equity: number
): Promise<ICommand | null> {
  if (!account.rules.dailyLossLimit.enabled) {
    return null;
  }

  const loss = balance - equity;
  const lossPercent = (loss / balance) * 100;

  if (lossPercent > account.rules.dailyLossLimit.maxLossPercent) {
    logger.warn(`Daily loss limit triggered for account ${account._id}: ${lossPercent}% > ${account.rules.dailyLossLimit.maxLossPercent}%`);

    // Pause copy trading (we'll need a PAUSE_COPY command or similar)
    return new Command({
      targetAccountId: account._id,
      commandType: COMMAND_TYPES.PAUSE_COPY,
      sourceType: SOURCE_TYPES.RULE,
      status: COMMAND_STATUS.PENDING,
      priority: 9,
    });
  }

  return null;
}

/**
 * Check max trades limit
 */
async function checkMaxTrades(
  account: IMT5Account,
  openTradesCount: number
): Promise<ICommand | null> {
  if (!account.rules.maxTrades.enabled) {
    return null;
  }

  if (openTradesCount >= account.rules.maxTrades.maxOpenTrades) {
    logger.warn(`Max trades limit reached for account ${account._id}: ${openTradesCount} >= ${account.rules.maxTrades.maxOpenTrades}`);

    // Don't create new trades (this is handled in command generation)
    // Just log the warning
    return null;
  }

  return null;
}

/**
 * Check symbol filter
 */
export function checkSymbolFilter(symbol: string, account: IMT5Account): boolean {
  if (!account.rules.symbolFilter.enabled) {
    return true; // No filter, allow all
  }

  // Check if symbol is excluded
  if (account.rules.symbolFilter.excludedSymbols.includes(symbol)) {
    return false;
  }

  // Check if only specific symbols are allowed
  if (account.rules.symbolFilter.allowedSymbols.length > 0) {
    return account.rules.symbolFilter.allowedSymbols.includes(symbol);
  }

  return true; // No restrictions
}

/**
 * Check time filter
 */
export function checkTimeFilter(account: IMT5Account): boolean {
  if (!account.rules.timeFilter.enabled) {
    return true; // No filter, allow all times
  }

  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const start = account.rules.timeFilter.allowedHours.start;
  const end = account.rules.timeFilter.allowedHours.end;

  // Simple time comparison (can be improved)
  return currentTime >= start && currentTime <= end;
}

