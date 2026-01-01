import { Request, Response, NextFunction } from 'express';
import { Command } from '../models';
import { commandQueueService } from '../services/commands/commandQueueService';
import { ValidationError } from '../utils/errors';
import { COMMAND_TYPES, SOURCE_TYPES, COMMAND_STATUS } from '../config/constants';
import { body } from 'express-validator';

export class CommandController {
  /**
   * Create command (from web terminal)
   * POST /api/commands
   */
  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const {
        accountId,
        commandType,
        symbol,
        volume,
        slPips,
        tpPips,
        sl,
        tp,
        ticket,
        modifyTicket,
        newSl,
        newTp,
      } = req.body;

      // Validate command type
      if (!Object.values(COMMAND_TYPES).includes(commandType)) {
        throw new ValidationError('Invalid command type');
      }

      // Create command
      const command = new Command({
        targetAccountId: accountId,
        commandType,
        symbol,
        volume,
        slPips,
        tpPips,
        sl,
        tp,
        ticket,
        modifyTicket,
        newSl,
        newTp,
        sourceType: SOURCE_TYPES.MANUAL,
        status: COMMAND_STATUS.PENDING,
        priority: 5,
      });

      // Add to queue
      await commandQueueService.enqueueCommand(accountId, command);

      res.status(201).json({
        success: true,
        message: 'Command created successfully',
        data: command,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get commands (with filters)
   * GET /api/commands
   */
  getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new ValidationError('User not authenticated');
      }

      const { accountId, status, limit = 50 } = req.query;

      const query: any = {};

      if (accountId) {
        query.targetAccountId = accountId;
      }

      if (status) {
        query.status = status;
      }

      const commands = await Command.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit as string))
        .populate('targetAccountId', 'accountName loginId');

      res.json({
        success: true,
        data: commands,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get command by ID
   * GET /api/commands/:id
   */
  getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const command = await Command.findById(req.params.id).populate(
        'targetAccountId',
        'accountName loginId'
      );

      if (!command) {
        throw new ValidationError('Command not found');
      }

      res.json({
        success: true,
        data: command,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cancel pending command
   * DELETE /api/commands/:id
   */
  cancel = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const command = await Command.findById(req.params.id);

      if (!command) {
        throw new ValidationError('Command not found');
      }

      if (command.status !== COMMAND_STATUS.PENDING) {
        throw new ValidationError('Only pending commands can be cancelled');
      }

      command.status = COMMAND_STATUS.EXPIRED;
      await command.save();

      await commandQueueService.dequeueCommand(command._id.toString());

      res.json({
        success: true,
        message: 'Command cancelled successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}

export const commandController = new CommandController();

// Validation rules
export const createCommandValidation = [
  body('accountId').notEmpty().withMessage('Account ID is required'),
  body('commandType').isIn(Object.values(COMMAND_TYPES)).withMessage('Invalid command type'),
  body('symbol').optional().trim().notEmpty(),
  body('volume').optional().isFloat({ min: 0.01 }).withMessage('Volume must be at least 0.01'),
];

