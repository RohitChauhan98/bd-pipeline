/**
 * Meetings Routes
 *
 * Meeting scheduling, CRUD, notes, and upcoming meetings.
 */

import { Router } from 'express';
import { meetingsController } from './meetings.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  scheduleMeetingSchema,
  updateMeetingSchema,
  meetingNoteSchema,
  meetingIdParam,
  meetingNoteIdParam,
  meetingListQuerySchema,
} from '@bd-pipeline/shared';

const router = Router();

// ── Meeting CRUD ──────────────────────────────

router.get(
  '/meetings',
  authenticate,
  validate({ query: meetingListQuerySchema }),
  meetingsController.list,
);

router.get(
  '/meetings/upcoming',
  authenticate,
  meetingsController.getUpcoming,
);

router.get(
  '/meetings/:meetingId',
  authenticate,
  validate({ params: meetingIdParam }),
  meetingsController.getById,
);

router.post(
  '/meetings',
  authenticate,
  validate({ body: scheduleMeetingSchema }),
  meetingsController.schedule,
);

router.patch(
  '/meetings/:meetingId',
  authenticate,
  validate({ params: meetingIdParam, body: updateMeetingSchema }),
  meetingsController.update,
);

router.delete(
  '/meetings/:meetingId',
  authenticate,
  validate({ params: meetingIdParam }),
  meetingsController.delete,
);

// ── Meeting Notes ─────────────────────────────

router.get(
  '/meetings/:meetingId/notes',
  authenticate,
  validate({ params: meetingIdParam }),
  meetingsController.getNotes,
);

router.post(
  '/meetings/:meetingId/notes',
  authenticate,
  validate({ params: meetingIdParam, body: meetingNoteSchema }),
  meetingsController.addNote,
);

router.delete(
  '/meetings/:meetingId/notes/:noteId',
  authenticate,
  validate({ params: meetingNoteIdParam }),
  meetingsController.deleteNote,
);

export { router as meetingsRoutes };
