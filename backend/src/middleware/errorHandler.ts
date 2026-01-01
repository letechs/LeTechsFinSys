import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config/env';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error
  logger.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  // Handle known errors
  if (err instanceof AppError) {
    if (!res.headersSent) {
      // Clean message to avoid JSON issues - no stack trace in response
      const cleanMessage = (err.message || 'An error occurred').substring(0, 200);
      res.status(err.statusCode).json({
        success: false,
        message: cleanMessage,
      });
    }
    return;
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    if (!res.headersSent) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
      });
    }
    return;
  }

  // Handle Mongoose duplicate key errors
  if ((err as any).code === 11000) {
    const field = Object.keys((err as any).keyPattern)[0];
    res.status(409).json({
      success: false,
      message: `${field} already exists`,
    });
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      message: 'Invalid token',
    });
    return;
  }

  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      message: 'Token expired',
    });
    return;
  }

  // Default error - ensure we don't send response twice
  if (!res.headersSent) {
    const errorMessage = config.nodeEnv === 'production' 
      ? 'Internal server error' 
      : (err.message || 'Internal server error');
    
    // Clean the error message to avoid JSON issues
    const cleanMessage = errorMessage.substring(0, 200); // Limit length
    
    res.status(500).json({
      success: false,
      message: cleanMessage,
    });
  }
};

// 404 handler
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
};

