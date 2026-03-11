/**
 * Upsell Agent — Phase 3
 *
 * Autonomous upsell detection: analyzes client usage patterns,
 * NPS scores, and engagement to identify expansion opportunities.
 */

import { BaseAgent, type AgentTask, type AgentResult } from './base.agent.js';
import { prisma } from '../config/db.js';
import { EVENTS } from '../services/event-bus.service.js';
import { notificationQueue } from '../config/queue.js';

class UpsellAgent extends BaseAgent {
  constructor() {
    super('upsell');
  }

  async initialize(): Promise<void> {
    // React to NPS promoters — potential upsell
    this.subscribeToEvent(EVENTS.NPS_SUBMITTED, async (event) => {
      const score = event.payload['score'] as number;
      const clientId = event.payload['clientId'] as string;

      if (score >= 9) {
        this.logger.info({ clientId, score }, 'Promoter detected — checking upsell potential');
        await this.evaluateClient(clientId);
      }
    });

    this.logger.info('Upsell Agent initialized');
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.type) {
        case 'evaluate-client': {
          const clientId = task.payload['clientId'] as string;
          const result = await this.evaluateClient(clientId);
          return { success: true, data: result };
        }

        case 'scan-all': {
          const result = await this.scanAllClients();
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ err }, 'Upsell task failed');
      return { success: false, error };
    }
  }

  async runScheduledTask(config: Record<string, unknown>): Promise<AgentResult> {
    const threshold = (config['threshold'] as number) ?? 60;
    const result = await this.scanAllClients(threshold);
    return { success: true, data: result };
  }

  // ── Private Methods ─────────────────────────

  /**
   * Evaluate a single client for upsell potential.
   */
  private async evaluateClient(clientId: string) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        customerHealth: true,
        npsResponses: { orderBy: { collectedAt: 'desc' }, take: 5 },
        meetings: { orderBy: { scheduledAt: 'desc' }, take: 5 },
        requirements: true,
      },
    });
    if (!client) return { clientId, eligible: false, reason: 'Client not found' };

    // Calculate upsell score based on signals
    const signals = this.collectSignals(client);
    const score = this.calculateUpsellScore(signals);

    // If score is high enough and not already flagged, flag it
    if (score >= 60 && !client.customerHealth?.upsellFlagged) {
      await prisma.customerHealth.upsert({
        where: { clientId },
        create: {
          clientId,
          churnRiskScore: client.customerHealth?.churnRiskScore ?? 0,
          upsellScore: score,
          upsellFlagged: true,
          upsellFlaggedAt: new Date(),
        },
        update: {
          upsellScore: score,
          upsellFlagged: true,
          upsellFlaggedAt: new Date(),
        },
      });

      await this.publishEvent(EVENTS.UPSELL_DETECTED, {
        clientId,
        companyName: client.companyName,
        score,
        signals,
      });

      await notificationQueue.add('upsell-opportunity', {
        userId: client.assignedManagerId,
        type: 'UPSELL_SIGNAL',
        title: `💰 Upsell opportunity: ${client.companyName} (score: ${score})`,
        body: `${client.companyName} shows strong upsell signals. Key factors: ${this.summarizeSignals(signals)}`,
      });

      await this.logAction(
        'flag-upsell',
        'client',
        clientId,
        'success',
        `Upsell score ${score}. ${this.summarizeSignals(signals)}`,
      );

      return { clientId, eligible: true, score, signals };
    }

    return { clientId, eligible: false, score, reason: score < 60 ? 'Score below threshold' : 'Already flagged' };
  }

  /**
   * Scan all active clients for upsell opportunities.
   */
  private async scanAllClients(threshold: number = 60) {
    const clients = await prisma.client.findMany({
      where: { status: { in: ['ACTIVE'] } },
      include: {
        customerHealth: true,
        npsResponses: { orderBy: { collectedAt: 'desc' }, take: 5 },
        meetings: { orderBy: { scheduledAt: 'desc' }, take: 5 },
        requirements: true,
      },
    });

    let flagged = 0;
    let evaluated = 0;

    for (const client of clients) {
      evaluated++;
      const signals = this.collectSignals(client);
      const score = this.calculateUpsellScore(signals);

      if (score >= threshold && !client.customerHealth?.upsellFlagged) {
        await prisma.customerHealth.upsert({
          where: { clientId: client.id },
          create: {
            clientId: client.id,
            churnRiskScore: client.customerHealth?.churnRiskScore ?? 0,
            upsellScore: score,
            upsellFlagged: true,
            upsellFlaggedAt: new Date(),
          },
          update: {
            upsellScore: score,
            upsellFlagged: true,
            upsellFlaggedAt: new Date(),
          },
        });

        await this.publishEvent(EVENTS.UPSELL_DETECTED, {
          clientId: client.id,
          companyName: client.companyName,
          score,
        });

        flagged++;
      }
    }

    this.logger.info({ evaluated, flagged, threshold }, 'Upsell scan completed');

    await this.logAction(
      'upsell-scan',
      'system',
      'all',
      'success',
      `Scanned ${evaluated} clients, flagged ${flagged} for upsell (threshold: ${threshold})`,
    );

    return { evaluated, flagged, threshold };
  }

  // ── Signal Analysis Helpers ─────────────────

  private collectSignals(client: {
    contractValue?: unknown;
    npsResponses: { score: number }[];
    meetings: { scheduledAt: Date }[];
    requirements: { id: string }[];
    customerHealth?: { usageSignals?: unknown } | null;
  }) {
    const npsScores = client.npsResponses.map((r) => r.score);
    const avgNps = npsScores.length > 0 ? npsScores.reduce((a, b) => a + b, 0) / npsScores.length : 0;
    const isPromoter = avgNps >= 9;

    const lastMeeting = client.meetings[0]?.scheduledAt ?? null;
    const daysSinceLastMeeting = lastMeeting
      ? (Date.now() - lastMeeting.getTime()) / (1000 * 60 * 60 * 24)
      : 999;

    const contractValue = Number(client.contractValue ?? 0);
    const recentMeetings = client.meetings.length;
    const requirementCount = client.requirements.length;

    return {
      avgNps,
      isPromoter,
      contractValue,
      daysSinceLastMeeting,
      recentMeetings,
      requirementCount,
      hasUsageData: !!client.customerHealth?.usageSignals,
    };
  }

  private calculateUpsellScore(signals: ReturnType<typeof this.collectSignals>): number {
    let score = 0;

    // NPS weight (30%): promoters get high score
    if (signals.isPromoter) score += 30;
    else if (signals.avgNps >= 7) score += 20;
    else if (signals.avgNps >= 5) score += 10;

    // Contract value (25%): higher = more room to expand
    if (signals.contractValue >= 50000) score += 25;
    else if (signals.contractValue >= 20000) score += 18;
    else if (signals.contractValue >= 10000) score += 12;
    else score += 5;

    // Engagement (20%): active meetings = engaged client
    if (signals.daysSinceLastMeeting <= 7) score += 20;
    else if (signals.daysSinceLastMeeting <= 14) score += 15;
    else if (signals.daysSinceLastMeeting <= 30) score += 10;

    // Requirements (15%): more requirements = growing needs
    if (signals.requirementCount >= 5) score += 15;
    else if (signals.requirementCount >= 3) score += 10;
    else if (signals.requirementCount >= 1) score += 5;

    // Usage data (10%): having data means they're active
    if (signals.hasUsageData) score += 10;
    else score += 3;

    return Math.min(100, score);
  }

  private summarizeSignals(signals: ReturnType<typeof this.collectSignals>): string {
    const parts: string[] = [];
    if (signals.isPromoter) parts.push('NPS promoter');
    if (signals.contractValue >= 20000) parts.push(`high contract ($${signals.contractValue})`);
    if (signals.daysSinceLastMeeting <= 14) parts.push('recently engaged');
    if (signals.requirementCount >= 3) parts.push('growing requirements');
    return parts.join(', ') || 'moderate signals';
  }
}

export const upsellAgent = new UpsellAgent();
