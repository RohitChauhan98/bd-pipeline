/**
 * Onboarding Service — Business Logic
 *
 * Manages the 11-stage client onboarding pipeline, checklist gates,
 * requirements gathering, SLA configuration, and audit trail.
 */

import { Prisma } from '@bd-pipeline/db';
import { prisma } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { NotFoundError, BadRequestError } from '../../utils/api-error.js';
import { paginate, buildPaginationMeta } from '../../utils/pagination.js';

/** Ordered onboarding stages — must match Prisma OnboardingStage enum */
const STAGE_ORDER = [
  'DEAL_CLOSED',
  'KICKOFF',
  'REQUIREMENTS_GATHERING',
  'DOCUMENTATION',
  'TECHNICAL_SETUP',
  'TESTING_UAT',
  'GO_LIVE',
  'TRAINING',
  'COMPLETED',
] as const;

export const onboardingService = {
  // ──────────────────────────────────────────────
  //  Pipeline State
  // ──────────────────────────────────────────────

  /** Get full pipeline state for a client */
  async getPipeline(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({
      where: { clientId },
      include: {
        client: { select: { id: true, companyName: true, primaryContactName: true, primaryContactEmail: true } },
        stageLogs: { orderBy: { transitionedAt: 'desc' } },
        checklistItems: { orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }] },
        requirements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!pipeline) throw new NotFoundError('Onboarding pipeline not found for this client');

    // Calculate SLA status for current stage
    const slaConfig = await prisma.stageSlaConfig.findUnique({
      where: { stage: pipeline.currentStage },
    });

    const hoursInStage = (Date.now() - pipeline.lastActivityAt.getTime()) / (1000 * 60 * 60);
    const slaInfo = slaConfig
      ? {
          slaHours: slaConfig.slaHours,
          hoursElapsed: Math.round(hoursInStage * 10) / 10,
          atRiskThreshold: slaConfig.slaHours * slaConfig.atRiskPct,
          isAtRisk: hoursInStage >= slaConfig.slaHours * slaConfig.atRiskPct,
          isOverdue: hoursInStage >= slaConfig.slaHours,
        }
      : null;

    return { ...pipeline, slaInfo };
  },

  /** List all onboarding pipelines with filtering */
  async listPipelines(query: {
    page: number;
    limit: number;
    stage?: string;
    healthStatus?: string;
    sortBy: string;
    sortOrder: string;
  }) {
    const where: Prisma.OnboardingPipelineWhereInput = {};
    if (query.stage) where.currentStage = query.stage as Prisma.EnumOnboardingStageFilter;
    if (query.healthStatus) where.healthStatus = query.healthStatus as Prisma.EnumHealthStatusFilter;

    const [pipelines, total] = await Promise.all([
      prisma.onboardingPipeline.findMany({
        where,
        ...paginate(query.page, query.limit),
        orderBy: { [query.sortBy]: query.sortOrder },
        include: {
          client: { select: { id: true, companyName: true, primaryContactName: true } },
          checklistItems: {
            where: { isMandatory: true },
            select: { id: true, isCompleted: true, stage: true },
          },
        },
      }),
      prisma.onboardingPipeline.count({ where }),
    ]);

    return { pipelines, meta: buildPaginationMeta(total, query.page, query.limit) };
  },

  /** Get stage definitions with SLA config */
  async getStageDefinitions() {
    const slaConfigs = await prisma.stageSlaConfig.findMany({
      orderBy: { stage: 'asc' },
    });

    const slaMap = new Map(slaConfigs.map((c) => [c.stage, c]));

    return STAGE_ORDER.map((stage, index) => ({
      stage,
      order: index,
      slaConfig: slaMap.get(stage) ?? null,
    }));
  },

  // ──────────────────────────────────────────────
  //  Stage Advancement
  // ──────────────────────────────────────────────

  /** Advance to the next onboarding stage with gate checks */
  async advanceStage(clientId: string, userId: string, notes?: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({ where: { clientId } });
    if (!pipeline) throw new NotFoundError('Pipeline');

    const currentIdx = STAGE_ORDER.indexOf(pipeline.currentStage as (typeof STAGE_ORDER)[number]);
    if (currentIdx === -1 || currentIdx >= STAGE_ORDER.length - 1) {
      throw new BadRequestError('Cannot advance past the final stage');
    }

    // Check all mandatory checklist items are completed for current stage
    const pendingItems = await prisma.checklistItem.count({
      where: {
        pipelineId: pipeline.id,
        stage: pipeline.currentStage,
        isMandatory: true,
        isCompleted: false,
      },
    });
    if (pendingItems > 0) {
      throw new BadRequestError(
        `${pendingItems} mandatory checklist item(s) still pending for ${pipeline.currentStage}`,
      );
    }

    const nextStage = STAGE_ORDER[currentIdx + 1]!;
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const updatedPipeline = await tx.onboardingPipeline.update({
        where: { clientId },
        data: {
          currentStage: nextStage,
          lastActivityAt: now,
          ...(nextStage === 'COMPLETED' ? { completedAt: now } : {}),
        },
      });

      await tx.onboardingStageLog.create({
        data: {
          pipelineId: pipeline.id,
          fromStage: pipeline.currentStage,
          toStage: nextStage,
          transitionedById: userId,
          notes,
        },
      });

      return updatedPipeline;
    });

    logger.info({ clientId, from: pipeline.currentStage, to: nextStage }, 'Onboarding stage advanced');
    return { previousStage: pipeline.currentStage, currentStage: nextStage, pipeline: updated };
  },

  /** Force-set a specific stage (admin override) */
  async setStage(clientId: string, userId: string, stage: string, notes?: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({ where: { clientId } });
    if (!pipeline) throw new NotFoundError('Pipeline');

    if (!STAGE_ORDER.includes(stage as (typeof STAGE_ORDER)[number])) {
      throw new BadRequestError('Invalid onboarding stage');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedPipeline = await tx.onboardingPipeline.update({
        where: { clientId },
        data: {
          currentStage: stage as never,
          lastActivityAt: new Date(),
          ...(stage === 'COMPLETED' ? { completedAt: new Date() } : { completedAt: null }),
        },
      });

      await tx.onboardingStageLog.create({
        data: {
          pipelineId: pipeline.id,
          fromStage: pipeline.currentStage,
          toStage: stage as never,
          transitionedById: userId,
          notes: notes ?? 'Admin override',
        },
      });

      return updatedPipeline;
    });

    logger.info({ clientId, stage, userId }, 'Stage manually set');
    return { currentStage: stage, pipeline: updated };
  },

  /** Get audit trail for a client's onboarding */
  async getAuditTrail(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({ where: { clientId } });
    if (!pipeline) throw new NotFoundError('Pipeline');

    return prisma.onboardingStageLog.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { transitionedAt: 'desc' },
      include: {
        transitionedBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  // ──────────────────────────────────────────────
  //  Checklist Items
  // ──────────────────────────────────────────────

  /** Get all checklist items for a client's pipeline */
  async getChecklist(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({ where: { clientId } });
    if (!pipeline) throw new NotFoundError('Pipeline');

    const items = await prisma.checklistItem.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: [{ stage: 'asc' }, { createdAt: 'asc' }],
      include: {
        completedBy: { select: { id: true, name: true } },
      },
    });

    // Group by stage for easier consumption
    const grouped: Record<string, typeof items> = {};
    for (const item of items) {
      if (!grouped[item.stage]) grouped[item.stage] = [];
      grouped[item.stage]!.push(item);
    }

    return { items, grouped, total: items.length, completed: items.filter((i) => i.isCompleted).length };
  },

  /** Toggle a checklist item's completion status */
  async updateChecklistItem(itemId: string, userId: string, isCompleted: boolean) {
    const item = await prisma.checklistItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundError('Checklist item');

    const updated = await prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
        completedById: isCompleted ? userId : null,
      },
    });

    // Update pipeline lastActivityAt
    await prisma.onboardingPipeline.update({
      where: { id: item.pipelineId },
      data: { lastActivityAt: new Date() },
    });

    logger.info({ itemId, isCompleted, userId }, 'Checklist item updated');
    return updated;
  },

  /** Check gate status — are all mandatory items completed for current stage? */
  async checkGateStatus(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({ where: { clientId } });
    if (!pipeline) throw new NotFoundError('Pipeline');

    const items = await prisma.checklistItem.findMany({
      where: { pipelineId: pipeline.id, stage: pipeline.currentStage },
    });

    const mandatory = items.filter((i) => i.isMandatory);
    const completed = mandatory.filter((i) => i.isCompleted);

    return {
      stage: pipeline.currentStage,
      canAdvance: completed.length === mandatory.length,
      mandatoryTotal: mandatory.length,
      mandatoryCompleted: completed.length,
      mandatoryPending: mandatory.length - completed.length,
      allItems: items.map((i) => ({
        id: i.id,
        title: i.title,
        isMandatory: i.isMandatory,
        isCompleted: i.isCompleted,
      })),
    };
  },

  /** Bulk complete multiple checklist items */
  async bulkCompleteChecklist(itemIds: string[], userId: string) {
    const items = await prisma.checklistItem.findMany({
      where: { id: { in: itemIds } },
    });

    if (items.length === 0) throw new NotFoundError('No checklist items found');
    if (items.length !== itemIds.length) {
      throw new BadRequestError(`${itemIds.length - items.length} item(s) not found`);
    }

    const now = new Date();
    await prisma.checklistItem.updateMany({
      where: { id: { in: itemIds } },
      data: { isCompleted: true, completedAt: now, completedById: userId },
    });

    // Update pipeline lastActivityAt for affected pipelines
    const pipelineIds = [...new Set(items.map((i) => i.pipelineId))];
    await prisma.onboardingPipeline.updateMany({
      where: { id: { in: pipelineIds } },
      data: { lastActivityAt: now },
    });

    logger.info({ count: itemIds.length, userId }, 'Bulk checklist completion');
    return { completed: itemIds.length };
  },

  // ──────────────────────────────────────────────
  //  Requirements
  // ──────────────────────────────────────────────

  /** List requirements for a client */
  async getRequirements(clientId: string) {
    return prisma.requirement.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
      include: {
        gatheredBy: { select: { id: true, name: true, email: true } },
      },
    });
  },

  /** Create a new requirement */
  async createRequirement(clientId: string, userId: string, data: { title: string; body: string }) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { onboardingPipeline: true },
    });
    if (!client) throw new NotFoundError('Client');
    if (!client.onboardingPipeline) throw new NotFoundError('Pipeline');

    const requirement = await prisma.requirement.create({
      data: {
        clientId,
        pipelineId: client.onboardingPipeline.id,
        title: data.title,
        body: data.body,
        gatheredById: userId,
      },
    });

    // Update pipeline activity
    await prisma.onboardingPipeline.update({
      where: { clientId },
      data: { lastActivityAt: new Date() },
    });

    logger.info({ clientId, requirementId: requirement.id }, 'Requirement created');
    return requirement;
  },

  /** Update a requirement */
  async updateRequirement(requirementId: string, data: { title?: string; body?: string }) {
    const req = await prisma.requirement.findUnique({ where: { id: requirementId } });
    if (!req) throw new NotFoundError('Requirement');

    return prisma.requirement.update({
      where: { id: requirementId },
      data,
    });
  },

  /** Delete a requirement */
  async deleteRequirement(requirementId: string) {
    const req = await prisma.requirement.findUnique({ where: { id: requirementId } });
    if (!req) throw new NotFoundError('Requirement');

    await prisma.requirement.delete({ where: { id: requirementId } });
    logger.info({ requirementId }, 'Requirement deleted');
    return { deleted: true };
  },

  // ──────────────────────────────────────────────
  //  SLA Monitoring
  // ──────────────────────────────────────────────

  /** SLA dashboard — overview of all pipeline health statuses */
  async getSlaDashboard() {
    const [pipelines, slaConfigs] = await Promise.all([
      prisma.onboardingPipeline.findMany({
        where: { completedAt: null },
        include: {
          client: { select: { id: true, companyName: true } },
        },
        orderBy: { lastActivityAt: 'asc' },
      }),
      prisma.stageSlaConfig.findMany(),
    ]);

    const slaMap = new Map(slaConfigs.map((c) => [c.stage, c]));
    const now = Date.now();

    const enriched = pipelines.map((p) => {
      const sla = slaMap.get(p.currentStage);
      const hoursInStage = (now - p.lastActivityAt.getTime()) / (1000 * 60 * 60);

      return {
        pipelineId: p.id,
        clientId: p.clientId,
        companyName: p.client.companyName,
        currentStage: p.currentStage,
        healthStatus: p.healthStatus,
        hoursInStage: Math.round(hoursInStage * 10) / 10,
        slaHours: sla?.slaHours ?? null,
        isAtRisk: sla ? hoursInStage >= sla.slaHours * sla.atRiskPct : false,
        isOverdue: sla ? hoursInStage >= sla.slaHours : false,
      };
    });

    return {
      total: enriched.length,
      onTrack: enriched.filter((p) => p.healthStatus === 'ON_TRACK').length,
      atRisk: enriched.filter((p) => p.healthStatus === 'AT_RISK').length,
      overdue: enriched.filter((p) => p.healthStatus === 'OVERDUE').length,
      stalled: enriched.filter((p) => p.healthStatus === 'STALLED').length,
      pipelines: enriched,
    };
  },

  /** Get SLA status for a specific client */
  async getClientSla(clientId: string) {
    const pipeline = await prisma.onboardingPipeline.findUnique({ where: { clientId } });
    if (!pipeline) throw new NotFoundError('Pipeline');

    const slaConfig = await prisma.stageSlaConfig.findUnique({
      where: { stage: pipeline.currentStage },
    });

    const hoursInStage = (Date.now() - pipeline.lastActivityAt.getTime()) / (1000 * 60 * 60);

    // Get SLA for all stages with time spent
    const stageLogs = await prisma.onboardingStageLog.findMany({
      where: { pipelineId: pipeline.id },
      orderBy: { transitionedAt: 'asc' },
    });

    const allSlaConfigs = await prisma.stageSlaConfig.findMany();
    const slaMap = new Map(allSlaConfigs.map((c) => [c.stage, c]));

    // Calculate time spent in each stage
    const stageHistory = [];
    for (let i = 0; i < stageLogs.length - 1; i++) {
      const log = stageLogs[i]!;
      const nextLog = stageLogs[i + 1]!;
      const hours = (nextLog.transitionedAt.getTime() - log.transitionedAt.getTime()) / (1000 * 60 * 60);
      const sla = slaMap.get(log.toStage);
      stageHistory.push({
        stage: log.toStage,
        hoursSpent: Math.round(hours * 10) / 10,
        slaHours: sla?.slaHours ?? null,
        withinSla: sla ? hours <= sla.slaHours : true,
      });
    }

    return {
      currentStage: pipeline.currentStage,
      healthStatus: pipeline.healthStatus,
      hoursInCurrentStage: Math.round(hoursInStage * 10) / 10,
      currentSla: slaConfig
        ? {
            slaHours: slaConfig.slaHours,
            atRiskThreshold: slaConfig.slaHours * slaConfig.atRiskPct,
            isAtRisk: hoursInStage >= slaConfig.slaHours * slaConfig.atRiskPct,
            isOverdue: hoursInStage >= slaConfig.slaHours,
          }
        : null,
      stageHistory,
    };
  },

  /** Run SLA check for all active pipelines and update health statuses */
  async runSlaCheck() {
    const [pipelines, slaConfigs] = await Promise.all([
      prisma.onboardingPipeline.findMany({ where: { completedAt: null } }),
      prisma.stageSlaConfig.findMany(),
    ]);

    const slaMap = new Map(slaConfigs.map((c) => [c.stage, c]));
    const now = Date.now();
    let updated = 0;

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
          data: { healthStatus: newHealth as never },
        });
        updated++;

        // Create notification for AT_RISK or OVERDUE
        if (newHealth === 'AT_RISK' || newHealth === 'OVERDUE' || newHealth === 'STALLED') {
          const client = await prisma.client.findUnique({ where: { id: pipeline.clientId } });
          if (client?.assignedManagerId) {
            await prisma.notification.create({
              data: {
                userId: client.assignedManagerId,
                type: 'SLA_ALERT',
                title: `SLA ${newHealth}: ${client.companyName}`,
                body: `${client.companyName} is ${newHealth.toLowerCase().replace('_', ' ')} in ${pipeline.currentStage} stage (${Math.round(hoursInStage)}h elapsed)`,
              },
            });
          }
        }
      }
    }

    logger.info({ total: pipelines.length, updated }, 'SLA check completed');
    return { checked: pipelines.length, updated };
  },

  // ──────────────────────────────────────────────
  //  SLA Configuration
  // ──────────────────────────────────────────────

  /** Get or update SLA config */
  async getSlaConfigs() {
    return prisma.stageSlaConfig.findMany({ orderBy: { stage: 'asc' } });
  },

  async upsertSlaConfig(stage: string, slaHours: number, atRiskPct: number) {
    return prisma.stageSlaConfig.upsert({
      where: { stage: stage as never },
      update: { slaHours, atRiskPct },
      create: { stage: stage as never, slaHours, atRiskPct },
    });
  },
};
