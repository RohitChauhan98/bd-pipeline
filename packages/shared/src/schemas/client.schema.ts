/**
 * Client Schemas
 *
 * Client management schemas. Onboarding-specific schemas (stages, checklists,
 * requirements) are in onboarding.schema.ts.
 */

import { z } from 'zod';

// ── Client Create ────────────────────────────

export const createClientSchema = z.object({
  leadId: z.string().uuid('Lead ID is required to convert to client'),
  companyName: z.string().min(1, 'Company name is required'),
  primaryContactName: z.string().min(1, 'Contact name is required'),
  primaryContactEmail: z.string().email('Valid email required'),
  primaryContactPhone: z.string().optional(),
  contractValue: z.number().positive().optional(),
  contractStart: z.string().datetime().optional(),
  contractEnd: z.string().datetime().optional(),
  assignedManagerId: z.string().uuid().optional(),
});

export const updateClientSchema = z.object({
  companyName: z.string().min(1).optional(),
  primaryContactName: z.string().min(1).optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactPhone: z.string().optional(),
  contractValue: z.number().positive().optional(),
  contractStart: z.string().datetime().optional(),
  contractEnd: z.string().datetime().optional(),
  assignedManagerId: z.string().uuid().optional(),
});

// ── Deal Close ───────────────────────────────

export const dealCloseSchema = z.object({
  leadId: z.string().uuid(),
  proposalId: z.string().uuid(),
  dealValue: z.number().positive().optional(),
  contractValue: z.number().positive().optional(),
  contractStart: z.string().datetime().optional(),
  contractEnd: z.string().datetime().optional(),
  accountManagerId: z.string().uuid().optional(),
  assignedManagerId: z.string().uuid().optional(),
  notes: z.string().optional(),
}).refine(
  (data) => Boolean(data.dealValue ?? data.contractValue),
  { message: 'Either dealValue or contractValue is required', path: ['dealValue'] },
).refine(
  (data) => Boolean(data.accountManagerId ?? data.assignedManagerId),
  { message: 'Either accountManagerId or assignedManagerId is required', path: ['accountManagerId'] },
);

// ── Client List Query ────────────────────────

export const clientListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ONBOARDING', 'ACTIVE', 'AT_RISK', 'CHURNED']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['createdAt', 'companyName', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ── Client Response ──────────────────────────

export const clientResponseSchema = z.object({
  id: z.string().uuid(),
  companyName: z.string(),
  primaryContactName: z.string(),
  primaryContactEmail: z.string(),
  primaryContactPhone: z.string().nullable(),
  contractValue: z.number().nullable(),
  status: z.enum(['ONBOARDING', 'ACTIVE', 'AT_RISK', 'CHURNED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
