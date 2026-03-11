/**
 * NPS Service — Phase 3
 *
 * NPS response collection, survey management, trend analytics.
 */

import { prisma } from '../../config/db.js';
import { notificationQueue, emailSendQueue } from '../../config/queue.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';
import { paginate, buildPaginationMeta } from '../../utils/pagination.js';
import { eventBus, EVENTS } from '../../services/event-bus.service.js';

export const npsService = {
  /**
   * Collect an NPS response for a client.
   */
  async collect(clientId: string, score: number, feedback?: string, collectedById?: string) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError('Client');

    if (score < 0 || score > 10) throw new BadRequestError('NPS score must be 0-10');

    const response = await prisma.npsResponse.create({
      data: { clientId, score, feedback, collectedById },
      include: { client: { select: { id: true, companyName: true } } },
    });

    // Publish event
    await eventBus.publish(EVENTS.NPS_SUBMITTED, {
      clientId,
      responseId: response.id,
      score,
    }, 'nps-service');

    // If detractor (score <= 6), publish detractor event + notification
    if (score <= 6) {
      await eventBus.publish(EVENTS.NPS_DETRACTOR, {
        clientId,
        responseId: response.id,
        score,
        feedback,
      }, 'nps-service');

      await notificationQueue.add('nps-detractor', {
        clientId,
        score,
        feedback,
        type: 'NPS_DETRACTOR',
      });
    }

    return response;
  },

  /**
   * Get NPS history for a specific client.
   */
  async getByClient(clientId: string, page: number, limit: number) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError('Client');

    const where = { clientId };

    const [responses, total] = await Promise.all([
      prisma.npsResponse.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { collectedAt: 'desc' },
        include: {
          collectedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.npsResponse.count({ where }),
    ]);

    // Calculate summary stats
    const allScores = await prisma.npsResponse.findMany({
      where: { clientId },
      select: { score: true },
    });

    const summary = this.calculateNpsSummary(allScores.map((r) => r.score));

    return {
      responses,
      summary,
      meta: buildPaginationMeta(total, page, limit),
    };
  },

  /**
   * NPS dashboard — overview across all clients.
   */
  async getDashboard(query: { clientId?: string; page: number; limit: number }) {
    const where: Record<string, unknown> = {};
    if (query.clientId) where['clientId'] = query.clientId;

    const [responses, total, allScores] = await Promise.all([
      prisma.npsResponse.findMany({
        where,
        ...paginate(query.page, query.limit),
        orderBy: { collectedAt: 'desc' },
        include: {
          client: { select: { id: true, companyName: true } },
          collectedBy: { select: { id: true, name: true } },
        },
      }),
      prisma.npsResponse.count({ where }),
      prisma.npsResponse.findMany({
        where,
        select: { score: true, collectedAt: true },
        orderBy: { collectedAt: 'asc' },
      }),
    ]);

    const summary = this.calculateNpsSummary(allScores.map((r) => r.score));

    // Monthly trend (last 12 months)
    const trend = this.calculateMonthlyTrend(allScores);

    return {
      responses,
      summary,
      trend,
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  /**
   * Trigger an NPS survey email for a client.
   */
  async sendSurvey(clientId: string, options: { sendVia: string; subject?: string; message?: string }) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError('Client');

    // Queue the survey email
    await emailSendQueue.add('nps-survey', {
      clientId,
      to: client.primaryContactEmail,
      companyName: client.companyName,
      sendVia: options.sendVia,
      subject: options.subject ?? `How is your experience with us, ${client.companyName}?`,
      message: options.message,
    });

    logger.info({ clientId, sendVia: options.sendVia }, 'NPS survey queued');

    return { message: 'NPS survey queued', clientId, sendVia: options.sendVia };
  },

  // ── Private Helpers ─────────────────────────

  /**
   * Calculate NPS summary: promoters, passives, detractors, net score.
   */
  calculateNpsSummary(scores: number[]) {
    if (scores.length === 0) {
      return { total: 0, promoters: 0, passives: 0, detractors: 0, npsScore: 0, average: 0 };
    }

    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    let sum = 0;

    for (const score of scores) {
      sum += score;
      if (score >= 9) promoters++;
      else if (score >= 7) passives++;
      else detractors++;
    }

    const total = scores.length;
    const npsScore = Math.round(((promoters - detractors) / total) * 100);
    const average = Math.round((sum / total) * 10) / 10;

    return { total, promoters, passives, detractors, npsScore, average };
  },

  /**
   * Calculate monthly NPS trend from scored responses.
   */
  calculateMonthlyTrend(responses: { score: number; collectedAt: Date }[]) {
    const monthMap = new Map<string, number[]>();

    for (const r of responses) {
      const key = `${r.collectedAt.getFullYear()}-${String(r.collectedAt.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthMap.get(key) ?? [];
      existing.push(r.score);
      monthMap.set(key, existing);
    }

    return Array.from(monthMap.entries())
      .map(([month, scores]) => ({
        month,
        ...this.calculateNpsSummary(scores),
      }))
      .slice(-12); // Last 12 months
  },
};
