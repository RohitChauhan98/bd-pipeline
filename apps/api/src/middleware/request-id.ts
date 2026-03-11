/**
 * Request ID Middleware
 *
 * Generates a unique request ID for every incoming request.
 * The ID is:
 * - Attached to req.requestId
 * - Added to res headers as X-Request-ID
 * - Included in all Pino log entries for this request
 *
 * If the client sends an X-Request-ID header, it is preserved for
 * end-to-end tracing across services.
 */

import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = (req.headers['x-request-id'] as string) || `req_${randomUUID()}`;
  
  // Set on request
  req.requestId = id;
  
  // Set on response
  res.setHeader('X-Request-ID', id);
  
  // Set request start time for performance tracking
  req.requestStartTime = Date.now();
  
  // Set default log metadata
  req.logMetadata = {
    requestId: id,
    endpoint: req.path,
    method: req.method,
  };
  
  next();
}
