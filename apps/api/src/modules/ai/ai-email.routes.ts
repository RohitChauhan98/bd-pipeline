/**
 * AI Email Routes — Phase 2
 *
 * AI email generation, approval workflow, sending, and listing.
 */

import { Router } from 'express';
import { aiEmailService } from './ai-email.service.js';
import { authenticate } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  generateAiEmailSchema,
  editAiEmailSchema,
  aiEmailListQuerySchema,
  emailIdParam,
} from '@bd-pipeline/shared';
import type { Request, Response } from 'express';

const router = Router();

// ── Generate ──────────────────────────────────

router.post(
  '/ai/followup-email/generate',
  authenticate,
  validate({ body: generateAiEmailSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const email = await aiEmailService.generate({
      ...req.body,
      userId: req.user!.userId,
    });
    res.status(201).json({ success: true, data: email });
  }),
);

// ── Edit ──────────────────────────────────────

router.patch(
  '/ai/followup-email/:id',
  authenticate,
  validate({ params: emailIdParam, body: editAiEmailSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const email = await aiEmailService.edit(req.params['id'] as string, req.body);
    res.json({ success: true, data: email });
  }),
);

// ── Approve ───────────────────────────────────

router.post(
  '/ai/followup-email/:id/approve',
  authenticate,
  requireRole('ADMIN', 'BD_MANAGER'),
  validate({ params: emailIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const email = await aiEmailService.approve(req.params['id'] as string, req.user!.userId);
    res.json({ success: true, data: email });
  }),
);

// ── Reject ────────────────────────────────────

router.post(
  '/ai/followup-email/:id/reject',
  authenticate,
  requireRole('ADMIN', 'BD_MANAGER'),
  validate({ params: emailIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const email = await aiEmailService.reject(req.params['id'] as string, req.user!.userId);
    res.json({ success: true, data: email });
  }),
);

// ── Send ──────────────────────────────────────

router.post(
  '/ai/followup-email/:id/send',
  authenticate,
  requireRole('ADMIN', 'BD_MANAGER'),
  validate({ params: emailIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await aiEmailService.send(req.params['id'] as string);
    res.json({ success: true, data: result });
  }),
);

// ── List ──────────────────────────────────────

router.get(
  '/ai/emails',
  authenticate,
  validate({ query: aiEmailListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await aiEmailService.list(req.query as never);
    res.json({ success: true, data: result });
  }),
);

// ── Get Single ────────────────────────────────

router.get(
  '/ai/emails/:id',
  authenticate,
  validate({ params: emailIdParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const email = await aiEmailService.getById(req.params['id'] as string);
    res.json({ success: true, data: email });
  }),
);

export { router as aiEmailRoutes };
