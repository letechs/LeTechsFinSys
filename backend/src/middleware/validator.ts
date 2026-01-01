import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ValidationError } from '../utils/errors';

// Middleware to check validation results
export const validate = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => {
      const field = (err as any).path || (err as any).param || 'unknown';
      return `${field}: ${err.msg}`;
    });
    
    // Get the first error message for simplicity
    const firstError = errors.array()[0];
    const errorMessage = firstError.msg || 'Validation failed';
    
    const validationError = new ValidationError(errorMessage);
    return next(validationError);
  }
  
  next();
};

// Helper to run validations
export const runValidations = (validations: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Run all validations
      await Promise.all(validations.map(validation => validation.run(req)));
      
      // Check results
      validate(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

