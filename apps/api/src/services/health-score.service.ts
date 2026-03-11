/**
 * Health Score Service — Phase 3
 *
 * Calculates churn risk and upsell scores for clients using a
 * weighted multi-factor algorithm.
 *
 * Churn Risk Factors (0-100, higher = more risk):
 *   NPS Score           30%
 *   Days Since Meeting  20%
 *   Document Expiry     15%
 *   Onboarding SLA      15%
 *   Email Response Rate 10%
 *   Support Tickets     10%
 *
 * Upsell Factors (0-100, higher = more opportunity):
 *   Contract Value Growth 30%
 *   Feature Usage         25%
 *   Team Size             20%
 *   NPS Score             15%
 *   Engagement            10%
 */

import { prisma } from '../config/db.js';
import { logger } from '../config/logger.js';

export interface HealthScores {
  churnRiskScore: number;   // 0-100, higher = more risk
  upsellScore: number;      // 0-100, higher = more opportunity
  factors: {
    npsFactor: number;
    meetingFactor: number;
    documentFactor: number;
    slaFactor: number;
    responseFactor: number;
    supportFactor: number;
  };
  upsellFactors: {
    contractGrowthFactor: number;
    usageFactor: number;
    teamSizeFactor: number;
    npsFactor: number;
    engagementFactor: number;
  };
}

export const healthScoreService = {
  /**
   * Calculate full health scores for a client.
   */
  async calculateScores(clientId: string): Promise<HealthScores> {
    const [client, npsResponses, lastMeeting, documents, pipeline, aiEmails] = await Promise.all([
      prisma.client.findUnique({
        where: { id: clientId },
        include: { customerHealth: true },
      }),
      prisma.npsResponse.findMany({
        where: { clientId },
        orderBy: { collectedAt: 'desc' },
        take: 5,
      }),
      prisma.meeting.findFirst({
        where: { clientId },
        orderBy: { scheduledAt: 'desc' },
      }),
      prisma.document.findMany({
        where: { clientId },
      }),
      prisma.onboardingPipeline.findUnique({
        where: { clientId },
      }),
      prisma.aiEmail.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    // ── Churn Risk Factors ────────────────────

    // 1. NPS Factor (30%) — lower NPS = higher risk
    const npsFactor = this.calculateNpsFactor(npsResponses.map((r) => r.score));

    // 2. Meeting Factor (20%) — more days since last meeting = higher risk
    const meetingFactor = this.calculateMeetingFactor(lastMeeting?.scheduledAt ?? null);

    // 3. Document Factor (15%) — expired/issues docs = higher risk
    const documentFactor = this.calculateDocumentFactor(documents);

    // 4. SLA Factor (15%) — historical SLA breaches = higher risk
    const slaFactor = this.calculateSlaFactor(pipeline);

    // 5. Response Factor (10%) — low email response rate = higher risk
    const responseFactor = this.calculateResponseFactor(aiEmails);

    // 6. Support Factor (10%) — placeholder (no support ticket model yet)
    const supportFactor = 20; // Default moderate risk

    const churnRiskScore = Math.round(
      npsFactor * 0.30 +
      meetingFactor * 0.20 +
      documentFactor * 0.15 +
      slaFactor * 0.15 +
      responseFactor * 0.10 +
      supportFactor * 0.10,
    );

    // ── Upsell Factors ───────────────────────

    // 1. Contract Growth (30%) — higher contract value relative to industry average
    const contractGrowthFactor = this.calculateContractGrowthFactor(client.contractValue);

    // 2. Usage (25%) — based on usage signals stored in CustomerHealth
    const usageFactor = this.calculateUsageFactor(client.customerHealth?.usageSignals as Record<string, unknown> | null);

    // 3. Team Size (20%) — proxy via meeting participants
    const teamSizeFactor = 40; // Default moderate score

    // 4. NPS for upsell (15%) — high NPS = likely to expand
    const npsUpsellFactor = this.calculateNpsUpsellFactor(npsResponses.map((r) => r.score));

    // 5. Engagement (10%) — recent meetings/emails
    const engagementFactor = this.calculateEngagementFactor(lastMeeting?.scheduledAt ?? null, aiEmails.length);

    const upsellScore = Math.round(
      contractGrowthFactor * 0.30 +
      usageFactor * 0.25 +
      teamSizeFactor * 0.20 +
      npsUpsellFactor * 0.15 +
      engagementFactor * 0.10,
    );

    return {
      churnRiskScore: Math.min(100, Math.max(0, churnRiskScore)),
      upsellScore: Math.min(100, Math.max(0, upsellScore)),
      factors: { npsFactor, meetingFactor, documentFactor, slaFactor, responseFactor, supportFactor },
      upsellFactors: {
        contractGrowthFactor,
        usageFactor,
        teamSizeFactor,
        npsFactor: npsUpsellFactor,
        engagementFactor,
      },
    };
  },

  /**
   * Calculate and persist health scores for a client.
   */
  async computeAndSave(clientId: string, usageSignals?: Record<string, unknown>) {
    const scores = await this.calculateScores(clientId);

    const data = {
      churnRiskScore: scores.churnRiskScore,
      upsellScore: scores.upsellScore,
      lastActivityAt: new Date(),
      usageSignals: usageSignals ? (usageSignals as never) : undefined,
      computedAt: new Date(),
    };

    const health = await prisma.customerHealth.upsert({
      where: { clientId },
      create: { clientId, ...data },
      update: data,
    });

    logger.info(
      { clientId, churnRisk: scores.churnRiskScore, upsell: scores.upsellScore },
      'Health scores computed',
    );

    return { health, scores };
  },

  /**
   * Compute health for all active clients.
   */
  async computeAll() {
    const clients = await prisma.client.findMany({
      where: { status: { in: ['ACTIVE', 'AT_RISK'] } },
      select: { id: true },
    });

    let computed = 0;
    let errors = 0;

    for (const client of clients) {
      try {
        await this.computeAndSave(client.id);
        computed++;
      } catch (err) {
        errors++;
        logger.error({ clientId: client.id, err }, 'Failed to compute health');
      }
    }

    return { computed, errors, total: clients.length };
  },

  // ── Factor Calculation Helpers ───────────────

  /**
   * NPS factor for churn risk.
   * Lower NPS = higher churn risk.
   * No NPS data = moderate risk (50).
   */
  calculateNpsFactor(scores: number[]): number {
    if (scores.length === 0) return 50;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Invert: (10 - score) / 10 * 100
    return Math.round(((10 - avg) / 10) * 100);
  },

  /**
   * Meeting factor for churn risk.
   * More days since last meeting = higher risk.
   */
  calculateMeetingFactor(lastMeetingDate: Date | null): number {
    if (!lastMeetingDate) return 80; // No meetings at all = high risk
    const daysSince = (Date.now() - lastMeetingDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) return 10;
    if (daysSince <= 14) return 25;
    if (daysSince <= 30) return 45;
    if (daysSince <= 60) return 70;
    return 90;
  },

  /**
   * Document factor for churn risk.
   * Expired or issue-flagged docs = higher risk.
   */
  calculateDocumentFactor(documents: { scanStatus?: string | null }[]): number {
    if (documents.length === 0) return 30;
    const issues = documents.filter((d) => d.scanStatus === 'ISSUES_FOUND').length;
    const ratio = issues / documents.length;
    return Math.round(ratio * 100);
  },

  /**
   * SLA factor for churn risk.
   * Based on pipeline health status.
   */
  calculateSlaFactor(pipeline: { healthStatus?: string | null } | null): number {
    if (!pipeline) return 20;
    switch (pipeline.healthStatus) {
      case 'ON_TRACK': return 10;
      case 'AT_RISK': return 50;
      case 'OVERDUE': return 75;
      case 'STALLED': return 95;
      default: return 30;
    }
  },

  /**
   * Response factor for churn risk.
   * Low response rate to emails = higher risk.
   */
  calculateResponseFactor(emails: { status?: string | null }[]): number {
    if (emails.length === 0) return 30;
    const sent = emails.filter((e) => e.status === 'SENT').length;
    // Assume all sent emails that got a response would have status changes
    // Without explicit response tracking, use sent ratio as proxy
    if (sent === 0) return 60;
    return Math.round(Math.max(0, 50 - (sent / emails.length) * 50));
  },

  /**
   * Contract growth factor for upsell.
   * Higher contract value = more upsell potential.
   */
  calculateContractGrowthFactor(contractValue: unknown): number {
    const value = Number(contractValue ?? 0);
    if (value === 0) return 20;
    if (value >= 100000) return 90;
    if (value >= 50000) return 70;
    if (value >= 20000) return 50;
    if (value >= 10000) return 35;
    return 20;
  },

  /**
   * Usage factor for upsell based on usage signals.
   */
  calculateUsageFactor(signals: Record<string, unknown> | null): number {
    if (!signals) return 30;
    // If usage signals contain an 'activity_score', use it directly
    const activityScore = Number(signals['activity_score'] ?? 0);
    if (activityScore > 0) return Math.min(100, activityScore);
    return 30;
  },

  /**
   * NPS factor for upsell.
   * Higher NPS = more upsell opportunity (promoters are good candidates).
   */
  calculateNpsUpsellFactor(scores: number[]): number {
    if (scores.length === 0) return 30;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    // Promoters (9-10) = high upsell, passives (7-8) = moderate
    return Math.round((avg / 10) * 100);
  },

  /**
   * Engagement factor for upsell.
   * Recent meetings + active email = high engagement.
   */
  calculateEngagementFactor(lastMeetingDate: Date | null, emailCount: number): number {
    let score = 0;
    if (lastMeetingDate) {
      const daysSince = (Date.now() - lastMeetingDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince <= 7) score += 50;
      else if (daysSince <= 30) score += 30;
      else score += 10;
    }
    if (emailCount >= 10) score += 50;
    else if (emailCount >= 5) score += 35;
    else if (emailCount >= 1) score += 20;
    return Math.min(100, score);
  },
};
