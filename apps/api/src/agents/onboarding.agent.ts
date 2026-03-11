/**
 * Onboarding Agent — Phase 2
 *
 * Monitors checklist completion per stage, auto-advances stages when all
 * mandatory gates are cleared, detects blocked stages, and generates
 * AI next-action suggestions.
 */

import { BaseAgent, type AgentTask, type AgentResult } from './base.agent.js';
import { EVENTS } from '../services/event-bus.service.js';
import { prisma } from '../config/db.js';

const STAGE_ORDER = [
  'DEAL_CLOSED', 'KICKOFF', 'REQUIREMENTS_GATHERING', 'DOCUMENTATION',
  'TECHNICAL_SETUP', 'TESTING_UAT', 'GO_LIVE', 'TRAINING', 'COMPLETED',
] as const;

class OnboardingAgent extends BaseAgent {
  constructor() {
    super('onboarding');
  }

  async initialize(): Promise<void> {
    // Listen for stage changes to trigger checklist creation
    this.subscribeToEvent(EVENTS.STAGE_CHANGED, async (event) => {
      const clientId = event.payload['clientId'] as string;
      const toStage = event.payload['toStage'] as string;
      if (clientId && toStage) {
        this.logger.info({ clientId, toStage }, 'Stage changed — checking auto-advance eligibility');
        await this.checkAutoAdvance(clientId);
      }
    });

    // Listen for checklist completions
    this.subscribeToEvent(EVENTS.CHECKLIST_COMPLETED, async (event) => {
      const clientId = event.payload['clientId'] as string;
      if (clientId) {
        this.logger.info({ clientId }, 'Checklist item completed — checking gate status');
        await this.checkAutoAdvance(clientId);
      }
    });

    this.logger.info('Onboarding Agent initialized');
  }

  async executeTask(task: AgentTask): Promise<AgentResult> {
    try {
      switch (task.type) {
        case 'check-auto-advance': {
          const clientId = task.payload['clientId'] as string;
          const result = await this.checkAutoAdvance(clientId);
          return { success: true, data: result };
        }

        case 'detect-blocked': {
          const result = await this.detectBlockedPipelines();
          return { success: true, data: result };
        }

        case 'generate-suggestions': {
          const clientId = task.payload['clientId'] as string;
          const result = await this.generateSuggestions(clientId);
          return { success: true, data: result };
        }

        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ err }, 'Onboarding task failed');
      return { success: false, error };
    }
  }

  async runScheduledTask(_config: Record<string, unknown>): Promise<AgentResult> {
    // Scheduled: check all active pipelines for auto-advance and blocked detection
    const [autoAdvanceResults, blockedResults] = await Promise.all([
      this.checkAllPipelinesForAdvance(),
      this.detectBlockedPipelines(),
    ]);

    return {
      success: true,
      data: { autoAdvanced: autoAdvanceResults, blocked: blockedResults },
    };
  }

  // ── Private Methods ─────────────────────────

  private async checkAutoAdvance(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({
      where: { clientId },
      include: { checklistItems: true },
    });
    if (!pipeline || pipeline.completedAt) return { advanced: false };

    const currentStageItems = pipeline.checklistItems.filter(
      (i) => i.stage === pipeline.currentStage,
    );
    const mandatoryPending = currentStageItems.filter(
      (i) => i.isMandatory && !i.isCompleted,
    );

    if (mandatoryPending.length === 0 && currentStageItems.length > 0) {
      // All mandatory items completed — auto-advance
      const currentIdx = STAGE_ORDER.indexOf(pipeline.currentStage as (typeof STAGE_ORDER)[number]);
      if (currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1) {
        const nextStage = STAGE_ORDER[currentIdx + 1]!;

        await prisma.$transaction([
          prisma.onboardingPipeline.update({
            where: { clientId },
            data: {
              currentStage: nextStage,
              lastActivityAt: new Date(),
              ...(nextStage === 'COMPLETED' ? { completedAt: new Date() } : {}),
            },
          }),
          prisma.onboardingStageLog.create({
            data: {
              pipelineId: pipeline.id,
              fromStage: pipeline.currentStage,
              toStage: nextStage,
              transitionedById: 'SYSTEM',
              notes: 'Auto-advanced by onboarding agent — all gates cleared',
            },
          }),
        ]);

        await this.publishEvent(EVENTS.STAGE_CHANGED, {
          clientId,
          fromStage: pipeline.currentStage,
          toStage: nextStage,
          autoAdvanced: true,
        });

        await this.logAction(
          'auto_advance',
          'pipeline',
          pipeline.id,
          'success',
          `Auto-advanced from ${pipeline.currentStage} to ${nextStage}`,
        );

        this.logger.info({ clientId, from: pipeline.currentStage, to: nextStage }, 'Pipeline auto-advanced');
        return { advanced: true, from: pipeline.currentStage, to: nextStage };
      }
    }

    return { advanced: false, pendingMandatory: mandatoryPending.length };
  }

  private async checkAllPipelinesForAdvance() {
    const pipelines = await prisma.onboardingPipeline.findMany({
      where: { completedAt: null },
      select: { clientId: true },
    });

    let advanced = 0;
    for (const p of pipelines) {
      const result = await this.checkAutoAdvance(p.clientId);
      if (result.advanced) advanced++;
    }

    return { checked: pipelines.length, advanced };
  }

  private async detectBlockedPipelines() {
    const stalledThresholdHours = 72; // 3 days without activity
    const threshold = new Date(Date.now() - stalledThresholdHours * 60 * 60 * 1000);

    const stalled = await prisma.onboardingPipeline.findMany({
      where: {
        completedAt: null,
        lastActivityAt: { lt: threshold },
        healthStatus: { not: 'STALLED' },
      },
      include: { client: { select: { id: true, companyName: true, assignedManagerId: true } } },
    });

    for (const pipeline of stalled) {
      // Create notification for assigned manager
      if (pipeline.client.assignedManagerId) {
        await prisma.notification.create({
          data: {
            userId: pipeline.client.assignedManagerId,
            type: 'SLA_ALERT',
            title: `Stalled: ${pipeline.client.companyName}`,
            body: `${pipeline.client.companyName} has had no activity in ${pipeline.currentStage} for ${stalledThresholdHours}+ hours`,
          },
        });
      }

      await this.logAction(
        'detect_stalled',
        'pipeline',
        pipeline.id,
        'success',
        `Pipeline stalled in ${pipeline.currentStage}`,
      );
    }

    return { stalledCount: stalled.length };
  }

  private async generateSuggestions(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({
      where: { clientId },
      include: {
        checklistItems: { where: { isCompleted: false } },
        requirements: true,
        client: true,
      },
    });
    if (!pipeline) return { suggestions: [] };

    const context = `
Client: ${pipeline.client.companyName}
Current Stage: ${pipeline.currentStage}
Pending items: ${pipeline.checklistItems.map((i) => i.title).join(', ') || 'None'}
Requirements: ${pipeline.requirements.length}
    `.trim();

    const decision = await this.decide(context, [
      'focus_on_checklist',
      'schedule_meeting',
      'generate_email',
      'no_action_needed',
    ]);

    await this.logAction(
      'generate_suggestions',
      'pipeline',
      pipeline.id,
      'success',
      decision.action,
      { reasoning: decision.reasoning },
    );

    return { suggestions: [decision] };
  }
}

export const onboardingAgent = new OnboardingAgent();
