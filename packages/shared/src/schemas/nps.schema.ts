/**
 * NPS Schemas — Phase 3
 *
 * Validation schemas for NPS collection, survey sending, and queries.
 */

import { z } from 'zod';

// ── Collection ───────────────────────────────

export const collectNpsResponseSchema = z.object({
  clientId: z.string().uuid(),
  score: z.number().int().min(0).max(10),
  feedback: z.string().optional(),
});

// ── Survey Send ──────────────────────────────

export const sendNpsSurveySchema = z.object({
  clientId: z.string().uuid(),
  sendVia: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).default('EMAIL'),
  subject: z.string().optional(),
  message: z.string().optional(),
});

// ── Query ────────────────────────────────────

export const npsListQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Params ───────────────────────────────────

export const npsClientIdParam = z.object({ clientId: z.string().uuid() });
