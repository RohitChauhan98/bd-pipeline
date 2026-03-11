/**
 * Meeting Schemas — Phase 2 Extensions
 *
 * Additional meeting schemas not covered by common.schema.ts.
 * Base meeting schemas (createMeetingSchema, updateMeetingSchema,
 * meetingListQuerySchema) are in common.schema.ts.
 */

import { z } from 'zod';

// ── Schedule Meeting (with calendar invite flag) ──

export const scheduleMeetingSchema = z.object({
  clientId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required'),
  type: z.enum(['DISCOVERY', 'KICKOFF', 'REQUIREMENTS', 'REVIEW', 'TRAINING', 'OTHER']).default('OTHER'),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  sendCalendarInvite: z.boolean().default(true),
});

// ── Meeting Notes ─────────────────────────────

export const meetingNoteSchema = z.object({
  body: z.string().min(1, 'Note content is required'),
});

// ── Param Schemas ─────────────────────────────

export const meetingIdParam = z.object({ meetingId: z.string().uuid() });
export const meetingNoteIdParam = z.object({ meetingId: z.string().uuid(), noteId: z.string().uuid() });
