/**
 * Clients Controller — Request Handling
 */

import type { Request, Response } from 'express';
import { clientsService } from './clients.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const clientsController = {
  /** GET /clients */
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await clientsService.list(req.query as never);
    res.json({ success: true, data: { clients: result.clients, meta: result.meta } });
  }),

  /** POST /clients */
  create: asyncHandler(async (req: Request, res: Response) => {
    const data = {
      ...req.body,
      assignedManagerId: req.body.assignedManagerId || (req as any).user?.userId,
    };
    const client = await clientsService.create(data);
    res.status(201).json({ success: true, data: client });
  }),

  /** GET /clients/:id */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const client = await clientsService.getById(req.params['id']!);
    res.json({ success: true, data: client });
  }),

  /** PATCH /clients/:id */
  update: asyncHandler(async (req: Request, res: Response) => {
    const client = await clientsService.update(req.params['id']!, req.body);
    res.json({ success: true, data: client });
  }),

  /** GET /clients/:id/pipeline */
  getPipeline: asyncHandler(async (req: Request, res: Response) => {
    const pipeline = await clientsService.getPipeline(req.params['id']!);
    res.json({ success: true, data: pipeline });
  }),

  /** POST /clients/:id/pipeline/advance */
  advanceStage: asyncHandler(async (req: Request, res: Response) => {
    const result = await clientsService.advanceStage(
      req.params['id']!, req.user!.userId, req.body.notes,
    );
    res.json({ success: true, data: result });
  }),

  /** POST /clients/:id/pipeline/set-stage */
  setStage: asyncHandler(async (req: Request, res: Response) => {
    const result = await clientsService.setStage(
      req.params['id']!, req.user!.userId, req.body.stage, req.body.notes,
    );
    res.json({ success: true, data: result });
  }),

  /** GET /clients/:id/checklist */
  getChecklist: asyncHandler(async (req: Request, res: Response) => {
    const items = await clientsService.getChecklist(req.params['id']!);
    res.json({ success: true, data: items });
  }),

  /** PATCH /clients/:id/checklist/:itemId */
  updateChecklistItem: asyncHandler(async (req: Request, res: Response) => {
    const item = await clientsService.updateChecklistItem(
      req.params['itemId']!, req.user!.userId, req.body.isCompleted,
    );
    res.json({ success: true, data: item });
  }),

  /** GET /clients/:id/requirements */
  getRequirements: asyncHandler(async (req: Request, res: Response) => {
    const reqs = await clientsService.getRequirements(req.params['id']!);
    res.json({ success: true, data: reqs });
  }),

  /** POST /clients/:id/requirements */
  addRequirement: asyncHandler(async (req: Request, res: Response) => {
    const req_ = await clientsService.addRequirement(req.params['id']!, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: req_ });
  }),

  /** GET /clients/:id/health */
  getHealth: asyncHandler(async (req: Request, res: Response) => {
    const health = await clientsService.getHealth(req.params['id']!);
    res.json({ success: true, data: health });
  }),

  /** GET /clients/sla/breaches */
  getSlaBreaches: asyncHandler(async (_req: Request, res: Response) => {
    const breaches = await clientsService.getSlaBreaches();
    res.json({ success: true, data: breaches });
  }),
};
