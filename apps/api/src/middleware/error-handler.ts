/**
 * Global Error Handler Middleware
 *
 * Catches all errors thrown in route handlers and middleware,
 * formats them into the standardized API error response shape,
 * and reports to Sentry in production.
 *
 * Error response shape:
 * {
 *   success: false,
 *   error: {
 *     code: "LEAD_NOT_FOUND",
 *     message: "Lead not found",
 *     status: 404,
 *     details: {}
 *   },
 *   requestId: "req_abc123"
 * }
 */

import type { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api-error.js';
import { logger, createModuleLogger } from '../config/logger.js';
import { env } from '../config/env.js';

const errorModuleLogger = createModuleLogger('error');

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Known ApiError — expected, return structured response
  if (err instanceof ApiError) {
    logger.warn(
      {
        requestId: req.requestId,
        userId: req.userId,
        path: req.path,
        method: req.method,
        statusCode: err.status,
        errorCode: err.code,
        errorMessage: err.message,
      },
      `API Error: ${err.code} - ${err.message}`
    );

    res.status(err.status).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        status: err.status,
        details: err.details,
      },
      requestId: req.requestId,
    });
    return;
  }

  // Unknown error — log full stack, return generic 500
  const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  errorModuleLogger.errorWithStack(
    `Unhandled error: ${err.message}`,
    err,
    {
      requestId: req.requestId,
      userId: req.userId,
      path: req.path,
      method: req.method,
      errorId,
      statusCode: 500,
    }
  );

  // Report to Sentry in production
  if (env.SENTRY_DSN) {
    // Sentry capture will be set up in index.ts
    // @sentry/node automatically captures from Express error handler
  }

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      status: 500,
      ...(env.NODE_ENV === 'development' ? { 
        stack: err.stack,
        errorId,
      } : {}),
    },
    requestId: req.requestId,
  });
}
