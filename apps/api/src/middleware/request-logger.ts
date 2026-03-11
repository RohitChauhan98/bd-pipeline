/**
 * Request Logging Middleware
 *
 * Production-grade request/response logging with:
 * - Request ID tracking
 * - Performance metrics
 * - Error capture
 * - Structured JSON output
 */

import type { Request, Response } from 'express';
import { logger } from '../config/logger.js';

interface RequestLogOptions {
  /** Log request body (be careful with sensitive data) */
  logBody?: boolean;
  /** Log response body */
  logResponse?: boolean;
  /** Log headers (excluding sensitive ones) */
  logHeaders?: boolean;
  /** Paths to exclude from logging */
  excludePaths?: string[];
  /** Slow request threshold in ms */
  slowThreshold?: number;
}

/**
 * Create request logging middleware
 */
export function createRequestLogger(options: RequestLogOptions = {}): (
  req: Request,
  res: Response,
  next: () => void
) => void {
  const {
    logBody = false,
    logResponse = false,
    logHeaders = false,
    excludePaths = ['/health', '/api/docs', '/api/v1/health'],
    slowThreshold = 3000, // 3 seconds
  } = options;

  return function requestLogger(req: Request, res: Response, next: () => void): void {
    // Skip certain paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    const startTime = Date.now();
    const requestId = (req as any).requestId || `req_${Date.now()}`;
    
    // Build initial log data
    const logData: Record<string, unknown> = {
      requestId,
      method: req.method,
      url: req.url,
      path: req.path,
      query: Object.keys(req.query).length > 0 ? req.query : undefined,
      ip: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer'],
    };

    // Add body if configured (careful with passwords, tokens, etc.)
    if (logBody && req.body && Object.keys(req.body).length > 0) {
      // Exclude sensitive fields
      const safeBody = { ...req.body };
      delete safeBody.password;
      delete safeBody.passwordHash;
      delete safeBody.token;
      delete safeBody.accessToken;
      delete safeBody.refreshToken;
      delete safeBody.apiKey;
      logData.body = safeBody;
    }

    // Add headers if configured
    if (logHeaders) {
      logData.headers = {
        contentType: req.headers['content-type'],
        accept: req.headers['accept'],
        authorization: req.headers['authorization'] ? '[PRESENT]' : undefined,
      };
    }

    // Log request start
    logger.info(
      { ...logData, event: 'request_start' },
      `${req.method} ${req.path} - Request started`
    );

    // Use the 'finish' event instead of monkey-patching res.end
    // This avoids conflicts with pinoHttp's own res.end interception
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const isSlow = duration > slowThreshold;
      const isError = res.statusCode >= 400;

      // Build response log data
      const responseLogData: Record<string, unknown> = {
        ...logData,
        event: 'request_complete',
        statusCode: res.statusCode,
        duration_ms: duration,
        contentLength: res.getHeader('content-length'),
        isSlow,
        isError,
      };

      // Select log level based on status/duration
      if (res.statusCode >= 500) {
        logger.error(responseLogData, `${req.method} ${req.path} - ${res.statusCode} (${duration}ms) - ERROR`);
      } else if (res.statusCode >= 400) {
        logger.warn(responseLogData, `${req.method} ${req.path} - ${res.statusCode} (${duration}ms) - WARNING`);
      } else if (isSlow) {
        logger.warn(responseLogData, `${req.method} ${req.path} - ${res.statusCode} (${duration}ms) - SLOW`);
      } else {
        logger.info(responseLogData, `${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      }
    });

    next();
  };
}

/**
 * Simple request logger for general use
 */
export const requestLogger = createRequestLogger({
  logBody: false,
  excludePaths: ['/health', '/api/docs', '/api/v1/health'],
});

/**
 * Detailed request logger for debugging
 */
export const detailedRequestLogger = createRequestLogger({
  logBody: true,
  logResponse: true,
  logHeaders: true,
  excludePaths: ['/health', '/api/docs'],
});
