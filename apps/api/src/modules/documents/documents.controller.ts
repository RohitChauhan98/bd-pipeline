/**
 * Documents Controller — Request Handling
 */

import type { Request, Response } from 'express';
import { documentsService } from './documents.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const documentsController = {
  /** GET /documents/:clientId */
  listByClient: asyncHandler(async (req: Request, res: Response) => {
    const result = await documentsService.listByClient(
      req.params['clientId']!,
      req.query as never,
    );
    res.json({ success: true, data: result });
  }),

  /** GET /documents/detail/:docId */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const doc = await documentsService.getById(req.params['docId']!);
    res.json({ success: true, data: doc });
  }),

  /** POST /documents/upload */
  upload: asyncHandler(async (req: Request, res: Response) => {
    const result = await documentsService.upload({
      ...req.body,
      uploadedById: req.user!.userId,
    });
    res.status(201).json({ success: true, data: result });
  }),

  /** DELETE /documents/:docId */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const result = await documentsService.delete(req.params['docId']!);
    res.json({ success: true, data: result });
  }),

  /** POST /documents/:docId/scan */
  triggerScan: asyncHandler(async (req: Request, res: Response) => {
    const result = await documentsService.triggerScan(req.params['docId']!);
    res.json({ success: true, data: result });
  }),

  /** GET /documents/:docId/scan/result */
  getScanResult: asyncHandler(async (req: Request, res: Response) => {
    const result = await documentsService.getScanResult(req.params['docId']!);
    res.json({ success: true, data: result });
  }),

  /** GET /documents/:docId/download */
  getDownloadUrl: asyncHandler(async (req: Request, res: Response) => {
    const result = await documentsService.getDownloadUrl(req.params['docId']!);
    res.json({ success: true, data: result });
  }),
};
