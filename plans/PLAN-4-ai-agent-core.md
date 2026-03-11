# Plan 4: AI Agent Core System

## Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| AgentLog + AgentConfig models | ✅ Done | Added to schema.prisma, Prisma client generated |
| Event Bus Service | ✅ Done | Redis pub/sub, ioredis, 25+ event types |
| Agent Log Service | ✅ Done | Prisma-backed, getLogs/getStats/getLastAction |
| Agent Memory Service | ✅ Done | In-process context + conversation history |
| Agent Planner Service | ✅ Done | ChatOllama decision-making |
| Base Agent Class | ✅ Done | Abstract with logging, events, task execution |
| Lead Discovery Agent | ✅ Done | Phase 1 |
| Lead Scoring Agent | ✅ Done | Phase 1 |
| Follow-up Agent | ✅ Done | Phase 1 |
| Notification Agent | ✅ Done | Phase 1 |
| Agent Processors + Scheduler | ✅ Done | BullMQ integration |
| Agent API Routes | ✅ Done | Admin-only status/activity/config/trigger/events |
| Worker Registration | ✅ Done | agent-task + agent-schedule workers |
| Onboarding Agent | ✅ Done | Phase 2 — stage advancement, checklist monitoring |
| SLA Agent | ✅ Done | Phase 2 — SLA checks every 4 hours |
| Document Agent | ✅ Done | Phase 2 — auto-scan, completeness validation |
| Meeting Agent | ✅ Done | Phase 2 — scheduling, reminders |
| NPS Agent | ✅ Done | Phase 3 — survey scheduling, detractor alerts |
| Health Agent | ✅ Done | Phase 3 — daily churn risk calculation |
| Upsell Agent | ✅ Done | Phase 3 — daily upsell detection |
| Frontend Agent Pages | 🔲 Not Started | Activity, config, status dashboard |
| DB Migration | ⚠️ Pending | Neon DB cold start; run `prisma migrate dev` when accessible |

## Overview
This plan details the implementation of the autonomous AI Agent system that powers all three phases. The agent system enables autonomous operation where the application runs itself in the background, making decisions and executing actions automatically.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENT CORE                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    Agent Executor Service                       │    │
│  │  - Task prioritization                                         │    │
│  │  - Workflow orchestration                                      │    │
│  │  - Error handling and retry                                    │    │
│  │  - State management                                            │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    Agent Planner Service                        │    │
│  │  - Decision making using Ollama                                │    │
│  │  - Action selection                                            │    │
│  │  - Reasoning trace                                             │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                    │                                     │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    Agent Memory Service                         │    │
│  │  - Conversation history                                        │    │
│  │  - Action logs                                                 │    │
│  │  - Decision history                                            │    │
│  │  - Context accumulation                                        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         SPECIALIZED AGENTS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐             │
│  │  Lead Agent    │  │ Onboard Agent  │  │ Success Agent  │             │
│  │                │  │                │  │                │             │
│  │- Discovery     │  │- Stage adv.   │  │- NPS          │             │
│  │- Enrichment    │  │- Checklist    │  │- Health       │             │
│  │- Scoring       │  │- SLA          │  │- Churn        │             │
│  │- Outreach      │  │- Documents    │  │- Upsell       │             │
│  │- Follow-up     │  │- Meetings     │  │- Re-entry     │             │
│  └────────────────┘  └────────────────┘  └────────────────┘             │
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐                                │
│  │ Notify Agent   │  │ Monitor Agent  │                                │
│  │                │  │                │                                │
│  │- Telegram     │  │- Health check  │                                │
│  │- In-app       │  │- SLA monitor   │                                │
│  │- Email        │  │- Alert check   │                                │
│  └────────────────┘  └────────────────┘                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Section 4.1: Agent Decision Matrix

| Action | Auto-Execute | Human Approval | Human Notification Only |
|--------|-------------|----------------|------------------------|
| Lead discovery | ✅ | - | - |
| Lead scoring | ✅ | - | - |
| Auto-approve high-score leads | ✅ | - | ✅ (notify) |
| Generate pitch | ✅ | - | ✅ |
| Send outreach email | - | ✅ | - |
| Schedule follow-up | ✅ | - | - |
| Advance onboarding stage | ✅ | - | ✅ (notify) |
| Send meeting reminder | ✅ | - | - |
| Trigger NPS survey | ✅ | - | ✅ |
| Detect churn risk | ✅ | - | ✅ (urgent) |
| Flag upsell opportunity | ✅ | - | ✅ |
| Re-enter to BD pipeline | - | ✅ | - |

---

## Section 4.2: Core Infrastructure

### Task 4.2.1: Agent Log Model (Database)
**File:** `packages/db/prisma/schema.prisma` (append)

```prisma
/// Agent action logs for audit and debugging
model AgentLog {
  id          String   @id @default(uuid()) @db.Uuid
  agentType   String   @map("agent_type")    // 'lead', 'onboarding', 'success', 'notify'
  action      String                    // 'discover_leads', 'advance_stage', etc.
  targetType  String?   @map("target_type")  // 'lead', 'client', 'meeting'
  targetId    String?   @map("target_id") @db.Uuid
  status      String                    // 'success', 'failed', 'pending_approval'
  reasoning   String?   @db.Text        // AI reasoning for the action
  details     Json?                     // Additional context
  createdAt   DateTime @default(now()) @map("created_at")
  
  @@index([agentType])
  @@index([status])
  @@index([createdAt])
  @@map("agent_logs")
}

/// Agent configuration and settings
model AgentConfig {
  id          String   @id @default(uuid()) @db.Uuid
  agentName   String   @unique @map("agent_name")
  enabled     Boolean  @default(true)
  schedule    String?                   // Cron expression
  config      Json?                     // Agent-specific config
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@map("agent_configs")
}
```

**After adding:** Run `npx prisma db push`

### Task 4.2.2: Agent Memory Service
**File:** `apps/api/src/services/agent-memory.service.ts`

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

class AgentMemory {
  private context: Map<string, unknown> = new Map();
  private conversationHistory: Message[] = [];
  private maxHistory: number = 50;

  addContext(key: string, value: unknown): void {
    this.context.set(key, value);
  }

  getContext(key: string): unknown {
    return this.context.get(key);
  }

  clearContext(): void {
    this.context.clear();
  }

  addMessage(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });
    // Trim if too long
    if (this.conversationHistory.length > this.maxHistory) {
      this.conversationHistory = this.conversationHistory.slice(-this.maxHistory);
    }
  }

  getConversationHistory(limit?: number): Message[] {
    if (limit) {
      return this.conversationHistory.slice(-limit);
    }
    return [...this.conversationHistory];
  }

  buildContextPrompt(): string {
    const contextEntries = Array.from(this.context.entries())
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');
    return `Context:\n${contextEntries}\n\nHistory:\n${this.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`;
  }
}

export const agentMemory = new AgentMemory();
```

### Task 4.2.3: Agent Log Service
**File:** `apps/api/src/services/agent-log.service.ts`

```typescript
import { prisma } from '../config/db.js';

interface CreateAgentLogParams {
  agentType: string;
  action: string;
  targetType?: string;
  targetId?: string;
  status: 'success' | 'failed' | 'pending_approval';
  reasoning?: string;
  details?: Record<string, unknown>;
}

class AgentLogService {
  async log(params: CreateAgentLogParams) {
    return prisma.agentLog.create({
      data: {
        agentType: params.agentType,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        status: params.status,
        reasoning: params.reasoning,
        details: params.details as never,
      },
    });
  }

  async getLogs(filters: {
    agentType?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    return prisma.agentLog.findMany({
      where: {
        ...(filters.agentType && { agentType: filters.agentType }),
        ...(filters.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    });
  }
}

export const agentLogService = new AgentLogService();
```

### Task 4.2.4: Agent Planner Service
**File:** `apps/api/src/services/agent-planner.service.ts`

```typescript
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { ChatPromptTemplate } from '@langchain/core/prompts';

const model = new ChatOllama({
  model: process.env['OLLAMA_MODEL'] ?? 'gpt-oss:120b-cloud',
  baseUrl: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434',
  temperature: 0.3,
});

const plannerPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an autonomous business development agent. 
Based on the current context and available actions, decide what to do.
Available actions: {actions}
Respond with JSON: { "action": "action_name", "reasoning": "why", "params": {} }`
  ],
  ['human', '{context}'],
]);

interface PlannerDecision {
  action: string;
  reasoning: string;
  params: Record<string, unknown>;
}

class AgentPlannerService {
  async decide(context: string, availableActions: string[]): Promise<PlannerDecision> {
    const chain = plannerPrompt.pipe(model);
    
    const result = await chain.invoke({
      context,
      actions: availableActions.join(', '),
    });

    try {
      return JSON.parse(result.content);
    } catch {
      return {
        action: 'noop',
        reasoning: 'Failed to parse decision',
        params: {},
      };
    }
  }

  async generateReasoning(prompt: string): Promise<string> {
    const response = await model.invoke(prompt);
    return response.content;
  }
}

export const agentPlannerService = new AgentPlannerService();
```

---

## Section 4.3: Event System

### Task 4.3.1: Event Bus Service
**File:** `apps/api/src/services/event-bus.service.ts`

```typescript
import { redis } from '../config/redis.js';

type EventHandler = (data: EventData) => Promise<void>;

interface EventData {
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

// Event Types
export const EVENTS = {
  // Lead events
  LEAD_DISCOVERED: 'lead:discovered',
  LEAD_ENRICHED: 'lead:enriched',
  LEAD_SCORED: 'lead:scored',
  LEAD_QUALIFIED: 'lead:qualified',
  LEAD_REJECTED: 'lead:rejected',
  LEAD_ASSIGNED: 'lead:assigned',
  
  // Outreach events
  PITCH_GENERATED: 'outreach:pitch-generated',
  PITCH_APPROVED: 'outreach:pitch-approved',
  PITCH_SENT: 'outreach:pitch-sent',
  FOLLOWUP_SENT: 'outreach:followup-sent',
  
  // Deal events
  DEAL_CLOSED: 'deal:closed',
  DEAL_WON: 'deal:won',
  DEAL_LOST: 'deal:lost',
  
  // Onboarding events
  STAGE_ADVANCED: 'onboarding:stage-advanced',
  CHECKLIST_COMPLETED: 'onboarding:checklist-completed',
  DOCUMENT_UPLOADED: 'onboarding:document-uploaded',
  DOCUMENT_SCANNED: 'onboarding:document-scanned',
  SLA_BREACH: 'onboarding:sla-breach',
  
  // Success events
  NPS_SUBMITTED: 'success:nps-submitted',
  NPS_DETRACTOR: 'success:nps-detractor',
  CHURN_DETECTED: 'success:churn-detected',
  UPSELL_DETECTED: 'success:upsell-detected',
} as const;

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();
  private subscriber: ReturnType<typeof redis.duplicate>;

  constructor() {
    // Create a separate connection for subscribing
    this.subscriber = redis.duplicate();
    this.setupRedisSubscription();
  }

  private async setupRedisSubscription() {
    // Listen to Redis pub/sub for cross-service events
    await this.subscriber.pSubscribe('agent:*', (message, channel) => {
      const eventType = channel.replace('agent:', '');
      const data = JSON.parse(message);
      this.emit(eventType, data);
    });
  }

  async publish(event: string, data: Record<string, unknown>) {
    const eventData: EventData = {
      type: event,
      payload: data,
      timestamp: new Date(),
    };
    
    // Store in Redis for persistence
    await redis.lPush(`events:${event}`, JSON.stringify(eventData));
    await redis.expire(`events:${event}`, 86400); // 24h TTL
    
    // Also publish via Redis pub/sub
    await redis.publish(`agent:${event}`, JSON.stringify(data));
    
    // Emit locally
    this.emit(event, eventData);
  }

  subscribe(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  unsubscribe(event: string, handler: EventHandler) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  private async emit(event: string, data: EventData) {
    const handlers = this.handlers.get(event) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];
    
    await Promise.all([
      ...handlers.map(h => h(data).catch(console.error)),
      ...wildcardHandlers.map(h => h(data).catch(console.error)),
    ]);
  }
}

export const eventBus = new EventBus();
```

---

## Section 4.4: Agent Base Class

### Task 4.4.1: Base Agent Class
**File:** `apps/api/src/agents/base.agent.ts`

```typescript
import { eventBus, EVENTS } from '../services/event-bus.service.js';
import { agentLogService } from '../services/agent-log.service.js';
import { agentMemory } from '../services/agent-memory.service.js';
import { agentPlannerService } from '../services/agent-planner.service.js';

interface AgentTask {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface AgentResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

abstract class BaseAgent {
  protected name: string;
  protected eventHandlers: Map<string, (data: EventData) => Promise<void>> = new Map();

  constructor(name: string) {
    this.name = name;
  }

  abstract initialize(): Promise<void>;
  abstract executeTask(task: AgentTask): Promise<AgentResult>;

  protected async logAction(
    action: string,
    targetType: string,
    targetId: string,
    status: 'success' | 'failed' | 'pending_approval',
    reasoning?: string,
    details?: Record<string, unknown>
  ) {
    return agentLogService.log({
      agentType: this.name,
      action,
      targetType,
      targetId,
      status,
      reasoning,
      details,
    });
  }

  protected async decide(context: string, availableActions: string[]) {
    return agentPlannerService.decide(context, availableActions);
  }

  protected async publishEvent(event: string, data: Record<string, unknown>) {
    return eventBus.publish(event, data);
  }

  protected addContext(key: string, value: unknown) {
    agentMemory.addContext(key, value);
  }

  getContext(key: string): unknown {
    return agentMemory.getContext(key);
  }

  subscribeToEvent(event: string, handler: (data: EventData) => Promise<void>) {
    eventBus.subscribe(event, handler);
  }

  async handleEvent(event: string, data: EventData) {
    const handler = this.eventHandlers.get(event);
    if (handler) {
      await handler(data);
    }
  }
}
```

---

## Section 4.5: Specialized Agents

### Task 4.5.1: Notification Agent
**File:** `apps/api/src/agents/notification.agent.ts`

**Responsibilities:**
- Route notifications to appropriate channel
- Format messages for Telegram
- Create in-app notifications
- Send urgent alerts immediately

**Dependencies:**
- `apps/api/src/services/telegram.service.ts` (exists)

### Task 4.5.2: Monitor Agent
**File:** `apps/api/src/agents/monitor.agent.ts`

**Responsibilities:**
- Health check aggregator
- SLA monitoring coordinator
- Alert threshold watcher
- System status reporter

---

## Section 4.6: Agent Scheduler

### Task 4.6.1: Schedule Configuration
**File:** `apps/api/src/config/agent-schedule.ts`

```typescript
export const agentSchedules = {
  // Lead Discovery - Hourly
  'lead-discovery': {
    enabled: true,
    schedule: '0 * * * *',           // Every hour at minute 0
    agent: 'lead-discovery',
    config: {
      batchSize: 10,
      minScore: 30,
    },
  },

  // Lead Enrichment - Every 30 min
  'lead-enrichment': {
    enabled: true,
    schedule: '*/30 * * * *',
    agent: 'lead-enrichment',
    config: {
      batchSize: 20,
    },
  },

  // Health Check - Hourly
  'health-check': {
    enabled: true,
    schedule: '0 * * * *',
    agent: 'health',
    config: {
      riskThreshold: 70,
    },
  },

  // SLA Check - Every 4 hours
  'sla-check': {
    enabled: true,
    schedule: '0 */4 * * *',
    agent: 'sla',
    config: {},
  },

  // Meeting Reminders - Hourly
  'meeting-reminders': {
    enabled: true,
    schedule: '0 * * * *',
    agent: 'meeting',
    config: {
      reminderHours: [24, 1],
    },
  },

  // NPS Survey - Weekly Monday 9am
  'nps-survey': {
    enabled: true,
    schedule: '0 9 * * 1',
    agent: 'nps',
    config: {
      daysAfterOnboarding: 7,
    },
  },

  // Upsell Detection - Daily 6am
  'upsell-detection': {
    enabled: true,
    schedule: '0 6 * * *',
    agent: 'upsell',
    config: {
      threshold: 60,
    },
  },
} as const;
```

### Task 4.6.2: Schedule Registration
**File:** `apps/api/src/jobs/scheduler.ts`

```typescript
import { agentSchedules } from '../config/agent-schedule.js';
import { agentTaskQueue } from '../config/queue.js';
import { logger } from '../config/logger.js';

export async function registerAgentSchedules() {
  for (const [name, config] of Object.entries(agentSchedules)) {
    if (!config.enabled) continue;

    await agentTaskQueue.add(
      `schedule:${name}`,
      { agentName: config.agent, config: config.config },
      {
        repeat: {
          pattern: config.schedule,
        },
      }
    );

    logger.info(`Registered agent schedule: ${name} (${config.schedule})`);
  }
}
```

---

## Section 4.7: Agent Job Processors

### Task 4.7.1: Agent Task Processor
**File:** `apps/api/src/jobs/agent-processors.ts`

```typescript
import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';

// Import all agents (lazy loaded)
const agents = {
  'lead-discovery': async () => (await import('../agents/lead-discovery.agent.js')).leadDiscoveryAgent,
  'lead-scoring': async () => (await import('../agents/lead-scoring.agent.js')).leadScoringAgent,
  'onboarding': async () => (await import('../agents/onboarding.agent.js')).onboardingAgent,
  'sla': async () => (await import('../agents/sla.agent.js')).slaAgent,
  'nps': async () => (await import('../agents/nps.agent.js')).npsAgent,
  'health': async () => (await import('../agents/health.agent.js')).healthAgent,
  'upsell': async () => (await import('../agents/upsell.agent.js')).upsellAgent,
};

export async function processAgentTask(job: Job) {
  const { agentName, taskType, payload } = job.data as {
    agentName: string;
    taskType?: string;
    payload: Record<string, unknown>;
  };

  logger.info({ agentName, taskType }, 'Processing agent task');

  const agentFactory = agents[agentName as keyof typeof agents];
  if (!agentFactory) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  const agent = await agentFactory();
  
  if (taskType === 'scheduled') {
    return agent.runScheduledTask(payload);
  }
  
  return agent.executeTask({ id: job.id!, type: taskType ?? 'default', payload });
}

export async function processAgentSchedule(job: Job) {
  const { agentName, config } = job.data as {
    agentName: string;
    config: Record<string, unknown>;
  };

  logger.info({ agentName }, 'Running scheduled agent');

  const agentFactory = agents[agentName as keyof typeof agents];
  if (!agentFactory) {
    throw new Error(`Unknown agent: ${agentName}`);
  }

  const agent = await agentFactory();
  return agent.runScheduledTask(config);
}
```

---

## Section 4.8: Agent API

### Task 4.8.1: Agent Routes
**File:** `apps/api/src/modules/agent/agent.routes.ts`

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/agent/status` | All agent status |
| GET | `/agent/activity` | Agent activity logs |
| GET | `/agent/config` | All agent configs |
| GET | `/agent/config/:agentName` | Single agent config |
| PATCH | `/agent/config/:agentName` | Update agent config |
| POST | `/agent/trigger/:agentName` | Manually trigger agent |
| GET | `/agent/events` | Recent events |

### Task 4.8.2: Agent Controller
**File:** `apps/api/src/modules/agent/agent.controller.ts`

### Task 4.8.3: Agent Service
**File:** `apps/api/src/modules/agent/agent.service.ts`

---

## Section 4.9: Frontend

### Task 4.9.1: Agent Activity Page
**File:** `apps/web/src/app/dashboard/agent/activity/page.tsx`

**Features:**
- Real-time activity feed
- Filter by agent type
- Filter by status (success/failed/pending)
- Search by action
- Expand for details/reasoning

### Task 4.9.2: Agent Configuration Page
**File:** `apps/web/src/app/dashboard/agent/config/page.tsx`

**Features:**
- Enable/disable agents
- Adjust schedules (cron expression)
- Set thresholds
- Configure notifications

### Task 4.9.3: Agent Status Dashboard
**File:** `apps/web/src/app/dashboard/agent/page.tsx`

**Features:**
- All agents status overview
- Last run time
- Success/failure counts
- Quick actions

### Task 4.9.4: Components to Create

```
apps/web/src/components/agent/
├── AgentActivityLog.tsx
├── AgentStatusCard.tsx
├── AgentConfigForm.tsx
└── AgentEventFeed.tsx
```

---

## File Summary

### New Files to Create

```
apps/api/src/
├── agents/
│   ├── base.agent.ts
│   ├── notification.agent.ts
│   └── monitor.agent.ts
├── services/
│   ├── agent-memory.service.ts
│   ├── agent-log.service.ts
│   ├── agent-planner.service.ts
│   └── event-bus.service.ts
├── modules/agent/
│   ├── agent.routes.ts
│   ├── agent.controller.ts
│   └── agent.service.ts
├── jobs/
│   ├── agent-processors.ts
│   └── scheduler.ts
└── config/
    └── agent-schedule.ts

packages/db/prisma/schema.prisma (append)
# - AgentLog model
# - AgentConfig model

apps/web/src/app/dashboard/agent/
├── page.tsx
├── activity/
│   └── page.tsx
└── config/
    └── page.tsx

apps/web/src/components/agent/
├── AgentActivityLog.tsx
├── AgentStatusCard.tsx
├── AgentConfigForm.tsx
└── AgentEventFeed.tsx
```

### Files to Modify

```
apps/api/src/index.ts - Register agent routes, init scheduler
apps/api/src/config/queue.ts - Add agent queues
apps/api/src/worker.ts - Register agent processors
packages/shared/src/schemas/index.ts - Add agent schemas
```

---

## Execution Priority

### Phase A: Core Infrastructure (Must First)
1. Task 4.2.1 - Database models
2. Task 4.2.2 - Agent Memory Service
3. Task 4.2.3 - Agent Log Service
4. Task 4.2.4 - Agent Planner Service
5. Task 4.3.1 - Event Bus Service

### Phase B: Agent Base
6. Task 4.4.1 - Base Agent Class

### Phase C: Agent Execution
7. Task 4.6.1 - Schedule Configuration
8. Task 4.6.2 - Schedule Registration
9. Task 4.7.1 - Agent Task Processor

### Phase D: API & UI
10. Task 4.8.x - Agent API
11. Task 4.9.x - Frontend

---

## Integration with Other Plans

This plan integrates with:
- **Plan 1**: Uses Lead Discovery, Scoring, Follow-up agents
- **Plan 2**: Uses Onboarding, SLA, Document, Meeting agents
- **Plan 3**: Uses NPS, Health, Upsell agents

The Event Bus and Agent Log services are foundational and should be implemented first.
