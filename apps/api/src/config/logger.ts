/**
 * Logger Configuration — Pino
 *
 * Production-grade structured JSON logging with:
 * - Request tracing (requestId, userId)
 * - Performance metrics
 * - Log rotation (daily via pino-roll)
 * - Audit logging
 * - Persisted log files in logs/ directory
 *
 * In development: pretty-printed to console + JSON to log files
 * In production: raw JSON to stdout + JSON to log files
 *
 * Log files:
 *   logs/app.log       — all logs (rotated daily, 14-day retention)
 *   logs/error.log     — error + fatal only (rotated daily, 30-day retention)
 */

import pino from 'pino';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
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

// Ensure logs directory exists
const logsDir = resolve(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

/** Build multi-transport targets: console + log files */
function buildTransport(): pino.TransportMultiOptions {
  const targets: pino.TransportTargetOptions[] = [];

  // 1) Console output
  if (env.NODE_ENV === 'development') {
    targets.push({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        messageFormat: '{msg}',
      },
      level: 'debug',
    });
  } else {
    // Production: raw JSON to stdout
    targets.push({
      target: 'pino/file',
      options: { destination: 1 }, // fd 1 = stdout
      level: 'info',
    });
  }

  // 2) All logs → logs/app.log (rotated daily, 14-day retention)
  targets.push({
    target: 'pino-roll',
    options: {
      file: resolve(logsDir, 'app'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      limit: { count: 14 },
      mkdir: true,
    },
    level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  });

  // 3) Error logs → logs/error.log (rotated daily, 30-day retention)
  targets.push({
    target: 'pino-roll',
    options: {
      file: resolve(logsDir, 'error'),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      limit: { count: 30 },
      mkdir: true,
    },
    level: 'error',
  });

  return { targets };
}

/** Application-wide logger instance */
export const logger = pino({
  level: env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),

  // Error serializers
  serializers: {
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

  // Add timestamp in ISO format (leading comma required by pino's JSON concatenation)
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,

  // Multi-transport: console + file persistence
  transport: buildTransport(),

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
