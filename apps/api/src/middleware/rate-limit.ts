/**
 * Rate Limiting Middleware
 *
 * Provides tiered rate limiting using express-rate-limit with Redis store.
 *
 * Tiers:
 * - Auth endpoints: 5 req/min (brute force protection)
 * - AI generation endpoints: 10 req/min (Ollama is slow)
 * - General API: 100 req/min per user
 */

import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';

/**
 * General API rate limiter — 100 requests/minute per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as never,
    prefix: 'rl:general:',
  }),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many requests. Please try again later.',
      status: 429,
    },
  },
});

/**
 * Auth rate limiter — 5 requests/minute per IP.
 * Protects login endpoint from brute force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30, // 30 req/min for dev, reduce to 5 in production
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as never,
    prefix: 'rl:auth:',
  }),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many login attempts. Please wait 1 minute.',
      status: 429,
    },
  },
});

/**
 * AI generation rate limiter — 10 requests/minute per user.
 * Prevents queue flooding for slow AI operations.
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args) as never,
    prefix: 'rl:ai:',
  }),
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many AI generation requests. Please wait.',
      status: 429,
    },
  },
});
