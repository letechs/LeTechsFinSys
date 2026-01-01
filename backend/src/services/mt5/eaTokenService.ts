import { v4 as uuidv4 } from 'uuid';
import { MT5Account } from '../../models';
import { logger } from '../../utils/logger';

export class EATokenService {
  /**
   * Generate a new EA token (UUID v4)
   */
  generateToken(): string {
    return uuidv4();
  }

  /**
   * Regenerate EA token for an account
   */
  async regenerateToken(accountId: string): Promise<string> {
    const newToken = this.generateToken();

    await MT5Account.findByIdAndUpdate(accountId, {
      eaToken: newToken,
    });

    logger.info(`EA token regenerated for account: ${accountId}`);

    return newToken;
  }

  /**
   * Validate EA token format
   */
  isValidToken(token: string): boolean {
    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(token);
  }
}

export const eaTokenService = new EATokenService();

