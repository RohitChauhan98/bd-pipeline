/**
 * Success Controller — Request Handling
 */

import type { Request, Response } from 'express';
import { successService } from './success.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const successController = {
  /** GET /success/dashboard */
  getDashboard: asyncHandler(async (req: Request, res: Response) => {
    const result = await successService.getDashboard(req.query as never);
    res.json({ success: true, data: result });
  }),

  /** GET /success/:clientId/health */
  getClientHealth: asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params['clientId'] as string;
    const result = await successService.getClientHealth(clientId);
    res.json({ success: true, data: result });
  }),

  /** POST /success/:clientId/upsell */
  flagUpsell: asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params['clientId'] as string;
    const result = await successService.flagUpsell(clientId, req.user!.userId, req.body);
    res.json({ success: true, data: result });
  }),

  /** POST /success/:clientId/health/refresh */
  refreshHealth: asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params['clientId'] as string;
    const result = await successService.refreshHealth(clientId, req.body?.usageSignals);
    res.json({ success: true, data: result });
  }),

  /** POST /success/:clientId/re-enter-bd */
  reenterBd: asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params['clientId'] as string;
    const { reason, notes } = req.body;
    const result = await successService.reenterBd(clientId, req.user!.userId, reason, notes);
    res.status(201).json({ success: true, data: result });
  }),
};
