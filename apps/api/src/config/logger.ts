/**
 * Logger Configuration — Pino
 *
 * Production-grade structured JSON logging with:
 * - Request tracing (requestId, userId)
 * - Performance metrics
 * - Log rotation
 * - Audit logging
 *
 * In development: pretty-printed output via pino-pretty
 * In production: raw JSON to stdout (consumed by log aggregators)
 */

import pino from 'pino';
import { env } from './env.js';

/** Log levels supported by the application */
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/** Standard log metadata shape */
export interface LogMetadata {
  requestId?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

/** Create a child logger with common bindings */
function createChildLogger(parent: pino.Logger, bindings: LogMetadata): pino.Logger {
  return parent.child(bindings);
}

/** Application-wide logger instance */
export const logger = pino({
  level: env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  
  // Enable serialisation for Error objects and raw objects
  serialize: {
    err: (err: Error) => ({
      name: err.name,
      message: err.message,
      stack: env.NODE_ENV === 'production' ? undefined : err.stack,
      cause: err.cause instanceof Error ? {
        name: err.cause.name,
        message: err.cause.message,
      } : undefined,
    }),
  },

  // Custom formatters
  formatters: {
    level: (label: string) => ({ level: label.toUpperCase() }),
    log: (obj: Record<string, unknown>) => {
      // Ensure timestamp is ISO format
      const timestamp = obj.timestamp ? new Date(obj.timestamp as string).toISOString() : new Date().toISOString();
      return {
        ...obj,
        timestamp,
        // Flatten nested structures for better querying
        level: obj.level,
        service: obj.service,
        requestId: obj.requestId,
        userId: obj.userId,
        endpoint: obj.endpoint,
      };
    },
  },

  // Pretty print in development
  transport: env.NODE_ENV === 'development'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname,service',
          customColors: 'err:red,warn:yellow,info:green,debug:gray',
        },
      }
    : undefined,

  // Redact sensitive fields from logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-api-key"]',
      'password',
      'passwordHash',
      'token',
      'accessToken',
      'refreshToken',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.apiKey',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },

  // Add timestamp in ISO format
  timestamp: () => `"timestamp":"${new Date().toISOString()}"`,

  // Level based on environment
  level: env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),
});

// Create contextual loggers for different modules
export const auditLogger = logger.child({ service: 'audit', level: 'info' });
export const errorLogger = logger.child({ service: 'error', level: 'error' });
export const performanceLogger = logger.child({ service: 'performance', level: 'debug' });

export default logger;

/**
 * Create a logger with standard context attached
 * Use this for module-specific logging with consistent context
 */
export function createModuleLogger(moduleName: string, baseContext?: LogMetadata) {
  const context = { service: moduleName, ...baseContext };
  return {
    fatal: (message: string, meta?: LogMetadata) => logger.fatal({ ...context, ...meta }, message),
    error: (message: string, meta?: LogMetadata) => logger.error({ ...context, ...meta }, message),
    warn: (message: string, meta?: LogMetadata) => logger.warn({ ...context, ...meta }, message),
    info: (message: string, meta?: LogMetadata) => logger.info({ ...context, ...meta }, message),
    debug: (message: string, meta?: LogMetadata) => logger.debug({ ...context, ...meta }, message),
    trace: (message: string, meta?: LogMetadata) => logger.trace({ ...context, ...meta }, message),
    
    // Helper for errors with stack traces
    errorWithStack: (message: string, error: Error, meta?: LogMetadata) => 
      logger.error({ ...context, ...meta, err: error, stack: error.stack }, message),
    
    // Helper for performance timing
    timing: (operation: string, durationMs: number, meta?: LogMetadata) =>
      logger.debug({ ...context, ...meta, operation, duration_ms: durationMs }, `Operation: ${operation}`),
  };
}
