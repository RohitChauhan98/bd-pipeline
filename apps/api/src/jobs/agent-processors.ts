/**
 * Agent Job Processors
 *
 * BullMQ processors for agent tasks and scheduled jobs.
 * Agents are lazy-loaded to avoid circular dependencies.
 */

import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';

// ── Lazy Agent Loaders ───────────────────────

const agents = {
  // Phase 1
  'lead-discovery': async () => (await import('../agents/lead-discovery.agent.js')).leadDiscoveryAgent,
  'lead-scoring': async () => (await import('../agents/lead-scoring.agent.js')).leadScoringAgent,
  'followup': async () => (await import('../agents/followup.agent.js')).followupAgent,
  'notify': async () => (await import('../agents/notification.agent.js')).notificationAgent,
  // Phase 2
  'onboarding': async () => (await import('../agents/onboarding.agent.js')).onboardingAgent,
  'sla': async () => (await import('../agents/sla.agent.js')).slaAgent,
  'document': async () => (await import('../agents/document.agent.js')).documentAgent,
  'meeting': async () => (await import('../agents/meeting.agent.js')).meetingAgent,
  // Phase 3
  'nps': async () => (await import('../agents/nps.agent.js')).npsAgent,
  'health': async () => (await import('../agents/health.agent.js')).healthAgent,
  'upsell': async () => (await import('../agents/upsell.agent.js')).upsellAgent,
} as const;

type AgentName = keyof typeof agents;

// ── Processors ───────────────────────────────

/**
 * Process an on-demand agent task.
 * Job data: { agentName, taskType, payload }
 */
export async function processAgentTask(job: Job) {
  const { agentName, taskType, payload } = job.data as {
    agentName: string;
    taskType?: string;
    payload: Record<string, unknown>;
  };

  logger.info({ agentName, taskType, jobId: job.id }, 'Processing agent task');

  const agentFactory = agents[agentName as AgentName];
  if (!agentFactory) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  const agent = await agentFactory();
  return agent.executeTask({
    id: job.id ?? `task-${Date.now()}`,
    type: taskType ?? 'default',
    payload,
  });
}

/**
 * Process a scheduled agent run (from repeatable/cron jobs).
 * Job data: { agentName, config }
 */
export async function processAgentSchedule(job: Job) {
  const { agentName, config } = job.data as {
    agentName: string;
    config: Record<string, unknown>;
  };

  logger.info({ agentName, jobId: job.id }, 'Running scheduled agent');

  const agentFactory = agents[agentName as AgentName];
  if (!agentFactory) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  const agent = await agentFactory();
  return agent.runScheduledTask(config);
}
