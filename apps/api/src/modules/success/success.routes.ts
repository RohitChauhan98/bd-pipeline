/**
 * Success Routes — Phase 3
 *
 * Customer success dashboard, health monitoring, upsell flagging,
 * and BD re-entry workflow.
 */

import { Router } from 'express';
import { successController } from './success.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  successDashboardQuerySchema,
  successClientIdParam,
  flagUpsellOpportunitySchema,
  healthRefreshSchema,
  reenterBdSchema,
} from '@bd-pipeline/shared';

const router = Router();

// ── Dashboard ────────────────────────────────

router.get(
  '/success/dashboard',
  authenticate,
  validate({ query: successDashboardQuerySchema }),
  successController.getDashboard,
);

// ── Client Health ────────────────────────────

router.get(
  '/success/:clientId/health',
  authenticate,
  validate({ params: successClientIdParam }),
  successController.getClientHealth,
);

// ── Refresh Health Scores ─────────────────────

router.post(
  '/success/:clientId/health/refresh',
  authenticate,
  validate({ params: successClientIdParam, body: healthRefreshSchema }),
  successController.refreshHealth,
);

// ── Upsell Flagging ──────────────────────────

router.post(
  '/success/:clientId/upsell',
  authenticate,
  validate({ params: successClientIdParam, body: flagUpsellOpportunitySchema }),
  successController.flagUpsell,
);

// ── BD Re-entry ──────────────────────────────

router.post(
  '/success/:clientId/re-enter-bd',
  authenticate,
  validate({ params: successClientIdParam, body: reenterBdSchema }),
  successController.reenterBd,
);

export { router as successRoutes };
