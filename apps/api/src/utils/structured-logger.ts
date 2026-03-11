/**
 * Structured Logging Utilities
 *
 * Production-grade logging helpers for:
 * - Request context binding
 * - Workflow/operation tracking
 * - Performance monitoring
 * - Audit logging
 */

import { logger, LogMetadata, createModuleLogger } from '../config/logger.js';

/**
 * Bind standard request context to metadata
 */
export function bindRequestContext(
  requestId: string,
  options?: {
    userId?: string;
    endpoint?: string;
    method?: string;
  }
): LogMetadata {
  return {
    requestId,
    ...(options?.userId && { userId: options.userId }),
    ...(options?.endpoint && { endpoint: options.endpoint }),
    ...(options?.method && { method: options.method }),
  };
}

/**
 * Workflow Logger - Track multi-step business operations
 *
 * Usage:
 *   const workflow = new WorkflowLogger('LeadEnrichment', { leadId: '123' });
 *   workflow.start();
 *   // ... do steps ...
 *   workflow.step('FetchCompanyData', { company: 'Acme' });
 *   workflow.step('FindContacts', { contacts: 5 });
 *   workflow.complete({ leadsFound: 10 });
 */
export class WorkflowLogger {
  private workflowName: string;
  private context: LogMetadata;
  private startTime: number;
  private steps: Array<{ name: string; timestamp: number; metadata?: LogMetadata }> = [];

  constructor(workflowName: string, initialContext?: LogMetadata) {
    this.workflowName = workflowName;
    this.context = initialContext || {};
    this.startTime = Date.now();
  }

  setContext(context: LogMetadata): void {
    this.context = { ...this.context, ...context };
  }

  setRequestId(requestId: string): void {
    this.context.requestId = requestId;
  }

  setUserId(userId: string): void {
    this.context.userId = userId;
  }

  /** Log workflow start */
  start(metadata?: LogMetadata): void {
    this.steps.push({ name: 'START', timestamp: Date.now(), metadata });
    logger.info(
      { ...this.context, ...metadata, workflow: this.workflowName, event: 'workflow_start' },
      `Workflow started: ${this.workflowName}`
    );
  }

  /** Log a workflow step */
  step(stepName: string, metadata?: LogMetadata): void {
    const timestamp = Date.now();
    this.steps.push({ name: stepName, timestamp, metadata });
    logger.debug(
      { ...this.context, ...metadata, workflow: this.workflowName, step: stepName },
      `Workflow step: ${stepName}`
    );
  }

  /** Log workflow failure */
  fail(error: Error, metadata?: LogMetadata): void {
    const duration = Date.now() - this.startTime;
    logger.error(
      {
        ...this.context,
        ...metadata,
        workflow: this.workflowName,
        event: 'workflow_failed',
        error: error.message,
        stack: error.stack,
        duration_ms: duration,
        steps: this.steps.map(s => s.name),
      },
      `Workflow failed: ${this.workflowName} - ${error.message}`
    );
  }

  /** Log workflow completion */
  complete(metadata?: LogMetadata): void {
    const duration = Date.now() - this.startTime;
    logger.info(
      {
        ...this.context,
        ...metadata,
        workflow: this.workflowName,
        event: 'workflow_complete',
        duration_ms: duration,
        steps: this.steps.map(s => s.name),
      },
      `Workflow completed: ${this.workflowName} (${duration}ms)`
    );
  }

  /** Get workflow duration so far */
  getDuration(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Performance Logger - Track operation performance
 *
 * Usage:
 *   const perf = new PerformanceLogger('DatabaseQuery');
 *   // ... do query ...
 *   perf.end({ query: 'SELECT * FROM leads' });
 */
export class PerformanceLogger {
  private operation: string;
  private startTime: number;
  private context: LogMetadata;

  constructor(operation: string, context?: LogMetadata) {
    this.operation = operation;
    this.context = context || {};
    this.startTime = Date.now();
  }

  setRequestId(requestId: string): void {
    this.context.requestId = requestId;
  }

  /** End performance tracking and log */
  end(metadata?: LogMetadata): number {
    const duration = Date.now() - this.startTime;
    const isSlow = duration > 1000; // 1 second threshold

    const logFn = isSlow ? logger.warn : logger.debug;
    
    logFn(
      {
        ...this.context,
        ...metadata,
        operation: this.operation,
        duration_ms: duration,
        isSlow,
        threshold_ms: 1000,
      },
      `Operation: ${this.operation} - ${duration}ms${isSlow ? ' (SLOW)' : ''}`
    );

    return duration;
  }

  /** Get current duration without logging */
  getDuration(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Create a scoped logger for database operations
 */
export const dbLogger = createModuleLogger('database');

/**
 * Create a scoped logger for external services
 */
export const externalServiceLogger = createModuleLogger('external-service');

/**
 * Create a scoped logger for background jobs
 */
export const jobLogger = createModuleLogger('job');

/**
 * Log database query performance
 */
export function logDbQuery(
  query: string,
  duration: number,
  context?: LogMetadata
): void {
  const isSlow = duration > 500; // 500ms for DB queries
  const loggerFn = isSlow ? logger.warn : logger.debug;

  loggerFn({
    ...context,
    operation: 'db_query',
    query: query.substring(0, 200), // Truncate long queries
    duration_ms: duration,
    isSlow,
    threshold_ms: 500,
  }, `Database query: ${duration}ms${isSlow ? ' (SLOW)' : ''}`);
}

/**
 * Log external API call
 */
export function logExternalCall(
  service: string,
  endpoint: string,
  duration: number,
  statusCode: number,
  context?: LogMetadata
): void {
  const isError = statusCode >= 400;
  const isSlow = duration > 3000; // 3s for external APIs

  const loggerFn = isError || isSlow ? logger.warn : logger.debug;

  loggerFn({
    ...context,
    operation: 'external_call',
    service,
    endpoint,
    duration_ms: duration,
    statusCode,
    isError,
    isSlow,
  }, `External call: ${service} ${endpoint} - ${duration}ms (${statusCode})`);
}