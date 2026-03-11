# Plan 3: Phase 3 - Customer Success

## Status
**Backend:** ✅ Complete (all routes, services, controllers, agents, health-score service)
**Frontend:** ⬜ Not started (Section 3.6)
**Last Updated:** Phase 3 backend implemented — NPS, Success, Health Score modules + 3 agents, 0 TypeScript errors

### Implementation Notes
- NPS module has full collect + dashboard + survey sending + trend analytics.
- Success module includes dashboard, client health detail, upsell flagging, health refresh, and BD re-entry workflow.
- Health Score Service implements weighted multi-factor algorithm for both churn risk and upsell scoring.
- 3 Phase 3 agents registered in agent-processors.ts (nps, health, upsell). Schedules already existed in agent-schedule.ts.
- Events already existed in event-bus: NPS_SUBMITTED, NPS_DETRACTOR, CHURN_DETECTED, UPSELL_DETECTED, ONBOARDING_COMPLETED.
- Basic NPS collect/upsell-flag already existed in ai.service.ts; Phase 3 modules provide more comprehensive dedicated implementations.

## Overview
Post-onboarding features: NPS collection, churn risk scoring, upsell detection, and autonomous health monitoring.

## Prerequisites
- [x] Phase 2 completed
- [ ] Clients in `ACTIVE` status exist
- [x] AI Agent core services running

## Database
**Schema Status:** ✅ All models already defined

| Model | Purpose | Status |
|-------|---------|--------|
| NpsResponse | NPS scores | ✅ Ready |
| CustomerHealth | Churn/upsell | ✅ Ready |

---

## Section 3.1: Backend Routes ✅

### Task 3.1.1: NPS Routes ✅
**File:** `apps/api/src/modules/nps/nps.routes.ts`

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/nps/collect` | Record NPS response (client-facing) |
| GET | `/nps/:clientId` | Get client NPS history |
| GET | `/nps/dashboard` | NPS overview and trends |
| POST | `/nps/send-survey` | Trigger NPS survey email |

**Pattern:** Follow `apps/api/src/modules/clients/clients.routes.ts`

### Task 3.1.2: Success Routes ✅
**File:** `apps/api/src/modules/success/success.routes.ts`

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/success/dashboard` | All clients health overview |
| GET | `/success/:clientId/health` | Detailed health + churn risk |
| POST | `/success/:clientId/upsell` | Flag upsell opportunity |
| POST | `/success/:clientId/health/refresh` | Recalculate health scores |

### Task 3.1.3: BD Re-entry Routes ✅
**File:** `apps/api/src/modules/success/success.routes.ts` *(consolidated into main success routes)*

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/success/:clientId/re-enter-bd` | Re-enter client into BD pipeline |

**What:** When upsell is approved, create a new lead from the existing client for follow-up BD activities

---

## Section 3.2: Zod Schemas ✅

### Task 3.2.1: NPS Schemas ✅
**File:** `packages/shared/src/schemas/nps.schema.ts`

```typescript
import { z } from 'zod';

export const collectNpsSchema = z.object({
  clientId: z.string().uuid(),
  score: z.number().min(0).max(10),
  feedback: z.string().optional(),
});

export const sendNpsSurveySchema = z.object({
  clientId: z.string().uuid(),
  sendVia: z.enum(['EMAIL', 'SMS', 'WHATSAPP']).default('EMAIL'),
  subject: z.string().optional(),
  message: z.string().optional(),
});

export const npsQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
```

### Task 3.2.2: Success Schemas ✅
**File:** `packages/shared/src/schemas/success.schema.ts`

```typescript
import { z } from 'zod';

export const healthRefreshSchema = z.object({
  clientId: z.string().uuid(),
  usageSignals: z.record(z.unknown()).optional(),
});

export const flagUpsellSchema = z.object({
  clientId: z.string().uuid(),
  notes: z.string().optional(),
  score: z.number().min(0).max(100).optional(),
});

export const reenterBdSchema = z.object({
  clientId: z.string().uuid(),
  reason: z.string().min(1, 'Reason is required'),
  notes: z.string().optional(),
});

export const successQuerySchema = z.object({
  status: z.enum(['ALL', 'HEALTHY', 'AT_RISK', 'CHURNED']).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['churnRisk', 'upsellScore', 'lastActivity']).default('churnRisk'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

---

## Section 3.3: Health Score Algorithm ✅

### Task 3.3.1: Health Score Service ✅
**File:** `apps/api/src/services/health-score.service.ts`

**Churn Risk Score Calculation:**

| Factor | Weight | Description |
|--------|--------|-------------|
| NPS Score | 30% | Lower = higher risk (invert: (10 - score) / 10) |
| Days Since Last Meeting | 20% | More days = higher risk |
| Document Expiry | 15% | Expired docs = risk |
| Onboarding SLA | 15% | Historical breaches = risk |
| Email Response Rate | 10% | No response = risk |
| Support Tickets | 10% | More tickets = risk |

**Formula:**
```
churnRiskScore = 
  (npsFactor * 0.30) +
  (meetingFactor * 0.20) +
  (documentFactor * 0.15) +
  (slaFactor * 0.15) +
  (responseFactor * 0.10) +
  (supportFactor * 0.10)
```

**Upsell Score Calculation:**

| Factor | Weight | Description |
|--------|--------|-------------|
| Contract Value Growth | 30% | Growing = upsell potential |
| Feature Usage | 25% | High usage = upsell potential |
| Team Size | 20% | Growing team = upsell |
| NPS Score | 15% | Promoters = upsell (score >= 9) |
| Engagement | 10% | High engagement = upsell |

```typescript
interface HealthScores {
  churnRiskScore: number;    // 0-100, higher = more risk
  upsellScore: number;       // 0-100, higher = more opportunity
  factors: {
    npsFactor: number;
    meetingFactor: number;
    documentFactor: number;
    slaFactor: number;
    responseFactor: number;
    supportFactor: number;
  };
}
```

---

## Section 3.4: AI Agents - Phase 3 ✅

### Task 3.4.1: NPS Agent ✅
**File:** `apps/api/src/agents/nps.agent.ts`

**Responsibilities:**
- Schedule NPS surveys (post-onboarding completion)
- Track NPS response rates
- Alert immediately on detractor responses (score 0-6)
- Celebrate promoter responses (score 9-10)
- Generate weekly/monthly NPS reports

**Trigger:** 
- Onboarding COMPLETED → schedule first NPS (after 7 days)
- Weekly cron for pending surveys

### Task 3.4.2: Health Agent ✅
**File:** `apps/api/src/agents/health.agent.ts`

**Responsibilities:**
- Calculate churn risk score (daily)
- Update CustomerHealth record
- Detect risk threshold breaches (score > 70)
- Publish CHURN_DETECTED events
- Track engagement signals

**Schedule:** Daily via BullMQ

### Task 3.4.3: Upsell Agent ✅
**File:** `apps/api/src/agents/upsell.agent.ts`

**Responsibilities:**
- Analyze client usage patterns
- Identify upsell signals (high usage, growing team)
- Calculate upsell score
- Flag high-potential upsells (score > 60)
- Publish UPSELL_DETECTED events

**Schedule:** Daily via BullMQ

---

## Section 3.5: BullMQ Jobs ✅

### Task 3.5.1: Add Health Processors ✅
**File:** `apps/api/src/jobs/agent-processors.ts`

```typescript
// Process NPS Survey Send
export async function processNpsSurvey(job: Job) {
  const { clientId, sendVia } = job.data as { clientId: string; sendVia: string };
  // Generate and send NPS survey
}

// Process Health Calculation
export async function processHealthCalculation(job: Job) {
  const { clientId } = job.data as { clientId: string };
  // Calculate and update health scores
}

// Process Upsell Detection
export async function processUpsellDetection(job: Job) {
  const { clientId } = job.data as { clientId: string };
  // Analyze and flag upsell opportunities
}
```

---

## Section 3.6: Frontend ⬜

### Task 3.6.1: Success Dashboard
**File:** `apps/web/src/app/dashboard/success/page.tsx`

**Features:**
- Health overview (pie chart: Healthy/At Risk/Churned)
- Churn risk distribution
- Upsell opportunities list
- Recent NPS responses
- Action items

### Task 3.6.2: Client Health Detail
**File:** `apps/web/src/app/dashboard/success/[clientId]/page.tsx`

**Features:**
- Health score visualization (gauge chart)
- Risk factor breakdown
- Upsell opportunity details
- NPS history
- Action buttons (flag upsell, re-enter BD)

### Task 3.6.3: NPS Management Page
**File:** `apps/web/src/app/dashboard/nps/page.tsx`

**Features:**
- NPS trend chart (line chart)
- Score distribution (bar chart)
- Feedback list
- Survey sending interface

### Task 3.6.4: Components to Create

```
apps/web/src/components/success/
├── HealthScore.tsx            # Gauge chart component
├── ChurnRiskIndicator.tsx     # Risk badge/component
├── UpsellOpportunity.tsx      # Upsell card
├── HealthTrendChart.tsx      # Line chart
├── ClientHealthCard.tsx      # Summary card
└── ActionPanel.tsx           # Action buttons

apps/web/src/components/nps/
├── NpsSurvey.tsx             # Survey form
├── NpsTrendChart.tsx         # Trend visualization
├── NpsDistribution.tsx      # Distribution chart
└── NpsFeedbackList.tsx      # Feedback display
```

---

## File Summary

### New Files to Create

```
apps/api/src/
├── modules/nps/
│   ├── nps.routes.ts
│   ├── nps.controller.ts
│   └── nps.service.ts
├── modules/success/
│   ├── success.routes.ts
│   ├── success.controller.ts
│   ├── success.service.ts
│   └── success.bd-handoff.routes.ts
├── agents/
│   ├── nps.agent.ts
│   ├── health.agent.ts
│   └── upsell.agent.ts
└── services/
    └── health-score.service.ts

packages/shared/src/schemas/
├── nps.schema.ts
└── success.schema.ts

apps/web/src/app/dashboard/
├── success/
│   ├── page.tsx
│   └── [clientId]/
│       └── page.tsx
└── nps/
    └── page.tsx

apps/web/src/components/success/
├── HealthScore.tsx
├── ChurnRiskIndicator.tsx
├── UpsellOpportunity.tsx
├── HealthTrendChart.tsx
├── ClientHealthCard.tsx
└── ActionPanel.tsx

apps/web/src/components/nps/
├── NpsSurvey.tsx
├── NpsTrendChart.tsx
├── NpsDistribution.tsx
└── NpsFeedbackList.tsx
```

### Files to Modify

```
apps/api/src/index.ts - Register new routes
apps/api/src/jobs/processors.ts - Add health processors
packages/shared/src/schemas/index.ts - Export new schemas
```

---

## Execution Priority

1. **Task 3.2.x** - Schemas (foundation)
2. **Task 3.1.x** - Routes
3. **Task 3.3.1** - Health Score Service
4. **Task 3.4.x** - Agents
5. **Task 3.5.x** - BullMQ Jobs
6. **Task 3.6.x** - Frontend (parallel)
