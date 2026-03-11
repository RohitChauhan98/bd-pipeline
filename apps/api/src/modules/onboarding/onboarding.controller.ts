/**
 * Onboarding Controller — Request Handling
 *
 * Handles HTTP requests for onboarding pipeline management,
 * checklist gates, requirements, and SLA monitoring.
 */

import type { Request, Response } from 'express';
import { onboardingService } from './onboarding.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const onboardingController = {
  // ── Pipeline ────────────────────────────────

  /** GET /onboarding/:clientId */
  getPipeline: asyncHandler(async (req: Request, res: Response) => {
    const pipeline = await onboardingService.getPipeline(req.params['clientId'] as string);
    res.json({ success: true, data: pipeline });
  }),

  /** GET /onboarding */
  listPipelines: asyncHandler(async (req: Request, res: Response) => {
    const result = await onboardingService.listPipelines(req.query as never);
    res.json({ success: true, data: result });
  }),

  /** POST /onboarding/:clientId/stage/advance */
  advanceStage: asyncHandler(async (req: Request, res: Response) => {
    const result = await onboardingService.advanceStage(
      req.params['clientId'] as string,
      req.user!.userId,
      req.body.notes,
    );
    res.json({ success: true, data: result });
  }),

  /** PATCH /onboarding/:clientId/stage */
  setStage: asyncHandler(async (req: Request, res: Response) => {
    const result = await onboardingService.setStage(
      req.params['clientId'] as string,
      req.user!.userId,
      req.body.stage,
      req.body.notes,
    );
    res.json({ success: true, data: result });
  }),

  /** GET /onboarding/stages */
  getStageDefinitions: asyncHandler(async (_req: Request, res: Response) => {
    const stages = await onboardingService.getStageDefinitions();
    res.json({ success: true, data: stages });
  }),

  /** GET /onboarding/:clientId/audit */
  getAuditTrail: asyncHandler(async (req: Request, res: Response) => {
    const trail = await onboardingService.getAuditTrail(req.params['clientId'] as string);
    res.json({ success: true, data: trail });
  }),

  // ── Checklist ───────────────────────────────

  /** GET /onboarding/:clientId/checklist */
  getChecklist: asyncHandler(async (req: Request, res: Response) => {
    const result = await onboardingService.getChecklist(req.params['clientId'] as string);
    res.json({ success: true, data: result });
  }),

  /** PATCH /onboarding/:clientId/checklist/:itemId */
  updateChecklistItem: asyncHandler(async (req: Request, res: Response) => {
    const item = await onboardingService.updateChecklistItem(
      req.params['itemId'] as string,
      req.user!.userId,
      req.body.isCompleted,
    );
    res.json({ success: true, data: item });
  }),

  /** GET /onboarding/:clientId/checklist/gate */
  checkGateStatus: asyncHandler(async (req: Request, res: Response) => {
    const status = await onboardingService.checkGateStatus(req.params['clientId'] as string);
    res.json({ success: true, data: status });
  }),

  /** POST /onboarding/:clientId/checklist/bulk-complete */
  bulkCompleteChecklist: asyncHandler(async (req: Request, res: Response) => {
    const result = await onboardingService.bulkCompleteChecklist(
      req.body.itemIds,
      req.user!.userId,
    );
    res.json({ success: true, data: result });
  }),

  // ── Requirements ────────────────────────────

  /** GET /clients/:clientId/requirements */
  getRequirements: asyncHandler(async (req: Request, res: Response) => {
    const reqs = await onboardingService.getRequirements(req.params['clientId'] as string);
    res.json({ success: true, data: reqs });
  }),

  /** POST /clients/:clientId/requirements */
  createRequirement: asyncHandler(async (req: Request, res: Response) => {
    const requirement = await onboardingService.createRequirement(
      req.params['clientId'] as string,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data: requirement });
  }),

  /** PATCH /clients/:clientId/requirements/:id */
  updateRequirement: asyncHandler(async (req: Request, res: Response) => {
    const requirement = await onboardingService.updateRequirement(req.params['id'] as string, req.body);
    res.json({ success: true, data: requirement });
  }),

  /** DELETE /clients/:clientId/requirements/:id */
  deleteRequirement: asyncHandler(async (req: Request, res: Response) => {
    const result = await onboardingService.deleteRequirement(req.params['id'] as string);
    res.json({ success: true, data: result });
  }),

  // ── SLA ─────────────────────────────────────

  /** GET /onboarding/sla/dashboard */
  getSlaDashboard: asyncHandler(async (_req: Request, res: Response) => {
    const dashboard = await onboardingService.getSlaDashboard();
    res.json({ success: true, data: dashboard });
  }),

  /** GET /onboarding/:clientId/sla */
  getClientSla: asyncHandler(async (req: Request, res: Response) => {
    const sla = await onboardingService.getClientSla(req.params['clientId'] as string);
    res.json({ success: true, data: sla });
  }),

  /** POST /onboarding/sla/run */
  runSlaCheck: asyncHandler(async (_req: Request, res: Response) => {
    const result = await onboardingService.runSlaCheck();
    res.json({ success: true, data: result });
  }),

  /** GET /onboarding/sla/config */
  getSlaConfigs: asyncHandler(async (_req: Request, res: Response) => {
    const configs = await onboardingService.getSlaConfigs();
    res.json({ success: true, data: configs });
  }),

  /** PUT /onboarding/sla/config */
  upsertSlaConfig: asyncHandler(async (req: Request, res: Response) => {
    const config = await onboardingService.upsertSlaConfig(
      req.body.stage,
      req.body.slaHours,
      req.body.atRiskPct,
    );
    res.json({ success: true, data: config });
  }),
};
