/**
 * JWT Authentication Middleware
 *
 * Extracts and verifies the JWT Bearer token from the Authorization header.
 * Attaches the decoded user payload to `req.user`.
 *
 * Usage:
 *   router.get('/protected', authenticate, handler);
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../utils/api-error.js';
import { logger } from '../config/logger.js';

/** JWT payload shape attached to req.user */
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Middleware: Verify JWT token from Authorization header.
 * Rejects requests without valid tokens with 401.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid authorization header');
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    
    // Set user context for logging
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    req.userRole = decoded.role;
    
    // Update log metadata with user info
    if (req.logMetadata) {
      req.logMetadata.userId = decoded.userId;
    }
    
    next();
  } catch (err) {
    // Log failed authentication attempts
    logger.warn({
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      ip: req.ip,
      reason: err instanceof jwt.TokenExpiredError ? 'token_expired' : 'invalid_token',
    }, 'Authentication failed');
    
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Authentication failed');
  }
}

/**
 * SSE-specific authentication — accepts token from either:
 *   1. Authorization: Bearer <token> header
 *   2. ?token=<token> query parameter (needed because EventSource doesn't support headers)
 */
export function authenticateSse(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const queryToken = req.query['token'] as string | undefined;

  const tokenStr = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : queryToken;

  if (!tokenStr) {
    throw new UnauthorizedError('Missing authentication token');
  }

  try {
    const decoded = jwt.verify(tokenStr, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Authentication failed');
  }
}

/**
 * Optional authentication — attaches user if token is present
 * but does not reject requests without a token.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = decoded;
  } catch {
    // Token invalid — continue without user
  }

  next();
}
