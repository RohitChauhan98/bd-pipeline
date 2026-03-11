/**
 * Calls Routes
 *
 * Discovery call scheduling, recording, transcription, and meeting notes.
 */

import { Router } from 'express';
import { callsController } from './calls.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { aiLimiter } from '../../middleware/rate-limit.js';
import { createCallSchema } from '@bd-pipeline/shared';
import { z } from 'zod';

const router = Router();
const uuidParam = z.object({ id: z.string().uuid() });

// ── Discovery Calls ──────────────────────────

router.post(
  '/calls',
  authenticate,
  validate({ body: createCallSchema }),
  callsController.createCall,
);

router.get(
  '/calls/:id',
  authenticate,
  validate({ params: uuidParam }),
  callsController.getCall,
);

router.post(
  '/calls/:id/transcribe',
  authenticate,
  aiLimiter,
  validate({ params: uuidParam }),
  callsController.triggerTranscription,
);

router.get(
  '/calls/:id/summary',
  authenticate,
  validate({ params: uuidParam }),
  callsController.getCallSummary,
);

// ── Meetings — handled by dedicated meetings module ─────
// See: modules/meetings/meetings.routes.ts

export { router as callsRoutes };
