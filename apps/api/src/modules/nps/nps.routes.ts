/**
 * NPS Routes — Phase 3
 *
 * NPS collection, history, dashboard, and survey sending.
 */

import { Router } from 'express';
import { npsController } from './nps.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  collectNpsResponseSchema,
  sendNpsSurveySchema,
  npsListQuerySchema,
  npsClientIdParam,
} from '@bd-pipeline/shared';

const router = Router();

// ── NPS Dashboard ────────────────────────────

router.get(
  '/nps/dashboard',
  authenticate,
  validate({ query: npsListQuerySchema }),
  npsController.getDashboard,
);

// ── Collect NPS Response ─────────────────────

router.post(
  '/nps/collect',
  authenticate,
  validate({ body: collectNpsResponseSchema }),
  npsController.collect,
);

// ── Send Survey ──────────────────────────────

router.post(
  '/nps/send-survey',
  authenticate,
  validate({ body: sendNpsSurveySchema }),
  npsController.sendSurvey,
);

// ── Client NPS History ───────────────────────

router.get(
  '/nps/:clientId',
  authenticate,
  validate({ params: npsClientIdParam }),
  npsController.getByClient,
);

export { router as npsRoutes };
