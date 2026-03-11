/**
 * NPS Agent — Phase 3
 *
 * Autonomous NPS survey scheduling, response tracking,
 * detractor alerting, and promoter celebration.
 */

import { BaseAgent, type AgentTask, type AgentResult } from './base.agent.js';
import { prisma } from '../config/db.js';
import { EVENTS } from '../services/event-bus.service.js';
import { emailSendQueue, notificationQueue } from '../config/queue.js';

class NpsAgent extends BaseAgent {
  constructor() {
    super('nps');
  }

  async initialize(): Promise<void> {
    // Subscribe to onboarding completion → schedule first NPS
    this.subscribeToEvent(EVENTS.ONBOARDING_COMPLETED, async (event) => {
      const clientId = event.payload['clientId'] as string;
      this.logger.info({ clientId }, 'Onboarding completed — scheduling NPS survey');
      await this.scheduleFirstNps(clientId);
    });

    // Subscribe to NPS submitted → react to detractors/promoters
    this.subscribeToEvent(EVENTS.NPS_SUBMITTED, async (event) => {
      const score = event.payload['score'] as number;
      const clientId = event.payload['clientId'] as string;

      if (score >= 9) {
        await this.celebratePromoter(clientId, score);
      }
    });

    this.logger.info('NPS Agent initialized');
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.type) {
        case 'schedule-survey': {
          const clientId = task.payload['clientId'] as string;
          await this.scheduleFirstNps(clientId);
          return { success: true, data: { clientId, message: 'NPS survey scheduled' } };
        }

        case 'check-pending': {
          const result = await this.checkPendingSurveys();
          return { success: true, data: result };
        }

        case 'weekly-report': {
          const result = await this.generateWeeklyReport();
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ err }, 'NPS task failed');
      return { success: false, error };
    }
  }

  async runScheduledTask(config: Record<string, unknown>): Promise<AgentResult> {
    const daysAfter = (config['daysAfterOnboarding'] as number) ?? 7;
    const result = await this.runWeeklySurveyCheck(daysAfter);
    return { success: true, data: result };
  }

  // ── Private Methods ─────────────────────────

  /**
   * Schedule the first NPS survey X days after onboarding completion.
   */
  private async scheduleFirstNps(clientId: string) {
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) return;

    // Queue survey email with a 7-day delay
    await emailSendQueue.add(
      'nps-survey',
      {
        clientId,
        to: client.primaryContactEmail,
        companyName: client.companyName,
        sendVia: 'EMAIL',
        subject: `How is your experience with us, ${client.companyName}?`,
      },
      { delay: 7 * 24 * 60 * 60 * 1000 }, // 7 days in ms
    );

    await this.logAction('schedule-nps', 'client', clientId, 'success', 'First NPS scheduled 7 days after onboarding');
  }

  /**
   * Check for clients who haven't had NPS in 90 days.
   */
  private async checkPendingSurveys() {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // Find active clients with no recent NPS
    const clients = await prisma.client.findMany({
      where: {
        status: { in: ['ACTIVE', 'AT_RISK'] },
        npsResponses: {
          none: { collectedAt: { gte: ninetyDaysAgo } },
        },
      },
      select: { id: true, companyName: true, primaryContactEmail: true },
    });

    let queued = 0;
    for (const client of clients) {
      await emailSendQueue.add('nps-survey', {
        clientId: client.id,
        to: client.primaryContactEmail,
        companyName: client.companyName,
        sendVia: 'EMAIL',
        subject: `Quick check-in — how are things going, ${client.companyName}?`,
      });
      queued++;
    }

    this.logger.info({ queued, total: clients.length }, 'Pending NPS surveys queued');
    return { queued, clientsChecked: clients.length };
  }

  /**
   * Weekly survey check — send to clients due for NPS.
   */
  private async runWeeklySurveyCheck(daysAfterOnboarding: number) {
    const cutoff = new Date(Date.now() - daysAfterOnboarding * 24 * 60 * 60 * 1000);

    // Clients who completed onboarding but have 0 NPS responses
    const newClients = await prisma.client.findMany({
      where: {
        status: 'ACTIVE',
        onboardingPipeline: {
          currentStage: 'COMPLETED',
          completedAt: { lte: cutoff },
        },
        npsResponses: { none: {} },
      },
      select: { id: true, companyName: true, primaryContactEmail: true },
    });

    let scheduled = 0;
    for (const client of newClients) {
      await emailSendQueue.add('nps-survey', {
        clientId: client.id,
        to: client.primaryContactEmail,
        companyName: client.companyName,
        sendVia: 'EMAIL',
        subject: `We'd love your feedback, ${client.companyName}!`,
      });
      scheduled++;
    }

    // Also check pending (90-day overdue)
    const pending = await this.checkPendingSurveys();

    return { newClientsScheduled: scheduled, ...pending };
  }

  /**
   * Celebrate a promoter response (NPS 9-10).
   */
  private async celebratePromoter(clientId: string, score: number) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { companyName: true, assignedManagerId: true },
    });
    if (!client) return;

    await notificationQueue.add('nps-promoter', {
      userId: client.assignedManagerId,
      type: 'UPSELL_SIGNAL',
      title: `🎉 ${client.companyName} is a promoter! (NPS: ${score})`,
      body: `Great news — ${client.companyName} gave an NPS score of ${score}. Consider upsell opportunities.`,
    });

    await this.logAction('celebrate-promoter', 'client', clientId, 'success', `Promoter NPS ${score}`);
  }

  /**
   * Generate a weekly NPS report.
   */
  private async generateWeeklyReport() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const responses = await prisma.npsResponse.findMany({
      where: { collectedAt: { gte: weekAgo } },
      include: { client: { select: { companyName: true } } },
    });

    const scores = responses.map((r) => r.score);
    const total = scores.length;
    const avg = total > 0 ? scores.reduce((a, b) => a + b, 0) / total : 0;
    const promoters = scores.filter((s) => s >= 9).length;
    const detractors = scores.filter((s) => s <= 6).length;
    const npsScore = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0;

    return {
      period: 'last_7_days',
      total,
      average: Math.round(avg * 10) / 10,
      npsScore,
      promoters,
      passives: total - promoters - detractors,
      detractors,
    };
  }
}

export const npsAgent = new NpsAgent();
