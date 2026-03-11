/**
 * Audit Logger
 *
 * Specialized logger for audit trails and compliance.
 * Logs important business actions with full context.
 *
 * Audit events include:
 * - Authentication (login, logout, failed attempts)
 * - Data changes (create, update, delete)
 * - Access control (role changes, permissions)
 * - Financial transactions
 * - Sensitive data access
 */

import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export type AuditAction =
  // Auth events
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'TOKEN_REFRESH'
  | 'PASSWORD_CHANGE'
  | 'PASSWORD_RESET'
  
  // User management
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DELETE'
  | 'ROLE_CHANGE'
  
  // Lead management
  | 'LEAD_CREATE'
  | 'LEAD_UPDATE'
  | 'LEAD_DELETE'
  | 'LEAD_STATUS_CHANGE'
  | 'LEAD_ASSIGN'
  | 'LEAD_SCORE_OVERRIDE'
  
  // Outreach
  | 'PITCH_CREATE'
  | 'PITCH_SEND'
  | 'PITCH_APPROVE'
  | 'FOLLOWUP_CREATE'
  
  // Deals
  | 'DEAL_CREATE'
  | 'DEAL_CLOSE'
  | 'DEAL_STATUS_CHANGE'
  
  // Onboarding
  | 'CLIENT_CREATE'
  | 'STAGE_ADVANCE'
  | 'CHECKLIST_COMPLETE'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_DELETE'
  | 'REQUIREMENT_CREATE'
  
  // Settings
  | 'CONFIG_CHANGE'
  | 'API_KEY_CREATE'
  | 'API_KEY_DELETE';

export interface AuditContext {
  requestId?: string;
  userId?: string;
  userEmail?: string;
  ipAddress?: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  changes?: Record<string, { before: unknown; after: unknown }>;
  metadata?: Record<string, unknown>;
}

/**
 * Create an audit log entry
 */
export function auditLog(
  action: AuditAction,
  message: string,
  context: AuditContext,
  severity?: 'info' | 'warn' | 'error'
): void {
  const logEntry = {
    // Standard fields
    timestamp: new Date().toISOString(),
    level: severity || 'info',
    
    // Audit-specific
    audit: true,
    action,
    message,
    
    // Context
    requestId: context.requestId,
    userId: context.userId,
    userEmail: context.userEmail,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    
    // Resource
    resourceType: context.resourceType,
    resourceId: context.resourceId,
    
    // Changes (for updates)
    changes: context.changes,
    
    // Additional metadata
    ...context.metadata,
    
    // Environment
    environment: env.NODE_ENV,
  };

  const logFn = severity === 'error' ? logger.error : severity === 'warn' ? logger.warn : logger.info;
  logFn(logEntry, `[AUDIT] ${action}: ${message}`);
}

/**
 * Log authentication events
 */
export function auditAuth(
  action: 'LOGIN' | 'LOGIN_FAILED' | 'LOGOUT' | 'TOKEN_REFRESH' | 'PASSWORD_CHANGE',
  context: AuditContext,
  result: 'success' | 'failure',
  metadata?: Record<string, unknown>
): void {
  const severity = action === 'LOGIN_FAILED' || action === 'PASSWORD_CHANGE' ? 'warn' : 'info';
  
  auditLog(
    action,
    `Authentication ${action.toLowerCase().replace('_', ' ')}: ${result}`,
    { ...context, metadata: { ...context.metadata, result, ...metadata } },
    severity
  );
}

/**
 * Log data modification events
 */
export function auditDataChange(
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  resourceType: string,
  resourceId: string,
  context: AuditContext,
  changes?: Record<string, { before: unknown; after: unknown }>,
  metadata?: Record<string, unknown>
): void {
  auditLog(
    `${resourceType.toUpperCase()}_${action}` as AuditAction,
    `${action} ${resourceType}: ${resourceId}`,
    {
      ...context,
      resourceType,
      resourceId,
      changes,
      metadata,
    }
  );
}

/**
 * Log access control events
 */
export function auditAccess(
  action: 'ROLE_CHANGE' | 'PERMISSION_DENIED' | 'ACCESS_GRANTED',
  context: AuditContext,
  resource: { type: string; id: string },
  metadata?: Record<string, unknown>
): void {
  auditLog(
    action,
    `Access ${action.toLowerCase().replace('_', ' ')}: ${resource.type}`,
    {
      ...context,
      resourceType: resource.type,
      resourceId: resource.id,
      metadata,
    },
    action === 'PERMISSION_DENIED' ? 'warn' : 'info'
  );
}

/**
 * Log business workflow events
 */
export function auditWorkflow(
  workflow: string,
  action: 'START' | 'COMPLETE' | 'FAIL' | 'CANCEL',
  context: AuditContext,
  metadata?: Record<string, unknown>
): void {
  auditLog(
    `${workflow.toUpperCase()}_${action}` as AuditAction,
    `Workflow ${workflow}: ${action.toLowerCase()}`,
    { ...context, metadata: { ...context.metadata, workflow, status: action } }
  );
}

/**
 * Create audit context from Express request
 */
export function createAuditContext(req: {
  requestId?: string;
  user?: { id: string; email: string };
  ip?: string;
  headers?: Record<string, string>;
}): AuditContext {
  return {
    requestId: req.requestId,
    userId: req.user?.id,
    userEmail: req.user?.email,
    ipAddress: req.ip || req.headers?.['x-forwarded-for'] as string,
    userAgent: req.headers?.['user-agent'],
  };
}