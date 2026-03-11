# Plan 2: Phase 2 - Onboarding Pipeline

## Status
**Backend:** ✅ Complete (all routes, services, controllers, agents, schemas, jobs)  
**E2E Testing:** ✅ Verified — onboarding pipeline, stage advancement, checklist, requirements, meetings, documents all passing in 60/60 E2E flow  
**Frontend:** ⬜ Not started (Section 2.5)  
**Last Updated:** March 11, 2026 — Backend verified via E2E test (test-flow.mjs), 0 TypeScript errors

### Implementation Notes
- Tasks 2.1.1–2.1.3 and 2.1.5 were consolidated into a single `onboarding.routes.ts` + `onboarding.service.ts` + `onboarding.controller.ts` instead of separate route files, for cleaner code organization.
- AI email module includes `ai-email.service.ts` (not just routes) with full generate/edit/approve/reject/send workflow.
- Meetings module includes `meetings.service.ts` + `meetings.controller.ts` + `meetings.routes.ts` (full CRUD + notes).
- Phase 2 agents registered in `agent-processors.ts` with lazy loading, schedules in `agent-schedule.ts`.
- New events added to event-bus: `STAGE_CHANGED`, `MEETING_COMPLETED`.

## Overview
Build the 11-stage client onboarding pipeline with SLA monitoring, checklist gates, document management, and autonomous agent capabilities.

## Prerequisites
- [x] Phase 1 completed or stable
- [x] Database migrations applied (`npx prisma migrate deploy`)
- [ ] Ollama running (for AI features)
- [x] AI Agent core services running

## Database
**Schema Status:** ✅ All models already defined in `schema.prisma`

| Model | Purpose | Status |
|-------|---------|--------|
| OnboardingPipeline | 11 stages tracking | ✅ Ready |
| OnboardingStageLog | Audit trail | ✅ Ready |
| ChecklistItem | Per-stage gates | ✅ Ready |
| StageSlaConfig | SLA configuration | ✅ Ready |
| Requirement | Client requirements | ✅ Ready |
| Document | File uploads | ✅ Ready |
| Meeting | Scheduling | ✅ Ready |
| MeetingNote | Notes | ✅ Ready |
| AiEmail | AI emails | ✅ Ready |

---

## Section 2.1: Backend API Routes ✅

### Task 2.1.1: Onboarding Routes ✅
**File:** `apps/api/src/modules/onboarding/onboarding.routes.ts`

**Routes to implement:**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/onboarding/:clientId` | Get full pipeline state |
| POST | `/onboarding/:clientId/stage/advance` | Advance to next stage |
| PATCH | `/onboarding/:clientId/stage` | Manual stage override |
| GET | `/onboarding/stages` | List stage definitions |
| GET | `/onboarding/:clientId/audit` | Get audit trail |

**Pattern:** Follow `apps/api/src/modules/clients/clients.routes.ts` structure

### Task 2.1.2: Checklist Routes ✅
**File:** `apps/api/src/modules/onboarding/onboarding.routes.ts` *(consolidated into main onboarding routes)*

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/onboarding/:clientId/checklist` | Get all checklist items |
| PATCH | `/onboarding/:clientId/checklist/:itemId` | Toggle completion |
| GET | `/onboarding/:clientId/checklist/gate` | Check gate status |
| POST | `/onboarding/:clientId/checklist/bulk-complete` | Bulk complete |

### Task 2.1.3: Requirements Routes ✅
**File:** `apps/api/src/modules/onboarding/onboarding.routes.ts` *(consolidated into main onboarding routes)*

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/clients/:clientId/requirements` | Create requirement |
| GET | `/clients/:clientId/requirements` | List requirements |
| PATCH | `/clients/:clientId/requirements/:id` | Update requirement |
| DELETE | `/clients/:clientId/requirements/:id` | Delete requirement |
| POST | `/clients/:clientId/requirements/:id/ai-suggest` | Get AI suggestions |

### Task 2.1.4: Document Routes ✅
**File:** `apps/api/src/modules/documents/documents.routes.ts`

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/documents/upload` | Upload document (multipart) |
| GET | `/documents/:clientId` | List client documents |
| DELETE | `/documents/:docId` | Delete document |
| POST | `/documents/:docId/scan` | Trigger AI scan |
| GET | `/documents/:docId/scan/result` | Get scan results |

**Dependencies:**
- `apps/api/src/services/s3.service.ts` (exists)
- Multer for file upload

### Task 2.1.5: SLA Monitoring Routes ✅
**File:** `apps/api/src/modules/onboarding/onboarding.routes.ts` *(consolidated into main onboarding routes)*

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/onboarding/sla/dashboard` | SLA health overview |
| GET | `/onboarding/:clientId/sla` | Client SLA status |
| POST | `/onboarding/sla/run` | Manual SLA check trigger |

### Task 2.1.6: AI Email Routes ✅
**File:** `apps/api/src/modules/ai/ai-email.routes.ts`

**Routes:**

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/ai/followup-email/generate` | Generate follow-up email |
| PATCH | `/ai/followup-email/:id` | Edit AI email |
| POST | `/ai/followup-email/:id/approve` | Approve email |
| POST | `/ai/followup-email/:id/send` | Send email |
| GET | `/ai/emails` | List AI emails |

---

## Section 2.2: Zod Schemas ✅

### Task 2.2.1: Onboarding Schemas ✅
**File:** `packages/shared/src/schemas/onboarding.schema.ts`

**Create schemas:**

```typescript
import { z } from 'zod';
import { OnboardingStage, HealthStatus } from '@bd-pipeline/shared';

export const advanceStageSchema = z.object({
  notes: z.string().optional(),
});

export const setStageSchema = z.object({
  stage: z.nativeEnum(OnboardingStage),
  notes: z.string().optional(),
});

export const updateChecklistItemSchema = z.object({
  isCompleted: z.boolean(),
});

export const createRequirementSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Description is required'),
});

export const bulkCompleteChecklistSchema = z.object({
  itemIds: z.array(z.string().uuid()),
});

export const updateRequirementSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

export const clientIdParam = z.object({ clientId: z.string().uuid() });
export const itemIdParam = z.object({ itemId: z.string().uuid() });
export const docIdParam = z.object({ docId: z.string().uuid() });
```

**Pattern:** See `packages/shared/src/schemas/client.schema.ts`

### Task 2.2.2: Meeting Schemas ✅
**File:** `packages/shared/src/schemas/meeting.schema.ts`

```typescript
import { z } from 'zod';
import { MeetingType, MeetingStatus } from '@bd-pipeline/shared';

export const scheduleMeetingSchema = z.object({
  clientId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  title: z.string().min(1, 'Title is required'),
  type: z.nativeEnum(MeetingType).default('OTHER'),
  scheduledAt: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(60),
  sendCalendarInvite: z.boolean().default(true),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  scheduledAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  status: z.nativeEnum(MeetingStatus).optional(),
});

export const meetingNoteSchema = z.object({
  body: z.string().min(1, 'Note content is required'),
});
```

---

## Section 2.3: AI Agents - Phase 2 ✅

### Task 2.3.1: Onboarding Agent ✅
**File:** `apps/api/src/agents/onboarding.agent.ts`

**Responsibilities:**
- Monitor checklist completion per stage
- Auto-advance stages when all mandatory gates cleared
- Detect blocked stages (no progress > X days)
- Generate AI next-action suggestions
- Trigger reminders for stalled stages

**Dependencies:**
- Task 2.1.1 - Onboarding Routes
- Task 2.1.2 - Checklist Routes
- Event Bus Service (from Plan 1)

### Task 2.3.2: SLA Agent ✅
**File:** `apps/api/src/agents/sla.agent.ts`

**Responsibilities:**
- Run SLA checks (every 4 hours via BullMQ)
- Calculate hours spent in current stage
- Update health status (ON_TRACK, AT_RISK, OVERDUE, STALLED)
- Trigger SLA breach notifications

**Enhance existing:** `apps/api/src/jobs/processors.ts` - `processSlaCheck`

### Task 2.3.3: Document Agent ✅
**File:** `apps/api/src/agents/document.agent.ts`

**Responsibilities:**
- Monitor document uploads (via event)
- Auto-trigger AI scans when document uploaded
- Validate document completeness (check required fields)
- Alert on approaching expiry dates
- Flag documents with issues

### Task 2.3.4: Meeting Agent ✅
**File:** `apps/api/src/agents/meeting.agent.ts`

**Responsibilities:**
- Schedule follow-up meetings based on stage
- Send reminders (24h, 1h before via BullMQ)
- Auto-create meeting notes template after meeting
- Track meeting completion rate

---

## Section 2.4: BullMQ Jobs ✅

### Task 2.4.1: Update Job Processors ✅
**File:** `apps/api/src/jobs/agent-processors.ts`

**Add/Update processors:**

```typescript
// Add new processors
export async function processOnboardingAdvance(job: Job) {
  const { clientId } = job.data as { clientId: string };
  // Auto-advance logic
}

export async function processDocumentScan(job: Job) {
  const { docId } = job.data as { docId: string };
  // AI document scanning
}

export async function processMeetingReminder(job: Job) {
  const { meetingId, reminderType } = job.data;
  // Send reminders
}
```

---

## Section 2.5: Frontend ⬜

### Task 2.5.1: Onboarding Dashboard
**File:** `apps/web/src/app/dashboard/onboarding/page.tsx`

**Features:**
- Pipeline overview with all clients
- Current stage visualization
- Health status indicators
- Quick actions

### Task 2.5.2: Client Onboarding Detail
**File:** `apps/web/src/app/dashboard/onboarding/[clientId]/page.tsx`

**Features:**
- Stage progress tracker
- Checklist with completion status
- Requirements list
- Document uploads
- Meeting schedule
- AI suggestions panel

### Task 2.5.3: Components to Create

```
apps/web/src/components/onboarding/
├── PipelineView.tsx       # Pipeline visualization
├── StageCard.tsx          # Individual stage display
├── Checklist.tsx          # Checklist component
├── ChecklistItem.tsx      # Single checklist item
├── RequirementForm.tsx    # Add/edit requirements
├── SlaIndicator.tsx       # SLA status badge
└── AuditTrail.tsx         # Stage transition history
```

---

## File Summary

### New Files to Create

```
apps/api/src/
├── modules/onboarding/
│   ├── onboarding.routes.ts
│   ├── onboarding.checklist.routes.ts
│   ├── onboarding.requirements.routes.ts
│   ├── onboarding.sla.routes.ts
│   ├── onboarding.controller.ts
│   └── onboarding.service.ts
├── modules/documents/
│   ├── documents.routes.ts
│   ├── documents.controller.ts
│   └── documents.service.ts
├── modules/ai/
│   └── ai-email.routes.ts
├── agents/
│   ├── onboarding.agent.ts
│   ├── sla.agent.ts
│   ├── document.agent.ts
│   └── meeting.agent.ts
└── jobs/
    └── processors.ts (update)

packages/shared/src/schemas/
├── onboarding.schema.ts
└── meeting.schema.ts

apps/web/src/app/dashboard/onboarding/
├── page.tsx
└── [clientId]/
    └── page.tsx

apps/web/src/components/onboarding/
├── PipelineView.tsx
├── StageCard.tsx
├── Checklist.tsx
├── ChecklistItem.tsx
├── RequirementForm.tsx
├── SlaIndicator.tsx
└── AuditTrail.tsx
```

### Files to Modify

```
apps/api/src/index.ts - Register new routes
apps/api/src/jobs/processors.ts - Add new processors
packages/shared/src/schemas/index.ts - Export new schemas
packages/shared/src/enums.ts - Ensure enums exported
```

---

## Execution Priority

1. **Task 2.2.1** - Onboarding Schemas (foundation)
2. **Task 2.1.1** - Onboarding Routes
3. **Task 2.1.2** - Checklist Routes
4. **Task 2.1.3** - Requirements Routes
5. **Task 2.1.4** - Document Routes
6. **Task 2.1.5** - SLA Routes
7. **Task 2.1.6** - AI Email Routes
8. **Task 2.3.x** - Agents (depends on 2.1.x)
9. **Task 2.5.x** - Frontend (parallel after backend)
