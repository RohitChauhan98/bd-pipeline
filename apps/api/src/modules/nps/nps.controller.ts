/**
 * NPS Controller — Request Handling
 */

import type { Request, Response } from 'express';
import { npsService } from './nps.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const npsController = {
  /** POST /nps/collect */
  collect: asyncHandler(async (req: Request, res: Response) => {
    const { clientId, score, feedback } = req.body;
    const response = await npsService.collect(clientId, score, feedback, req.user?.userId);
    res.status(201).json({ success: true, data: response });
  }),

  /** GET /nps/:clientId */
  getByClient: asyncHandler(async (req: Request, res: Response) => {
    const clientId = req.params['clientId'] as string;
    const page = Number(req.query['page'] ?? 1);
    const limit = Number(req.query['limit'] ?? 20);
    const result = await npsService.getByClient(clientId, page, limit);
    res.json({ success: true, data: result });
  }),

  /** GET /nps/dashboard */
  getDashboard: asyncHandler(async (req: Request, res: Response) => {
    const result = await npsService.getDashboard(req.query as never);
    res.json({ success: true, data: result });
  }),

  /** POST /nps/send-survey */
  sendSurvey: asyncHandler(async (req: Request, res: Response) => {
    const { clientId, sendVia, subject, message } = req.body;
    const result = await npsService.sendSurvey(clientId, { sendVia, subject, message });
    res.status(202).json({ success: true, data: result });
  }),
};
