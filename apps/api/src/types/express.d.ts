/**
 * Express Type Extensions
 *
 * Extend Express Request and Response types with
 * application-specific properties.
 */

import type { LogMetadata } from '../config/logger.js';

/**
 * Extended Request type with application properties
 */
export interface AppRequest {
  /** Unique request ID for tracing */
  requestId: string;
  
  /** Authenticated user ID */
  userId?: string;
  
  /** Authenticated user role */
  userRole?: string;
  
  /** Authenticated user email */
  userEmail?: string;
  
  /** Request start time for performance tracking */
  requestStartTime?: number;
  
  /** Custom log metadata to include in all logs for this request */
  logMetadata?: LogMetadata;
  
  /** Is this an API request */
  isApiRequest?: boolean;
  
  /** Original IP address (may differ from req.ip behind proxy) */
  realIp?: string;
}

/**
 * Extended Response type with application properties
 */
export interface AppResponse {
  /** Request ID for correlation */
  requestId?: string;
  
  /** Start time for duration calculation */
  startTime?: number;
}

/**
 * Extended Session type (if using sessions)
 */
export interface AppSession {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  iat?: number;
  exp?: number;
}

/**
 * Augment Express namespace
 */
declare global {
  namespace Express {
    interface Request extends AppRequest {}
    interface Response extends AppResponse {}
    // interface Session extends AppSession {}
  }
}