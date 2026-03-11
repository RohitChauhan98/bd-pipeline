/**
 * Health Agent — Phase 3
 *
 * Daily health score calculation, churn risk detection,
 * status updates, and breach notifications.
 */

import { BaseAgent, type AgentTask, type AgentResult } from './base.agent.js';
import { prisma } from '../config/db.js';
import { EVENTS } from '../services/event-bus.service.js';
import { healthScoreService } from '../services/health-score.service.js';
import { notificationQueue } from '../config/queue.js';

class HealthAgent extends BaseAgent {
  constructor() {
    super('health');
  }

  async initialize(): Promise<void> {
    // React to NPS detractors — immediately recalculate health
    this.subscribeToEvent(EVENTS.NPS_DETRACTOR, async (event) => {
      const clientId = event.payload['clientId'] as string;
      this.logger.info({ clientId }, 'NPS detractor — recalculating health');
      await this.refreshClientHealth(clientId);
    });

    // React to SLA breaches — factor into health
    this.subscribeToEvent(EVENTS.SLA_BREACH, async (event) => {
      const clientId = event.payload['clientId'] as string;
      this.logger.info({ clientId }, 'SLA breach — recalculating health');
      await this.refreshClientHealth(clientId);
    });

    this.logger.info('Health Agent initialized');
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.type) {
        case 'compute-all': {
          const result = await this.computeAllHealth();
          return { success: true, data: result };
        }

        case 'compute-client': {
          const clientId = task.payload['clientId'] as string;
          const result = await this.refreshClientHealth(clientId);
          return { success: true, data: result };
        }

        case 'detect-churn': {
          const result = await this.detectChurnRisks();
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ err }, 'Health task failed');
      return { success: false, error };
    }
  }

  async runScheduledTask(config: Record<string, unknown>): Promise<AgentResult> {
    const riskThreshold = (config['riskThreshold'] as number) ?? 70;

    // Step 1: Compute health for all active clients
    const computeResult = await this.computeAllHealth();

    // Step 2: Detect and alert on high-risk clients
    const churnResult = await this.detectChurnRisks(riskThreshold);

    return {
      success: true,
      data: { ...computeResult, ...churnResult },
    };
  }

  // ── Private Methods ─────────────────────────

  /**
   * Compute health scores for all active/at-risk clients.
   */
  private async computeAllHealth() {
    const result = await healthScoreService.computeAll();
    this.logger.info(result, 'Health scores computed for all clients');

    await this.logAction(
      'compute-all-health',
      'system',
      'all',
      'success',
      `Computed ${result.computed}/${result.total} health scores`,
    );

    return result;
  }

  /**
   * Refresh health scores for a single client.
   */
  private async refreshClientHealth(clientId: string) {
    const result = await healthScoreService.computeAndSave(clientId);

    // Check if we need to update client status
    await this.checkAndUpdateStatus(clientId, result.scores.churnRiskScore);

    return result;
  }

  /**
   * Detect clients with high churn risk and send alerts.
   */
  private async detectChurnRisks(threshold: number = 70) {
    const atRiskClients = await prisma.customerHealth.findMany({
      where: {
        churnRiskScore: { gte: threshold },
        client: { status: { in: ['ACTIVE', 'AT_RISK'] } },
      },
      include: {
        client: { select: { id: true, companyName: true, assignedManagerId: true, status: true } },
      },
      orderBy: { churnRiskScore: 'desc' },
    });

    let alerts = 0;
    let statusUpdates = 0;

    for (const health of atRiskClients) {
      // Update client status if needed
      if (health.client.status === 'ACTIVE') {
        await prisma.client.update({
          where: { id: health.clientId },
          data: { status: 'AT_RISK' as never },
        });
        statusUpdates++;
      }

      // Send notification for high-risk clients
      if (health.churnRiskScore >= threshold) {
        await notificationQueue.add('churn-alert', {
          userId: health.client.assignedManagerId,
          type: 'SLA_ALERT',
          title: `⚠️ Churn risk: ${health.client.companyName} (${health.churnRiskScore}%)`,
          body: `${health.client.companyName} has a churn risk score of ${health.churnRiskScore}%. Immediate attention needed.`,
        });
        alerts++;

        await this.publishEvent(EVENTS.CHURN_DETECTED, {
          clientId: health.clientId,
          churnRiskScore: health.churnRiskScore,
          companyName: health.client.companyName,
        });
      }
    }

    this.logger.info(
      { atRisk: atRiskClients.length, alerts, statusUpdates },
      'Churn detection completed',
    );

    return { atRisk: atRiskClients.length, alerts, statusUpdates };
  }

  /**
   * Check and update client status based on churn risk.
   */
  private async checkAndUpdateStatus(clientId: string, churnRiskScore: number) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { status: true, companyName: true, assignedManagerId: true },
    });
    if (!client) return;

    // Transition ACTIVE → AT_RISK if risk >= 70
    if (client.status === 'ACTIVE' && churnRiskScore >= 70) {
      await prisma.client.update({
        where: { id: clientId },
        data: { status: 'AT_RISK' as never },
      });

      await notificationQueue.add('status-change', {
        userId: client.assignedManagerId,
        type: 'SLA_ALERT',
        title: `${client.companyName} moved to AT_RISK`,
        body: `Churn risk score: ${churnRiskScore}%`,
      });
    }

    // Transition AT_RISK → ACTIVE if risk drops below 40
    if (client.status === 'AT_RISK' && churnRiskScore < 40) {
      await prisma.client.update({
        where: { id: clientId },
        data: { status: 'ACTIVE' as never },
      });
    }
  }
}

export const healthAgent = new HealthAgent();
