/**
 * Success Service — Phase 3
 *
 * Customer success dashboard, health monitoring, upsell flagging,
 * and BD re-entry workflow.
 */

import { prisma } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';
import { paginate, buildPaginationMeta } from '../../utils/pagination.js';
import { healthScoreService } from '../../services/health-score.service.js';
import { eventBus, EVENTS } from '../../services/event-bus.service.js';
import { notificationQueue } from '../../config/queue.js';

export const successService = {
  /**
   * Success dashboard — all clients with health overview.
   */
  async getDashboard(query: {
    status: string;
    page: number;
    limit: number;
    sortBy: string;
    sortOrder: string;
  }) {
    // Build client filter
    const clientWhere: Record<string, unknown> = {};
    if (query.status === 'HEALTHY') {
      clientWhere['status'] = 'ACTIVE';
    } else if (query.status === 'AT_RISK') {
      clientWhere['status'] = 'AT_RISK';
    } else if (query.status === 'CHURNED') {
      clientWhere['status'] = 'CHURNED';
    }
    // 'ALL' = no filter

    // Build order by
    let orderBy: Record<string, string> = {};
    if (query.sortBy === 'churnRisk') {
      orderBy = { churnRiskScore: query.sortOrder };
    } else if (query.sortBy === 'upsellScore') {
      orderBy = { upsellScore: query.sortOrder };
    } else if (query.sortBy === 'lastActivity') {
      orderBy = { lastActivityAt: query.sortOrder };
    }

    // Get clients with health data
    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where: clientWhere,
        ...paginate(query.page, query.limit),
        orderBy: { updatedAt: 'desc' },
        include: {
          customerHealth: true,
          npsResponses: {
            orderBy: { collectedAt: 'desc' },
            take: 1,
          },
          assignedManager: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.client.count({ where: clientWhere }),
    ]);

    // Aggregate stats
    const [healthStats, npsStats] = await Promise.all([
      prisma.customerHealth.aggregate({
        _avg: { churnRiskScore: true, upsellScore: true },
        _count: true,
      }),
      prisma.npsResponse.aggregate({
        _avg: { score: true },
        _count: true,
      }),
    ]);

    const upsellCount = await prisma.customerHealth.count({
      where: { upsellFlagged: true },
    });

    // Status distribution
    const statusCounts = await prisma.client.groupBy({
      by: ['status'],
      _count: true,
    });

    const distribution = statusCounts.reduce(
      (acc, item) => {
        acc[item.status] = item._count;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      clients,
      stats: {
        totalClients: total,
        avgChurnRisk: Math.round((healthStats._avg.churnRiskScore ?? 0) * 10) / 10,
        avgUpsellScore: Math.round((healthStats._avg.upsellScore ?? 0) * 10) / 10,
        avgNps: Math.round((npsStats._avg.score ?? 0) * 10) / 10,
        activeUpsells: upsellCount,
        distribution,
      },
      meta: buildPaginationMeta(total, query.page, query.limit),
    };
  },

  /**
   * Detailed health view for a specific client.
   */
  async getClientHealth(clientId: string) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        customerHealth: true,
        npsResponses: { orderBy: { collectedAt: 'desc' }, take: 10 },
        meetings: { orderBy: { scheduledAt: 'desc' }, take: 5 },
        documents: { select: { id: true, scanStatus: true, name: true } },
        onboardingPipeline: { select: { currentStage: true, healthStatus: true, completedAt: true } },
        assignedManager: { select: { id: true, name: true, email: true } },
      },
    });
    if (!client) throw new NotFoundError('Client');

    // Calculate live scores
    const scores = await healthScoreService.calculateScores(clientId);

    return {
      client,
      health: client.customerHealth,
      liveScores: scores,
      npsHistory: client.npsResponses,
      recentMeetings: client.meetings,
      documentStatus: client.documents,
      onboarding: client.onboardingPipeline,
    };
  },

  /**
   * Flag a client as an upsell opportunity.
   */
  async flagUpsell(clientId: string, userId: string, opts?: { notes?: string; score?: number }) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { customerHealth: true },
    });
    if (!client) throw new NotFoundError('Client');

    // Upsert health record with upsell flag
    const health = await prisma.customerHealth.upsert({
      where: { clientId },
      create: {
        clientId,
        churnRiskScore: 0,
        upsellScore: opts?.score ?? 70,
        upsellFlagged: true,
        upsellFlaggedAt: new Date(),
      },
      update: {
        upsellFlagged: true,
        upsellFlaggedAt: new Date(),
        upsellScore: opts?.score ?? client.customerHealth?.upsellScore ?? 70,
      },
    });

    // Publish event
    await eventBus.publish(EVENTS.UPSELL_DETECTED, {
      clientId,
      flaggedBy: userId,
      notes: opts?.notes,
      score: health.upsellScore,
    }, 'success-service');

    // Queue notification for manager
    await notificationQueue.add('upsell-flagged', {
      clientId,
      companyName: client.companyName,
      userId: client.assignedManagerId,
      notes: opts?.notes,
      type: 'UPSELL_SIGNAL',
    });

    logger.info({ clientId, score: health.upsellScore }, 'Client flagged for upsell');

    return health;
  },

  /**
   * Refresh health scores for a client.
   */
  async refreshHealth(clientId: string, usageSignals?: Record<string, unknown>) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundError('Client');

    const result = await healthScoreService.computeAndSave(clientId, usageSignals);

    // If churn risk is high, check if we need to update client status
    if (result.scores.churnRiskScore >= 70 && client.status === 'ACTIVE') {
      await prisma.client.update({
        where: { id: clientId },
        data: { status: 'AT_RISK' as never },
      });

      await eventBus.publish(EVENTS.CHURN_DETECTED, {
        clientId,
        churnRiskScore: result.scores.churnRiskScore,
      }, 'success-service');

      await notificationQueue.add('churn-alert', {
        clientId,
        companyName: client.companyName,
        userId: client.assignedManagerId,
        churnRiskScore: result.scores.churnRiskScore,
        type: 'SLA_ALERT',
      });
    }

    return result;
  },

  /**
   * Re-enter a client into the BD pipeline (upsell → new lead).
   */
  async reenterBd(clientId: string, userId: string, reason: string, notes?: string) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { lead: true },
    });
    if (!client) throw new NotFoundError('Client');

    // Create a new lead from the existing client data
    const newLead = await prisma.lead.create({
      data: {
        companyName: client.companyName,
        contactName: client.primaryContactName,
        contactEmail: client.primaryContactEmail,
        contactPhone: client.primaryContactPhone,
        source: 'REFERRAL' as never,
        status: 'APPROVED' as never,
        aiScore: 80, // High score — existing client
        assignedTo: { connect: { id: client.assignedManagerId } },
        reviewNotes: `BD Re-entry from existing client. Reason: ${reason}${notes ? `\nNotes: ${notes}` : ''}`,
      },
    });

    // Mark upsell as actioned
    await prisma.customerHealth.update({
      where: { clientId },
      data: {
        upsellFlagged: false,
      },
    });

    logger.info({ clientId, newLeadId: newLead.id, reason }, 'Client re-entered BD pipeline');

    return {
      newLeadId: newLead.id,
      clientId,
      reason,
      message: `Lead created from ${client.companyName} for BD re-entry`,
    };
  },
};
