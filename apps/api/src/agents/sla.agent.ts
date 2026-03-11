/**
 * SLA Agent — Phase 2
 *
 * Runs periodic SLA checks, calculates time spent in current stage,
 * updates health statuses, and triggers breach notifications.
 */

import { BaseAgent, type AgentTask, type AgentResult } from './base.agent.js';
import { prisma } from '../config/db.js';

class SlaAgent extends BaseAgent {
  constructor() {
    super('sla');
  }

  async initialize(): Promise<void> {
    this.logger.info('SLA Agent initialized');
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.type) {
        case 'sla-check': {
          const result = await this.runSlaCheck();
          return { success: true, data: result };
        }

        case 'check-client': {
          const clientId = task.payload['clientId'] as string;
          const result = await this.checkClientSla(clientId);
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ err }, 'SLA task failed');
      return { success: false, error };
    }
  }

  async runScheduledTask(_config: Record<string, unknown>): Promise<AgentResult> {
    const result = await this.runSlaCheck();
    return { success: true, data: result };
  }

  // ── Private Methods ─────────────────────────

  private async runSlaCheck() {
    const [pipelines, slaConfigs] = await Promise.all([
      prisma.onboardingPipeline.findMany({
        where: { completedAt: null },
        include: {
          client: { select: { id: true, companyName: true, assignedManagerId: true } },
        },
      }),
      prisma.stageSlaConfig.findMany(),
    ]);

    const slaMap = new Map(slaConfigs.map((c) => [c.stage, c]));
    const now = Date.now();
    let updated = 0;
    let breaches = 0;

    for (const pipeline of pipelines) {
      const sla = slaMap.get(pipeline.currentStage);
      if (!sla) continue;

      const hoursInStage = (now - pipeline.lastActivityAt.getTime()) / (1000 * 60 * 60);
      let newHealth: string;

      if (hoursInStage >= sla.slaHours * 1.5) {
        newHealth = 'STALLED';
      } else if (hoursInStage >= sla.slaHours) {
        newHealth = 'OVERDUE';
      } else if (hoursInStage >= sla.slaHours * sla.atRiskPct) {
        newHealth = 'AT_RISK';
      } else {
        newHealth = 'ON_TRACK';
      }

      if (newHealth !== pipeline.healthStatus) {
        await prisma.onboardingPipeline.update({
          where: { id: pipeline.id },
          data: { healthStatus: newHealth },
        });
        updated++;

        // Create notification for escalated health status
        if (
          (newHealth === 'AT_RISK' || newHealth === 'OVERDUE' || newHealth === 'STALLED') &&
          pipeline.client.assignedManagerId
        ) {
          breaches++;
          await prisma.notification.create({
            data: {
              userId: pipeline.client.assignedManagerId,
              type: 'SLA_ALERT',
              title: `SLA ${newHealth}: ${pipeline.client.companyName}`,
              body: `${pipeline.client.companyName} is now ${newHealth.toLowerCase().replace('_', ' ')} in ${pipeline.currentStage} (${Math.round(hoursInStage)}h elapsed, SLA: ${sla.slaHours}h)`,
            },
          });
        }

        await this.logAction(
          'sla_update',
          'pipeline',
          pipeline.id,
          'success',
          `Health status changed to ${newHealth}`,
          { hoursInStage: Math.round(hoursInStage), slaHours: sla.slaHours },
        );
      }
    }

    this.logger.info({ total: pipelines.length, updated, breaches }, 'SLA check completed');
    return { checked: pipelines.length, updated, breaches };
  }

  private async checkClientSla(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({
      where: { clientId },
      include: { client: { select: { companyName: true } } },
    });
    if (!pipeline) return { error: 'Pipeline not found' };

    const sla = await prisma.stageSlaConfig.findUnique({
      where: { stage: pipeline.currentStage },
    });
    if (!sla) return { noSlaConfig: true, stage: pipeline.currentStage };

    const hoursInStage = (Date.now() - pipeline.lastActivityAt.getTime()) / (1000 * 60 * 60);

    return {
      clientId,
      companyName: pipeline.client.companyName,
      currentStage: pipeline.currentStage,
      healthStatus: pipeline.healthStatus,
      hoursInStage: Math.round(hoursInStage * 10) / 10,
      slaHours: sla.slaHours,
      isAtRisk: hoursInStage >= sla.slaHours * sla.atRiskPct,
      isOverdue: hoursInStage >= sla.slaHours,
    };
  }
}

export const slaAgent = new SlaAgent();
