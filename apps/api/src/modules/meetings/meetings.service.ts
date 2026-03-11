/**
 * Meetings Service — Business Logic
 *
 * Meeting scheduling, CRUD, notes management, and Google Calendar integration.
 */

import { Prisma } from '@bd-pipeline/db';
import { prisma } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { NotFoundError } from '../../utils/api-error.js';
import { paginate, buildPaginationMeta } from '../../utils/pagination.js';

export const meetingsService = {
  /** List meetings with filters */
  async list(query: {
    page: number;
    limit: number;
    clientId?: string;
    leadId?: string;
    type?: string;
    status?: string;
    from?: string;
    to?: string;
    sortBy: string;
    sortOrder: string;
  }) {
    const where: Prisma.MeetingWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.leadId) where.leadId = query.leadId;
    if (query.type) where.type = query.type as Prisma.EnumMeetingTypeFilter;
    if (query.status) where.status = query.status as Prisma.EnumMeetingStatusFilter;
    if (query.from || query.to) {
      where.scheduledAt = {};
      if (query.from) where.scheduledAt.gte = new Date(query.from);
      if (query.to) where.scheduledAt.lte = new Date(query.to);
    }

    const [meetings, total] = await Promise.all([
      prisma.meeting.findMany({
        where,
        ...paginate(query.page, query.limit),
        orderBy: { [query.sortBy]: query.sortOrder },
        include: {
          client: { select: { id: true, companyName: true } },
          lead: { select: { id: true, companyName: true } },
          organizedBy: { select: { id: true, name: true, email: true } },
          notes: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
      }),
      prisma.meeting.count({ where }),
    ]);

    return { meetings, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  /** Get a single meeting with full details */
  async getById(meetingId: string) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        client: { select: { id: true, companyName: true, primaryContactEmail: true } },
        lead: { select: { id: true, companyName: true, contactEmail: true } },
        organizedBy: { select: { id: true, name: true, email: true } },
        notes: {
          orderBy: { createdAt: 'desc' },
          include: { writtenBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!meeting) throw new NotFoundError('Meeting');
    return meeting;
  },

  /** Schedule a new meeting */
  async schedule(data: {
    clientId?: string;
    leadId?: string;
    title: string;
    type?: string;
    scheduledAt: string;
    durationMinutes?: number;
    sendCalendarInvite?: boolean;
    organizedById: string;
  }) {
    const meeting = await prisma.meeting.create({
      data: {
        clientId: data.clientId ?? null,
        leadId: data.leadId ?? null,
        title: data.title,
        type: (data.type ?? 'OTHER') as never,
        scheduledAt: new Date(data.scheduledAt),
        durationMinutes: data.durationMinutes ?? 60,
        organizedById: data.organizedById,
      },
      include: {
        organizedBy: { select: { id: true, name: true, email: true } },
      },
    });

    // TODO: Integrate Google Calendar via google-calendar.service.ts
    // if (data.sendCalendarInvite) { ... }

    logger.info({ meetingId: meeting.id, title: data.title }, 'Meeting scheduled');
    return meeting;
  },

  /** Update meeting details */
  async update(meetingId: string, data: {
    title?: string;
    scheduledAt?: string;
    durationMinutes?: number;
    status?: string;
  }) {
    const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!existing) throw new NotFoundError('Meeting');

    const updateData: Prisma.MeetingUpdateInput = {};
    if (data.title) updateData.title = data.title;
    if (data.scheduledAt) updateData.scheduledAt = new Date(data.scheduledAt);
    if (data.durationMinutes) updateData.durationMinutes = data.durationMinutes;
    if (data.status) updateData.status = data.status as never;

    const meeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: updateData,
    });

    logger.info({ meetingId }, 'Meeting updated');
    return meeting;
  },

  /** Delete a meeting */
  async delete(meetingId: string) {
    const existing = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!existing) throw new NotFoundError('Meeting');

    await prisma.meeting.delete({ where: { id: meetingId } });
    logger.info({ meetingId }, 'Meeting deleted');
    return { deleted: true };
  },

  // ── Meeting Notes ───────────────────────────

  /** Get all notes for a meeting */
  async getNotes(meetingId: string) {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundError('Meeting');

    return prisma.meetingNote.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'desc' },
      include: { writtenBy: { select: { id: true, name: true, email: true } } },
    });
  },

  /** Add a note to a meeting */
  async addNote(meetingId: string, userId: string, body: string) {
    const meeting = await prisma.meeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new NotFoundError('Meeting');

    const note = await prisma.meetingNote.create({
      data: {
        meetingId,
        body,
        writtenById: userId,
      },
      include: { writtenBy: { select: { id: true, name: true } } },
    });

    logger.info({ meetingId, noteId: note.id }, 'Meeting note added');
    return note;
  },

  /** Delete a meeting note */
  async deleteNote(noteId: string) {
    const note = await prisma.meetingNote.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundError('Meeting note');

    await prisma.meetingNote.delete({ where: { id: noteId } });
    logger.info({ noteId }, 'Meeting note deleted');
    return { deleted: true };
  },

  /** Get upcoming meetings (next 7 days) */
  async getUpcoming(userId?: string) {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const where: Prisma.MeetingWhereInput = {
      scheduledAt: { gte: now, lte: weekFromNow },
      status: 'UPCOMING',
    };
    if (userId) where.organizedById = userId;

    return prisma.meeting.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      include: {
        client: { select: { id: true, companyName: true } },
        lead: { select: { id: true, companyName: true } },
        organizedBy: { select: { id: true, name: true } },
      },
    });
  },
};
