/**
 * Meetings Controller — Request Handling
 */

import type { Request, Response } from 'express';
import { meetingsService } from './meetings.service.js';
import { asyncHandler } from '../../utils/async-handler.js';

export const meetingsController = {
  /** GET /meetings */
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingsService.list(req.query as never);
    res.json({ success: true, data: result });
  }),

  /** GET /meetings/upcoming */
  getUpcoming: asyncHandler(async (req: Request, res: Response) => {
    const meetings = await meetingsService.getUpcoming(req.user?.userId);
    res.json({ success: true, data: meetings });
  }),

  /** GET /meetings/:meetingId */
  getById: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingsService.getById(req.params['meetingId']!);
    res.json({ success: true, data: meeting });
  }),

  /** POST /meetings */
  schedule: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingsService.schedule({
      ...req.body,
      organizedById: req.user!.userId,
    });
    res.status(201).json({ success: true, data: meeting });
  }),

  /** PATCH /meetings/:meetingId */
  update: asyncHandler(async (req: Request, res: Response) => {
    const meeting = await meetingsService.update(req.params['meetingId']!, req.body);
    res.json({ success: true, data: meeting });
  }),

  /** DELETE /meetings/:meetingId */
  delete: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingsService.delete(req.params['meetingId']!);
    res.json({ success: true, data: result });
  }),

  // ── Notes ───────────────────────────────────

  /** GET /meetings/:meetingId/notes */
  getNotes: asyncHandler(async (req: Request, res: Response) => {
    const notes = await meetingsService.getNotes(req.params['meetingId']!);
    res.json({ success: true, data: notes });
  }),

  /** POST /meetings/:meetingId/notes */
  addNote: asyncHandler(async (req: Request, res: Response) => {
    const note = await meetingsService.addNote(
      req.params['meetingId']!,
      req.user!.userId,
      req.body.body,
    );
    res.status(201).json({ success: true, data: note });
  }),

  /** DELETE /meetings/:meetingId/notes/:noteId */
  deleteNote: asyncHandler(async (req: Request, res: Response) => {
    const result = await meetingsService.deleteNote(req.params['noteId']!);
    res.json({ success: true, data: result });
  }),
};
