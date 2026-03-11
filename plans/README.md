# BD Pipeline - Implementation Plans

This directory contains detailed execution plans for building the Business Development Service - an autonomous AI-powered system for lead management, client onboarding, and customer success.

**Last Updated:** March 11, 2026

## Project Overview

**Vision:** Transform from a traditional application with manual triggers to an **autonomous AI Agent** that:
- Runs continuously in the background
- Auto-discovers and qualifies leads
- Auto-manages onboarding pipeline
- Auto-detects churn risks and upsell opportunities
- Notifies team via Telegram when human input is needed
- Makes intelligent decisions using Ollama (local LLM)

## Phase Overview

| Phase | Name | Purpose | Status |
|-------|------|---------|--------|
| **1** | Business Development | Lead discovery → scoring → outreach → deal close | ✅ Complete + E2E tested (60/60) |
| **2** | Onboarding Pipeline | Deal closed → 11-stage onboarding with AI + SLA monitoring | ✅ Backend complete + E2E tested; Frontend pending |
| **3** | Customer Success | NPS → churn risk → upsell → re-entry into BD | ✅ Backend complete + E2E tested; Frontend pending |
| **Agent Core** | AI Agent System | Autonomous agent infrastructure | ✅ All 10 agents done (Phase 1+2+3) |

## Cross-Cutting Completions

| Item | Status | Details |
|------|--------|---------|
| E2E Flow Test | ✅ | `test-flow.mjs` — 60/60 assertions, covers auth → leads → outreach → proposals → clients → onboarding → meetings → NPS → success |
| Logging System | ✅ | Pino multi-transport: console (pino-pretty) + file rotation (pino-roll) |
| Log File Persistence | ✅ | `logs/app.YYYY-MM-DD.N.log` (14-day) + `logs/error.YYYY-MM-DD.N.log` (30-day) |
| 12 Bug Fixes | ✅ | Enum values, field mappings, route conflicts, Neon transaction hangs, logger format issues |
| DB Sync | ✅ | Prisma schema synced with Neon cloud DB via `db push` |

## Plans Directory

```
plans/
├── README.md                           # This file
├── PLAN-1-phase-1-completion.md       # Phase 1 completion + agent foundation
├── PLAN-2-phase-2-onboarding.md       # Phase 2: Onboarding pipeline
├── PLAN-3-phase-3-success.md          # Phase 3: Customer success
└── PLAN-4-ai-agent-core.md            # AI Agent core system
```

## Quick Start

### Recommended Execution Order

1. **PLAN-1**: ✅ COMPLETE — Phase 1 features + agent foundation built + E2E tested
   - ~~Event Bus Service~~ ✅
   - ~~Agent Log Service~~ ✅
   - ~~Lead Discovery Agent~~ ✅
   - ~~Bug Fixes (12 issues)~~ ✅
   - ~~E2E Flow Test (60/60)~~ ✅
   - ~~Logging System~~ ✅ (Pino multi-transport + file persistence)

2. **PLAN-2**: ✅ Backend COMPLETE + E2E tested — Frontend pending
   - ~~Onboarding Routes~~ ✅ (consolidated into single routes file)
   - ~~Checklist & Requirements~~ ✅
   - ~~Document Management~~ ✅
   - ~~SLA Monitoring~~ ✅
   - ~~AI Email Module~~ ✅
   - ~~4 Phase 2 Agents~~ ✅ (onboarding, sla, document, meeting)
   - Frontend (Section 2.5) — **NEXT UP**

3. **PLAN-3**: ✅ Backend COMPLETE + E2E tested — Frontend pending
   - ~~NPS Routes~~ ✅ (collect, dashboard, survey, history)
   - ~~Health Score Algorithm~~ ✅ (weighted multi-factor churn + upsell)
   - ~~Churn & Upsell Detection~~ ✅
   - ~~3 Phase 3 Agents~~ ✅ (nps, health, upsell)
   - Frontend (Section 3.6) — pending

4. **PLAN-4**: ✅ COMPLETE — All 10 agents built and registered
   - ~~Agent Memory & Planner~~ ✅
   - ~~Event System~~ ✅
   - ~~Agent Scheduler~~ ✅
   - Agent Dashboard — pending (frontend)

### Dependencies Between Plans

```
PLAN-1 (Foundation)
    │
    ├──► PLAN-2 (Uses event bus, agent services)
    │
    ├──► PLAN-3 (Uses event bus, agent services)
    │
    └──► PLAN-4 (Completes the agent system)
              │
              └──► Integrates with all agents from Plans 1-3
```

## Architecture

### Before (Traditional Application)
```
User → API → Database
       ↓
    Manual triggers
```

### After (Autonomous Agent)
```
┌─────────────────────────────────────────────────────┐
│                   AI Agent Layer                     │
│  (Makes decisions using Ollama)                     │
├─────────────────────────────────────────────────────┤
│  Event Bus ←── Triggers ──► Task Queue (BullMQ)    │
│      ↓                                               │
│  Action Engine ──► Services ──► Database           │
│      ↓                                               │
│  Notification Agent ──► Telegram / In-App           │
└─────────────────────────────────────────────────────┘
```

## Key Components

### Backend Services

| Service | Purpose | Location |
|---------|---------|----------|
| Event Bus | Pub/Sub for system events | `apps/api/src/services/event-bus.service.ts` |
| Agent Log | Audit trail for agent actions | `apps/api/src/services/agent-log.service.ts` |
| Agent Memory | Context for AI decisions | `apps/api/src/services/agent-memory.service.ts` |
| Agent Planner | Ollama decision making | `apps/api/src/services/agent-planner.service.ts` |

### Specialized Agents

| Agent | Purpose | Phase |
|-------|---------|-------|
| Lead Discovery Agent | Auto-find leads | 1 |
| Lead Scoring Agent | Auto-score leads | 1 |
| Follow-up Agent | Auto-follow sequences | 1 |
| Onboarding Agent | Auto-advance stages | 2 |
| SLA Agent | Monitor SLAs | 2 |
| Document Agent | Auto-scan documents | 2 |
| Meeting Agent | Schedule & remind | 2 |
| NPS Agent | Collect feedback | 3 |
| Health Agent | Monitor health | 3 |
| Upsell Agent | Detect opportunities | 3 |

## Communication Channels

1. **Telegram Bot** - Primary notification channel
   - Approval requests
   - Action summaries
   - Alert notifications

2. **In-App Notifications** - Secondary
   - Dashboard notification center

3. **Email** - For client communications (approved by humans)

## Database Models

All models defined in `packages/db/prisma/schema.prisma`:

- `User`, `RefreshToken` - Authentication
- `Lead`, `LeadSearchJob` - Lead management
- `OutreachPitch`, `FollowupSequence` - Outreach
- `DiscoveryCall`, `Proposal` - Sales process
- `Client`, `OnboardingPipeline` - Client management
- `ChecklistItem`, `Requirement`, `Document` - Onboarding
- `Meeting`, `MeetingNote` - Scheduling
- `NpsResponse`, `CustomerHealth` - Success metrics
- `Notification` - Alerts
- `AgentLog`, `AgentConfig` - Agent system

## Running the Project

```bash
# Basic services (Redis, Backend, Frontend, SearXNG)
docker compose up

# With AI (Ollama + Transcription)
docker compose --profile ai up

# With worker (BullMQ processor)
docker compose --profile worker up

# Full stack
docker compose --profile ai --profile worker up
```

## Environment Variables

Key variables in `.env`:

```env
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://localhost:6379

# Ollama (AI)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gpt-oss:120b-cloud

# SearXNG (Search)
SEARXNG_URL=http://localhost:8080
```

## API Documentation

Once running, visit:
- Swagger UI: `http://localhost:3001/api/docs`

## Contributing

Each plan follows this structure:
1. **Overview** - What we're building
2. **Prerequisites** - What needs to exist first
3. **Tasks** - Specific file changes needed
4. **Patterns** - Code conventions to follow
5. **Priority** - Execution order

## Recent Milestones (March 2026)

- **60/60 E2E tests passing** — Full flow from auth → leads → outreach → proposals → clients → onboarding → meetings → NPS → success
- **12 bugs fixed** during E2E testing: enum values, field mappings, route conflicts, Neon transaction hangs, logger format issues
- **Logging system rebuilt** — Pino with pino-roll file rotation, daily log files with retention policies
- **All 10 AI agents implemented** — Lead Discovery, Lead Scoring, Follow-up, Onboarding, SLA, Document, Meeting, NPS, Health, Upsell
- **Next milestone:** Frontend implementation (onboarding dashboard, success dashboard, agent dashboard)

---

**Note:** These plans are designed for coding agents to execute independently. Each task specifies exact files to create/modify with patterns to follow.
