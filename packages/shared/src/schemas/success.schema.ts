/**
 * Success Schemas — Phase 3
 *
 * Validation schemas for customer success dashboard, health scores,
 * upsell flagging, and BD re-entry.
 */

import { z } from 'zod';

// ── Health Refresh ───────────────────────────

export const healthRefreshSchema = z.object({
  usageSignals: z.record(z.unknown()).optional(),
});

// ── Upsell ───────────────────────────────────

export const flagUpsellOpportunitySchema = z.object({
  notes: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
});

// ── BD Re-entry ──────────────────────────────

export const reenterBdSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

// ── Query ────────────────────────────────────

export const successDashboardQuerySchema = z.object({
  status: z.enum(['ALL', 'HEALTHY', 'AT_RISK', 'CHURNED']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['churnRisk', 'upsellScore', 'lastActivity']).default('churnRisk'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ── Params ───────────────────────────────────

export const successClientIdParam = z.object({ clientId: z.string().uuid() });
