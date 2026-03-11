/**
 * Onboarding Routes
 *
 * Pipeline management, stage advancement, checklist gates,
 * requirements, SLA monitoring — all under /onboarding/*.
 */

import { Router } from 'express';
import { onboardingController } from './onboarding.controller.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import {
  advanceStageSchema,
  setStageSchema,
  updateChecklistItemSchema,
  bulkCompleteChecklistSchema,
  createRequirementSchema,
  updateRequirementSchema,
  updateSlaConfigSchema,
  clientIdParam,
  itemIdParam,
  onboardingListQuerySchema,
} from '@bd-pipeline/shared';
import { z } from 'zod';

const router = Router();
const uuidParam = z.object({ id: z.string().uuid() });

// ── Pipeline ──────────────────────────────────

router.get(
  '/onboarding',
  authenticate,
  validate({ query: onboardingListQuerySchema }),
  onboardingController.listPipelines,
);

router.get(
  '/onboarding/stages',
  authenticate,
  onboardingController.getStageDefinitions,
);

router.get(
  '/onboarding/:clientId',
  authenticate,
  validate({ params: clientIdParam }),
  onboardingController.getPipeline,
);

router.post(
  '/onboarding/:clientId/stage/advance',
  authenticate,
  validate({ params: clientIdParam, body: advanceStageSchema }),
  onboardingController.advanceStage,
);

router.patch(
  '/onboarding/:clientId/stage',
  authenticate,
  requireRole('ADMIN', 'BD_MANAGER'),
  validate({ params: clientIdParam, body: setStageSchema }),
  onboardingController.setStage,
);

router.get(
  '/onboarding/:clientId/audit',
  authenticate,
  validate({ params: clientIdParam }),
  onboardingController.getAuditTrail,
);

// ── Checklist ─────────────────────────────────

router.get(
  '/onboarding/:clientId/checklist',
  authenticate,
  validate({ params: clientIdParam }),
  onboardingController.getChecklist,
);

router.patch(
  '/onboarding/:clientId/checklist/:itemId',
  authenticate,
  validate({ params: itemIdParam, body: updateChecklistItemSchema }),
  onboardingController.updateChecklistItem,
);

router.get(
  '/onboarding/:clientId/checklist/gate',
  authenticate,
  validate({ params: clientIdParam }),
  onboardingController.checkGateStatus,
);

router.post(
  '/onboarding/:clientId/checklist/bulk-complete',
  authenticate,
  validate({ params: clientIdParam, body: bulkCompleteChecklistSchema }),
  onboardingController.bulkCompleteChecklist,
);

// ── Requirements ──────────────────────────────

router.get(
  '/clients/:clientId/requirements',
  authenticate,
  validate({ params: clientIdParam }),
  onboardingController.getRequirements,
);

router.post(
  '/clients/:clientId/requirements',
  authenticate,
  validate({ params: clientIdParam, body: createRequirementSchema }),
  onboardingController.createRequirement,
);

router.patch(
  '/clients/:clientId/requirements/:id',
  authenticate,
  validate({
    params: z.object({ clientId: z.string().uuid(), id: z.string().uuid() }),
    body: updateRequirementSchema,
  }),
  onboardingController.updateRequirement,
);

router.delete(
  '/clients/:clientId/requirements/:id',
  authenticate,
  validate({
    params: z.object({ clientId: z.string().uuid(), id: z.string().uuid() }),
  }),
  onboardingController.deleteRequirement,
);

// ── SLA Monitoring ────────────────────────────

router.get(
  '/onboarding/sla/dashboard',
  authenticate,
  onboardingController.getSlaDashboard,
);

router.get(
  '/onboarding/sla/config',
  authenticate,
  onboardingController.getSlaConfigs,
);

router.put(
  '/onboarding/sla/config',
  authenticate,
  requireRole('ADMIN'),
  validate({ body: updateSlaConfigSchema }),
  onboardingController.upsertSlaConfig,
);

router.get(
  '/onboarding/:clientId/sla',
  authenticate,
  validate({ params: clientIdParam }),
  onboardingController.getClientSla,
);

router.post(
  '/onboarding/sla/run',
  authenticate,
  requireRole('ADMIN'),
  onboardingController.runSlaCheck,
);

export { router as onboardingRoutes };
