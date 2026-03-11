/**
 * Onboarding Pipeline Schemas
 *
 * Zod schemas for onboarding stage management, checklists, requirements,
 * SLA monitoring, and AI email generation.
 */

import { z } from 'zod';

// ── Stage Management ──────────────────────────

export const advanceStageSchema = z.object({
  notes: z.string().optional(),
});

export const setStageSchema = z.object({
  stage: z.enum([
    'DEAL_CLOSED',
    'KICKOFF',
    'REQUIREMENTS_GATHERING',
    'DOCUMENTATION',
    'TECHNICAL_SETUP',
    'TESTING_UAT',
    'GO_LIVE',
    'TRAINING',
    'COMPLETED',
  ]),
  notes: z.string().optional(),
});

// ── Checklist ─────────────────────────────────

export const updateChecklistItemSchema = z.object({
  isCompleted: z.boolean(),
});

export const bulkCompleteChecklistSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1, 'At least one item ID required'),
});

// ── Requirements ──────────────────────────────

export const createRequirementSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Description is required'),
});

export const updateRequirementSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

// ── Documents ─────────────────────────────────

export const uploadDocumentSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1, 'Document name is required'),
  category: z.enum(['CONTRACT', 'KYC', 'TECHNICAL_SPEC', 'NDA', 'OTHER']).default('OTHER'),
  expiryDate: z.string().datetime().optional(),
});

// ── AI Email ──────────────────────────────────

export const generateAiEmailSchema = z.object({
  clientId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  type: z.enum(['FOLLOWUP', 'ONBOARDING_UPDATE', 'PROPOSAL', 'PITCH', 'CUSTOM']).default('CUSTOM'),
  toEmail: z.string().email('Valid email required'),
  context: z.string().optional(),
});

export const editAiEmailSchema = z.object({
  subject: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

// ── SLA Config ────────────────────────────────

export const updateSlaConfigSchema = z.object({
  stage: z.enum([
    'DEAL_CLOSED',
    'KICKOFF',
    'REQUIREMENTS_GATHERING',
    'DOCUMENTATION',
    'TECHNICAL_SETUP',
    'TESTING_UAT',
    'GO_LIVE',
    'TRAINING',
    'COMPLETED',
  ]),
  slaHours: z.number().int().min(1),
  atRiskPct: z.number().min(0).max(1).default(0.75),
});

// ── Param Schemas ─────────────────────────────

export const clientIdParam = z.object({ clientId: z.string().uuid() });
export const itemIdParam = z.object({ clientId: z.string().uuid(), itemId: z.string().uuid() });
export const docIdParam = z.object({ docId: z.string().uuid() });
export const emailIdParam = z.object({ id: z.string().uuid() });

// ── Query Schemas ─────────────────────────────

export const onboardingListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  stage: z.enum([
    'DEAL_CLOSED', 'KICKOFF', 'REQUIREMENTS_GATHERING', 'DOCUMENTATION',
    'TECHNICAL_SETUP', 'TESTING_UAT', 'GO_LIVE', 'TRAINING', 'COMPLETED',
  ]).optional(),
  healthStatus: z.enum(['ON_TRACK', 'AT_RISK', 'OVERDUE', 'STALLED']).optional(),
  sortBy: z.enum(['createdAt', 'lastActivityAt', 'currentStage']).default('lastActivityAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.enum(['CONTRACT', 'KYC', 'TECHNICAL_SPEC', 'NDA', 'OTHER']).optional(),
});

export const aiEmailListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'REJECTED']).optional(),
  type: z.enum(['FOLLOWUP', 'ONBOARDING_UPDATE', 'PROPOSAL', 'PITCH', 'CUSTOM']).optional(),
});
