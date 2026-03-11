# 🚀 Client Onboarding & Business Development Service
### System Design — MVP Blueprint

> **Company Type:** LLP · Bootstrapped · No External Funding
> **Team Size:** 4 Partners
> **Revenue Sources:** Own Products + Software Solutions for Clients
> **Goal:** Internal AI-assisted tool — from lead discovery to client fully onboarded

---

## 📋 Table of Contents

- [Phase Overview](#phase-overview)
- [1. All API Endpoints](#1-all-api-endpoints)
- [2. Third-Party Apps & Services](#2-third-party-apps--services)
- [3. Tech Stack & Packages](#3-tech-stack--packages)
- [4. Database — Recommendation & Schema](#4-database--recommendation--schema)
- [5. Ollama — Local AI Setup & Model Config](#5--ollama--local-ai-setup--model-config)

---

## 🗺️ Phase Overview

| Phase | Name | Purpose |
|-------|------|---------|
| **Phase 1** | Business Development | Lead discovery → scoring → outreach → deal close |
| **Phase 2** | Onboarding Pipeline | Deal closed → 9-stage onboarding with AI + SLA monitoring |
| **Phase 3** | Customer Success | NPS → churn risk → upsell → re-entry into BD |

---

## 1. All API Endpoints

> All routes are prefixed with `/api/v1`
> Auth: JWT Bearer token on all endpoints unless noted

---

### 🔵 Phase 1 — Business Development

#### Lead Management

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/leads/search` | Trigger autonomous AI lead search job with filters (industry, location, company size) |
| `GET` | `/leads` | List all leads with pagination, filter by status/score |
| `GET` | `/leads/:id` | Get single lead detail with full enrichment data |
| `PATCH` | `/leads/:id` | Update lead fields (status, notes, manual score override) |
| `DELETE` | `/leads/:id` | Archive/delete a lead |
| `POST` | `/leads/:id/enrich` | Trigger re-enrichment of a specific lead via Clearbit/Hunter |
| `GET` | `/leads/search/status/:jobId` | Poll status of a running lead search job |

#### Lead Scoring

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/leads/score` | Run AI scoring on a batch of leads, returns scored list |
| `GET` | `/leads/:id/score` | Get score breakdown for a single lead |
| `PATCH` | `/leads/:id/score` | Human override of AI score with reason |

#### Human Review

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/leads/review/queue` | Get all leads pending human review |
| `PATCH` | `/leads/:id/review` | Mark lead as approved / rejected / hold by reviewer |
| `POST` | `/leads/review/bulk` | Bulk approve or reject multiple leads |

#### Outreach & Pitches

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/outreach/pitch/generate` | AI generates personalised pitch for a lead |
| `GET` | `/outreach/pitch/:id` | Get a generated pitch draft |
| `PATCH` | `/outreach/pitch/:id` | Human edits pitch draft |
| `POST` | `/outreach/pitch/:id/approve` | Human approves pitch — marks ready to send |
| `POST` | `/outreach/pitch/:id/send` | Send approved pitch via selected channel (email/LinkedIn/WhatsApp) |
| `GET` | `/outreach/history/:leadId` | Full outreach history for a lead |

#### Follow-up Sequences

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/outreach/followup/schedule` | Schedule automated follow-up sequence for a lead |
| `GET` | `/outreach/followup/:leadId` | Get follow-up schedule and status |
| `PATCH` | `/outreach/followup/:id/pause` | Pause an active follow-up sequence |
| `DELETE` | `/outreach/followup/:id` | Cancel follow-up sequence |

#### Discovery Calls & Proposals

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/calls` | Log a discovery call (manual entry or via calendar webhook) |
| `GET` | `/calls/:id` | Get call details and transcript |
| `POST` | `/calls/:id/transcribe` | Trigger transcription of uploaded call recording |
| `POST` | `/calls/:id/proposal/generate` | AI generates proposal from call transcript |
| `GET` | `/proposals/:id` | Get proposal draft |
| `PATCH` | `/proposals/:id` | Edit proposal |
| `POST` | `/proposals/:id/approve` | Approve proposal for sending |
| `POST` | `/proposals/:id/send` | Send proposal to lead |

#### Deal Close → Onboarding Handoff

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/deals/close` | Mark deal as closed — auto-creates client record and triggers onboarding |
| `GET` | `/deals/:id` | Get deal summary |

---

### 🟠 Phase 2 — Onboarding Pipeline

#### Client Management

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/clients` | List all clients with onboarding stage and health status |
| `GET` | `/clients/:id` | Full client profile |
| `POST` | `/clients` | Manually create a client (bypass deal flow) |
| `PATCH` | `/clients/:id` | Update client details |

#### Onboarding Pipeline & Stages

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/onboarding/:clientId` | Get full onboarding pipeline state for a client |
| `POST` | `/onboarding/:clientId/stage/advance` | Advance client to next stage (validates checklist gate) |
| `PATCH` | `/onboarding/:clientId/stage` | Manually set stage (admin override) |
| `GET` | `/onboarding/stages` | Get all stage definitions with SLA config |
| `GET` | `/onboarding/:clientId/audit` | Full audit trail of all stage transitions |

#### Checklist Gates

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/onboarding/:clientId/checklist` | Get checklist for current stage |
| `PATCH` | `/onboarding/:clientId/checklist/:itemId` | Mark checklist item complete or incomplete |
| `GET` | `/onboarding/:clientId/checklist/gate` | Check if current stage gate is cleared (all mandatory items done) |

#### SLA Monitoring

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/onboarding/sla/dashboard` | SLA health dashboard — all clients by risk level |
| `GET` | `/onboarding/:clientId/sla` | SLA status for a client: At Risk / Overdue / Stalled / On Track |
| `POST` | `/onboarding/sla/run` | Manually trigger SLA check job (normally runs on cron) |

#### Requirements & Documents

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/clients/:id/requirements` | Submit requirements (text or structured fields) |
| `GET` | `/clients/:id/requirements` | Get requirements for a client |
| `POST` | `/documents/upload` | Upload a client document |
| `GET` | `/documents/:clientId` | List all documents for a client |
| `DELETE` | `/documents/:docId` | Delete a document |
| `POST` | `/documents/:docId/scan` | AI scans document for missing fields, wrong type, expiry issues |
| `GET` | `/documents/:docId/scan/result` | Get scan result |

#### Meetings

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/meetings` | Create / schedule a meeting |
| `GET` | `/meetings` | List all meetings (filter by client, upcoming, past) |
| `GET` | `/meetings/:id` | Get meeting detail |
| `PATCH` | `/meetings/:id` | Update meeting details |
| `DELETE` | `/meetings/:id` | Cancel a meeting |
| `POST` | `/meetings/:id/notes` | Add meeting notes/update |
| `GET` | `/meetings/:id/notes` | Get all notes for a meeting |

#### AI Assistant Actions

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/ai/next-action` | Get AI next-action suggestion for a client based on current state |
| `POST` | `/ai/followup-email/generate` | AI drafts a follow-up email for a client |
| `PATCH` | `/ai/followup-email/:id` | Human edits the AI-drafted email |
| `POST` | `/ai/followup-email/:id/approve` | Human approves email |
| `POST` | `/ai/followup-email/:id/send` | Send approved email |
| `POST` | `/ai/summary/generate` | Generate full onboarding summary on completion |
| `GET` | `/ai/summary/:clientId` | Get onboarding summary |

---

### 🟢 Phase 3 — Customer Success

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/nps/collect` | Record NPS response from client |
| `GET` | `/nps/:clientId` | Get NPS history for a client |
| `GET` | `/success/dashboard` | Overview of all post-onboarding clients and health signals |
| `GET` | `/success/:clientId/health` | Churn risk score and upsell signals for a client |
| `POST` | `/success/:clientId/upsell` | Flag upsell detected — re-enters client into BD pipeline |

---

### 🔔 Notifications & Webhooks

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/webhooks/deal-close` | External webhook receiver — deal close from CRM/payment tool |
| `GET` | `/notifications` | Get all notifications for logged-in user |
| `PATCH` | `/notifications/:id/read` | Mark notification as read |
| `POST` | `/telegram/webhook` | Receive Telegram bot messages and approval responses |
| `POST` | `/telegram/send` | Send message/approval request via Telegram bot |

---

### 🔐 Auth & Users

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/auth/login` | Login — returns JWT |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Invalidate token |
| `GET` | `/users/me` | Get current user profile |
| `GET` | `/users` | List all team members (admin only) |
| `PATCH` | `/users/:id/role` | Update user role |

---

## 2. Third-Party Apps & Services

| Service | What It Does In This System | Phase |
|---------|----------------------------|-------|
| **Ollama (Local LLM Server)** | Self-hosted LLM inference — lead scoring, pitch generation, proposal drafting, document scanning, next-action suggestions, email drafting, onboarding summaries. Runs fully on your own server — zero API cost, full data privacy | All |
| **Clearbit** | Lead enrichment — company size, industry, tech stack, social profiles | Phase 1 |
| **Hunter.io** | Find verified email addresses for leads | Phase 1 |
| **Apollo.io** | Autonomous lead search and prospecting database | Phase 1 |
| **LinkedIn API / Phantombuster** | LinkedIn outreach automation and profile scraping | Phase 1 |
| **SendGrid** | Transactional email delivery — pitches, follow-ups, proposals, onboarding emails | Phase 1 & 2 |
| **Twilio** | WhatsApp outreach messages and SMS notifications | Phase 1 |
| **Telegram Bot API** | Internal team notifications, approval requests, status updates via bot | Phase 2 & 3 |
| **Google Calendar API** | Schedule discovery calls and onboarding meetings, sync events | Phase 1 & 2 |
| **Google Meet / Zoom API** | Generate meeting links, fetch recordings for transcription | Phase 1 & 2 |
| **faster-whisper (local)** | Local call transcription via OpenAI Whisper model — runs as a Python sidecar service, no cloud API needed | Phase 1 |
| **AWS S3 / Cloudflare R2** | Store uploaded client documents and call recordings | Phase 2 |
| **Resend** | Alternative email delivery (simpler API, good deliverability) | Phase 1 & 2 |
| **Stripe Webhooks** | (Optional) Trigger deal-close event when payment is confirmed | Phase 1 |
| **Sentry** | Error monitoring and alerting across backend | All |
| **BullMQ + Redis** | Job queue for async tasks — lead search, SLA checks, AI generation | All |
| **PostHog** | Internal product analytics — track feature usage and workflow drop-offs | All |

---

## 3. Tech Stack & Packages

### 🖥️ Frontend

| Package | npm name | Purpose |
|---------|----------|---------|
| Next.js 14 | `next` | React framework — SSR + App Router |
| React 18 | `react` | UI library |
| TypeScript | `typescript` | Type safety |
| Tailwind CSS | `tailwindcss` | Utility-first styling |
| shadcn/ui | `@shadcn/ui` (CLI) | Pre-built accessible UI components |
| Zustand | `zustand` | Lightweight global state management |
| React Query | `@tanstack/react-query` | Server state, caching, async data fetching |
| React Hook Form | `react-hook-form` | Form management |
| Zod | `zod` | Schema validation (shared with backend) |
| Recharts | `recharts` | Charts — lead funnel, SLA health, NPS trends |
| date-fns | `date-fns` | Date formatting and manipulation |
| Lucide Icons | `lucide-react` | Icon library |
| next-auth | `next-auth` | Authentication session management |
| axios | `axios` | HTTP client |
| react-dropzone | `react-dropzone` | File upload UI for documents |
| React-PDF | `@react-pdf/renderer` | Generate PDFs for proposals client-side |

---

### ⚙️ Backend

| Package | pip / npm name | Purpose |
|---------|----------------|---------|
| Node.js + Express | `express` | REST API server |
| TypeScript | `typescript` | Type safety |
| Prisma ORM | `prisma` + `@prisma/client` | Database ORM and migrations |
| PostgreSQL | (DB) | Primary relational database |
| Redis | `ioredis` | Queue backend, caching, session store |
| BullMQ | `bullmq` | Job queue — async AI tasks, SLA cron, follow-ups |
| JWT | `jsonwebtoken` | Auth token creation and validation |
| bcrypt | `bcryptjs` | Password hashing |
| Zod | `zod` | Request validation |
| Multer | `multer` | File upload middleware |
| AWS SDK | `@aws-sdk/client-s3` | S3 / R2 file storage |
| Nodemailer / SendGrid | `@sendgrid/mail` | Email delivery |
| Twilio | `twilio` | WhatsApp + SMS |
| Telegram Bot | `node-telegram-bot-api` | Telegram bot for team notifications |
| node-cron | `node-cron` | Cron jobs — SLA checker every 4 hours |
| Winston | `winston` | Structured logging |
| Morgan | `morgan` | HTTP request logging |
| Helmet | `helmet` | HTTP security headers |
| cors | `cors` | CORS middleware |
| dotenv | `dotenv` | Environment variable management |
| Sentry | `@sentry/node` | Error tracking |

---

### 🤖 AI & Integrations

| Package | pip / npm name | Purpose |
|---------|----------------|---------|
| Ollama JS Client | `ollama` | HTTP client for local Ollama server — call any local model |
| LangChain.js | `langchain` + `@langchain/community` | Orchestrate multi-step AI chains using `ChatOllama` integration |
| faster-whisper | `faster-whisper` (pip) | Local Whisper-based call transcription — Python sidecar service |
| Flask (sidecar) | `flask` (pip) | Lightweight HTTP server wrapping the faster-whisper transcription service |
| Axios | `axios` | REST calls to Clearbit, Hunter, Apollo |
| Cheerio | `cheerio` | HTML parsing for web scraping (lead search) |
| Puppeteer | `puppeteer` | Headless browser scraping for lead discovery |
| Google APIs | `googleapis` | Google Calendar + Meet integration |

---

### 🗄️ Database & Infra

| Tool | Purpose |
|------|---------|
| PostgreSQL 15 | Primary database |
| Redis 7 | Queue, cache, pub/sub |
| Prisma Migrate | Schema migrations |
| Docker + Docker Compose | Local dev environment |
| PM2 | Node.js process manager in production |
| Nginx | Reverse proxy |
| GitHub Actions | CI/CD pipeline |
| Railway / Render / VPS | Hosting (bootstrapped-friendly) |

---

## 4. Database — Recommendation & Schema

### ✅ Recommendation: PostgreSQL via Prisma

> **Use PostgreSQL — not MongoDB.**

**Reasons:**

- [ ] Your data is **highly relational** — Leads → Deals → Clients → Onboarding Stages → Checklists → Documents → Meetings are all linked with foreign keys. Relational integrity matters here.
- [ ] **Audit trails and stage transitions** need ACID compliance — no partial writes allowed when advancing a pipeline stage.
- [ ] **Scoring, SLA calculations, and reporting** benefit from SQL joins and aggregations natively.
- [ ] Prisma ORM gives you type-safe queries, auto-migrations, and works beautifully with PostgreSQL.
- [ ] MongoDB's flexibility adds complexity you don't need for a structured onboarding workflow.

---

### 🗂️ Complete Database Schema

---

#### `users` — Team members / partners

```
users
─────────────────────────────────
id              UUID          PK
name            String
email           String        UNIQUE
password_hash   String
role            Enum          [ADMIN, BD_MANAGER, ONBOARDING_MANAGER, PARTNER]
telegram_chat_id String?      (for bot notifications)
created_at      DateTime
updated_at      DateTime
```

---

#### `leads` — Discovered or manually added prospects

```
leads
─────────────────────────────────
id                UUID          PK
company_name      String
contact_name      String?
contact_email     String?
contact_linkedin  String?
contact_phone     String?
website           String?
industry          String?
company_size      String?       (e.g. "10-50", "50-200")
location          String?
source            Enum          [AI_SEARCH, MANUAL, REFERRAL, INBOUND]
raw_data          JSON          (full enrichment data from Clearbit/Apollo)
ai_score          Float?        (0-100)
score_breakdown   JSON?         (criteria and sub-scores)
human_score_override Float?
status            Enum          [DISCOVERED, PENDING_REVIEW, APPROVED, REJECTED, ON_HOLD, CONTACTED, RESPONDED, IN_DISCOVERY, PROPOSAL_SENT, DEAL_CLOSED, LOST]
reviewed_by       UUID?         FK → users.id
reviewed_at       DateTime?
review_notes      String?
assigned_to       UUID?         FK → users.id
created_at        DateTime
updated_at        DateTime
```

---

#### `lead_search_jobs` — Autonomous search job tracking

```
lead_search_jobs
─────────────────────────────────
id              UUID          PK
triggered_by    UUID          FK → users.id
filters         JSON          (industry, location, size, keywords)
status          Enum          [QUEUED, RUNNING, COMPLETED, FAILED]
leads_found     Int           default 0
error_message   String?
started_at      DateTime?
completed_at    DateTime?
created_at      DateTime
```

---

#### `outreach_pitches` — AI-generated pitch drafts

```
outreach_pitches
─────────────────────────────────
id              UUID          PK
lead_id         UUID          FK → leads.id
channel         Enum          [EMAIL, LINKEDIN, WHATSAPP]
subject         String?       (for email)
body            Text
version         Int           default 1
status          Enum          [DRAFT, PENDING_REVIEW, APPROVED, SENT, REJECTED]
generated_by_ai Boolean       default true
reviewed_by     UUID?         FK → users.id
approved_at     DateTime?
sent_at         DateTime?
send_error      String?
created_at      DateTime
updated_at      DateTime
```

---

#### `followup_sequences` — Automated follow-up schedule per lead

```
followup_sequences
─────────────────────────────────
id              UUID          PK
lead_id         UUID          FK → leads.id
status          Enum          [ACTIVE, PAUSED, COMPLETED, CANCELLED]
current_step    Int           default 0
total_steps     Int
next_send_at    DateTime?
created_at      DateTime
updated_at      DateTime
```

```
followup_steps
─────────────────────────────────
id              UUID          PK
sequence_id     UUID          FK → followup_sequences.id
step_number     Int
channel         Enum          [EMAIL, LINKEDIN, WHATSAPP]
subject         String?
body            Text
delay_hours     Int           (hours after previous step)
status          Enum          [PENDING, SENT, SKIPPED]
sent_at         DateTime?
created_at      DateTime
```

---

#### `discovery_calls` — Logged calls with transcripts

```
discovery_calls
─────────────────────────────────
id              UUID          PK
lead_id         UUID          FK → leads.id
scheduled_at    DateTime
duration_minutes Int?
recording_url   String?       (S3 key)
transcript      Text?
transcript_status Enum        [NONE, PROCESSING, DONE, FAILED]
notes           Text?
conducted_by    UUID          FK → users.id
created_at      DateTime
updated_at      DateTime
```

---

#### `proposals` — AI-generated or manual proposals

```
proposals
─────────────────────────────────
id              UUID          PK
lead_id         UUID          FK → leads.id
call_id         UUID?         FK → discovery_calls.id
title           String
body            Text          (markdown or rich text)
file_url        String?       (S3 key if PDF uploaded)
status          Enum          [DRAFT, PENDING_REVIEW, APPROVED, SENT, ACCEPTED, REJECTED]
version         Int           default 1
reviewed_by     UUID?         FK → users.id
approved_at     DateTime?
sent_at         DateTime?
created_at      DateTime
updated_at      DateTime
```

---

#### `clients` — Onboarded clients (created on deal close)

```
clients
─────────────────────────────────
id              UUID          PK
lead_id         UUID          UNIQUE FK → leads.id
company_name    String
primary_contact_name  String
primary_contact_email String
primary_contact_phone String?
contract_value  Decimal?
contract_start  DateTime?
contract_end    DateTime?
assigned_manager UUID         FK → users.id
status          Enum          [ONBOARDING, ACTIVE, AT_RISK, CHURNED]
created_at      DateTime
updated_at      DateTime
```

---

#### `onboarding_pipelines` — One per client, tracks current stage

```
onboarding_pipelines
─────────────────────────────────
id              UUID          PK
client_id       UUID          UNIQUE FK → clients.id
current_stage   Enum          [DEAL_CLOSED, KICKOFF, REQUIREMENTS_GATHERING, DOCUMENTATION, TECHNICAL_SETUP, TESTING_UAT, GO_LIVE, TRAINING, COMPLETED]
health_status   Enum          [ON_TRACK, AT_RISK, OVERDUE, STALLED]
started_at      DateTime
completed_at    DateTime?
last_activity_at DateTime
created_at      DateTime
updated_at      DateTime
```

---

#### `onboarding_stage_logs` — Audit trail of every stage transition

```
onboarding_stage_logs
─────────────────────────────────
id              UUID          PK
pipeline_id     UUID          FK → onboarding_pipelines.id
from_stage      Enum          (same enum as current_stage)
to_stage        Enum
transitioned_by UUID          FK → users.id
notes           String?
transitioned_at DateTime
```

---

#### `checklist_items` — Per-stage gate items (seed data + custom)

```
checklist_items
─────────────────────────────────
id              UUID          PK
pipeline_id     UUID          FK → onboarding_pipelines.id
stage           Enum          (same stage enum)
title           String
description     String?
is_mandatory    Boolean       default true
is_completed    Boolean       default false
completed_by    UUID?         FK → users.id
completed_at    DateTime?
created_at      DateTime
```

---

#### `stage_sla_config` — SLA hours per stage (configurable)

```
stage_sla_config
─────────────────────────────────
id              UUID          PK
stage           Enum          UNIQUE
sla_hours       Int           (target hours to complete stage)
at_risk_pct     Float         default 0.75  (75% elapsed = At Risk)
created_at      DateTime
updated_at      DateTime
```

---

#### `requirements` — Client requirements gathered during onboarding

```
requirements
─────────────────────────────────
id              UUID          PK
client_id       UUID          FK → clients.id
pipeline_id     UUID          FK → onboarding_pipelines.id
title           String
body            Text
gathered_by     UUID          FK → users.id
ai_suggestions  JSON?         (AI-generated suggestions based on requirements)
created_at      DateTime
updated_at      DateTime
```

---

#### `documents` — Uploaded client documents

```
documents
─────────────────────────────────
id              UUID          PK
client_id       UUID          FK → clients.id
pipeline_id     UUID?         FK → onboarding_pipelines.id
name            String
file_url        String        (S3 key)
file_type       String        (mime type)
file_size_kb    Int
category        Enum          [CONTRACT, KYC, TECHNICAL_SPEC, NDA, OTHER]
expiry_date     DateTime?
scan_status     Enum          [NOT_SCANNED, SCANNING, OK, ISSUES_FOUND]
scan_result     JSON?         (missing fields, issues flagged by AI)
uploaded_by     UUID          FK → users.id
created_at      DateTime
```

---

#### `meetings` — Scheduled meetings for all phases

```
meetings
─────────────────────────────────
id              UUID          PK
client_id       UUID?         FK → clients.id
lead_id         UUID?         FK → leads.id
title           String
type            Enum          [DISCOVERY, KICKOFF, REQUIREMENTS, REVIEW, TRAINING, OTHER]
scheduled_at    DateTime
duration_minutes Int          default 60
meet_link       String?
status          Enum          [UPCOMING, COMPLETED, CANCELLED, RESCHEDULED]
organized_by    UUID          FK → users.id
calendar_event_id String?     (Google Calendar event ID)
created_at      DateTime
updated_at      DateTime
```

```
meeting_notes
─────────────────────────────────
id              UUID          PK
meeting_id      UUID          FK → meetings.id
body            Text
written_by      UUID          FK → users.id
created_at      DateTime
```

---

#### `ai_emails` — AI-drafted emails awaiting human approval

```
ai_emails
─────────────────────────────────
id              UUID          PK
client_id       UUID?         FK → clients.id
lead_id         UUID?         FK → leads.id
type            Enum          [FOLLOWUP, ONBOARDING_UPDATE, PROPOSAL, PITCH, CUSTOM]
to_email        String
subject         String
body            Text
status          Enum          [DRAFT, PENDING_APPROVAL, APPROVED, SENT, REJECTED]
generated_at    DateTime
reviewed_by     UUID?         FK → users.id
approved_at     DateTime?
sent_at         DateTime?
created_at      DateTime
```

---

#### `nps_responses` — Post-onboarding NPS

```
nps_responses
─────────────────────────────────
id              UUID          PK
client_id       UUID          FK → clients.id
score           Int           (0-10)
feedback        Text?
collected_at    DateTime
collected_by    UUID?         FK → users.id
```

---

#### `notifications` — In-app + Telegram notifications

```
notifications
─────────────────────────────────
id              UUID          PK
user_id         UUID          FK → users.id
type            Enum          [SLA_ALERT, APPROVAL_REQUEST, STAGE_CHANGE, NEW_LEAD, UPSELL_SIGNAL, MEETING_REMINDER, EMAIL_APPROVAL]
title           String
body            String
reference_type  String?       (e.g. "lead", "client", "meeting")
reference_id    UUID?
channel         Enum          [IN_APP, TELEGRAM]
is_read         Boolean       default false
created_at      DateTime
```

---

#### `customer_health` — Churn and upsell signals (Phase 3)

```
customer_health
─────────────────────────────────
id              UUID          PK
client_id       UUID          UNIQUE FK → clients.id
churn_risk_score Float        (0-100, higher = more at risk)
upsell_score     Float        (0-100)
last_activity_at DateTime?
usage_signals   JSON?         (raw signals from product usage)
upsell_flagged  Boolean       default false
upsell_flagged_at DateTime?
computed_at     DateTime
```

---

### 🔗 Key Relationships Summary

```
users ──────────────────────────────────────────┐
  │                                             │ (assigned_to / reviewed_by / organized_by)
  ├── lead_search_jobs                          │
  ├── leads ──────────────────────────── many  ─┘
  │     ├── outreach_pitches
  │     ├── followup_sequences ── followup_steps
  │     ├── discovery_calls
  │     └── proposals
  │
  └── clients (created from leads on deal close)
        ├── onboarding_pipelines
        │     ├── onboarding_stage_logs
        │     ├── checklist_items
        │     └── requirements
        ├── documents
        ├── meetings ── meeting_notes
        ├── ai_emails
        ├── nps_responses
        └── customer_health
```

---

---

## 5. 🤖 Ollama — Local AI Setup & Model Config

> All LLM inference runs locally on your server via Ollama. No API keys, no usage costs, no client data leaving your infrastructure.

---

### 🖥️ How It Works

```
Node.js Backend
     │
     │  HTTP POST http://localhost:11434/api/generate
     │  (or via ollama npm client / LangChain ChatOllama)
     ▼
Ollama Server (runs as a daemon on your VPS)
     │
     ├── llama3.1:8b        ← primary model
     ├── mistral:7b          ← document scanning
     └── phi3:mini           ← fast short tasks

Python Sidecar (Flask)
     │
     │  POST http://localhost:5001/transcribe
     ▼
faster-whisper              ← local call transcription
```

---

### 📦 Models to Pull — by Task

| Model | `ollama pull` command | Used For | Min RAM |
|-------|-----------------------|----------|---------|
| **llama3.1:8b** | `ollama pull llama3.1:8b` | Lead scoring, pitch generation, proposals, email drafting, onboarding summaries | 8 GB |
| **llama3.1:70b** | `ollama pull llama3.1:70b` | Same as above — higher quality if server allows | 40 GB |
| **mistral:7b** | `ollama pull mistral:7b` | Document scanning, structured field extraction | 6 GB |
| **phi3:mini** | `ollama pull phi3:mini` | Fast next-action suggestions, short classification tasks | 3 GB |
| **nomic-embed-text** | `ollama pull nomic-embed-text` | Text embeddings for semantic lead matching (future) | 1 GB |

> **Recommended minimum VPS spec for MVP:** 16 GB RAM, 4 vCPU, 50 GB SSD — runs llama3.1:8b + mistral:7b comfortably.

---

### ⚙️ Ollama Server Setup

```bash
# 1. Install Ollama on your Linux VPS
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull required models
ollama pull llama3.1:8b
ollama pull mistral:7b
ollama pull phi3:mini

# 3. Start Ollama as a service (auto-starts on boot)
sudo systemctl enable ollama
sudo systemctl start ollama

# 4. Verify it's running
curl http://localhost:11434/api/tags
```

---

### 🔗 Node.js Integration — Two Options

#### Option A — Ollama npm client (simple, direct)

```bash
npm install ollama
```

```typescript
import Ollama from 'ollama'

const response = await ollama.chat({
  model: 'llama3.1:8b',
  messages: [
    { role: 'system', content: 'You are a B2B lead scoring assistant.' },
    { role: 'user', content: `Score this lead: ${JSON.stringify(leadData)}` }
  ]
})

const result = response.message.content
```

#### Option B — LangChain with ChatOllama (recommended for chains)

```bash
npm install langchain @langchain/community
```

```typescript
import { ChatOllama } from '@langchain/community/chat_models/ollama'
import { PromptTemplate } from 'langchain/prompts'
import { LLMChain } from 'langchain/chains'

const model = new ChatOllama({
  baseUrl: 'http://localhost:11434',
  model: 'llama3.1:8b',
  temperature: 0.3
})

const scoringChain = new LLMChain({
  llm: model,
  prompt: PromptTemplate.fromTemplate(`
    You are a B2B lead scoring assistant. Score the following lead from 0-100.
    Return JSON only: {{"score": number, "reasoning": string, "criteria": object}}
    Lead data: {lead}
  `)
})

const result = await scoringChain.call({ lead: JSON.stringify(leadData) })
```

---

### 🎙️ faster-whisper — Transcription Sidecar

```bash
# Python sidecar setup
pip install faster-whisper flask

# models: tiny, base, small, medium, large-v3
# Recommended: medium (good balance of speed vs accuracy)
```

```python
# transcription_service.py — Flask microservice
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

app = Flask(__name__)
model = WhisperModel("medium", device="cpu", compute_type="int8")

@app.route("/transcribe", methods=["POST"])
def transcribe():
    audio_path = request.json.get("file_path")
    segments, info = model.transcribe(audio_path, beam_size=5)
    transcript = " ".join([seg.text for seg in segments])
    return jsonify({ "transcript": transcript, "language": info.language })

if __name__ == "__main__":
    app.run(port=5001)
```

```typescript
// Node.js backend calling the sidecar
const response = await axios.post('http://localhost:5001/transcribe', {
  file_path: '/tmp/recordings/call_abc123.mp3'
})
const transcript = response.data.transcript
```

---

### 🧠 Model Assignment by Feature

| Feature | Model | Why |
|---------|-------|-----|
| Lead scoring | `llama3.1:8b` | Needs reasoning over structured company data |
| Pitch generation | `llama3.1:8b` | Needs quality long-form writing |
| Proposal drafting | `llama3.1:8b` | Complex, multi-section document generation |
| Document scanning | `mistral:7b` | Fast structured extraction, field detection |
| Next-action suggestion | `phi3:mini` | Short output, speed matters here |
| Follow-up email drafting | `llama3.1:8b` | Needs tone and personalisation |
| Onboarding summary | `llama3.1:8b` | Full narrative generation |
| Call transcription | `faster-whisper medium` | Audio — not an LLM task |

---

### 🔒 Privacy & Cost Summary

| Factor | Cloud LLM (OpenAI) | Ollama (Local) |
|--------|-------------------|----------------|
| Cost per request | ~$0.01–0.05 | ₹0 |
| Client data privacy | Data sent to OpenAI servers | Stays on your VPS |
| Internet required | Yes | No (after model download) |
| Setup complexity | Low | Medium |
| Model quality | GPT-4o = very high | llama3.1:8b = very good for these tasks |
| Latency | ~1–3s | ~2–8s on CPU (faster with GPU) |

---

## ✅ MVP Build Checklist

### Phase 1 — Business Development
- [x] Real-data lead search job (SearXNG + website scraping + LLM extraction)
- [x] No dummy/AI fallback when real search returns zero results
- [x] Search job tracking + SSE progress stream (`/leads/search-jobs`, `/leads/search/:jobId/stream`)
- [x] AI scoring pipeline (batch + per-lead score endpoints)
- [x] Human review queue + bulk review endpoints
- [~] Pitch generation + approve/send flow (API implemented, end-to-end delivery depends on provider keys)
- [~] Follow-up sequence scheduling/cancel APIs + BullMQ queue (full delivery depends on outbound providers)
- [~] Call transcription trigger and call summary endpoints (transcription sidecar runs via `ai` profile)
- [~] Proposal generation/edit/approve/list-by-lead endpoints
- [x] Deal close endpoint (`/deals/close`) with transactional handoff

Legend: `[x]` implemented and verified, `[~]` implemented but integration-dependent or partially validated, `[ ]` not implemented.

### Phase 2 — Onboarding Pipeline
- [ ] 9-stage pipeline with checklist gates
- [ ] SLA monitoring cron (every 4 hours via node-cron)
- [ ] At Risk / Overdue / Stalled flag logic
- [ ] Audit trail on every stage transition
- [ ] Document upload + AI scan
- [ ] Requirements gathering + AI suggestions
- [ ] Meeting scheduler (Google Calendar integration)
- [ ] AI follow-up email drafting + approval
- [ ] Telegram bot for approvals and notifications
- [ ] Full onboarding summary generation

### Phase 3 — Customer Success
- [ ] NPS collection flow
- [ ] Churn risk and upsell scoring
- [ ] Upsell detection → re-entry into BD pipeline
- [ ] Customer health dashboard

---

## 7. Implementation Notes — Architecture & Decisions

> This section documents all changes made during implementation vs. the original plan.

### Tech Stack Changes

| Original | Replaced With | Reason |
|----------|---------------|--------|
| `next-auth` | Backend-owned JWT + httpOnly cookies | Simpler architecture, no third-party auth dependency, full control over token lifecycle |
| `bcryptjs` | `argon2` | Winner of Password Hashing Competition, resistant to GPU attacks, better security |
| `axios` | Native `fetch` | Zero-dependency HTTP client, built-in to Node 18+, smaller bundle |
| `winston` + `morgan` | `pino` + `pino-http` | 5x faster structured logging, native JSON output, lower overhead |
| `flask` (sidecar) | `FastAPI` + `uvicorn` | Async-first, auto-generated OpenAPI docs, Pydantic validation, better performance |
| `ollama` npm client | `@langchain/community` `ChatOllama` | LangChain chains enable structured prompts, templates, output parsing — kept per user preference |
| No API docs | `@asteasolutions/zod-to-openapi` + `swagger-ui-express` | Auto-generated OpenAPI docs from Zod schemas at `/api/docs` |

### Monorepo Architecture

Adopted **pnpm workspaces** monorepo structure:

```
bd-pipeline/
├── apps/
│   ├── api/           # Express backend (TypeScript)
│   └── web/           # Next.js 14 frontend
├── packages/
│   ├── db/            # Prisma schema, client, seed
│   └── shared/        # Zod schemas, enums, types
├── services/
│   └── transcription/ # FastAPI + faster-whisper sidecar
├── e2e/               # Playwright E2E tests
├── docker/            # Nginx config, init scripts
└── .github/workflows/ # CI/CD pipelines
```

### Docker Setup

**Single-command startup:** `docker compose up`

| Service | Container | Port |
|---------|-----------|------|
| Redis 7 | `bd-redis` | 6379 |
| SearXNG | `bd-searxng` | 8888 → 8080 |
| Express API (+ in-container worker in dev CMD) | `bd-backend` | 3001 |
| Next.js Frontend | `bd-frontend` | 3000 |
| Optional Ollama (profile: `ai`) | `bd-ollama` | 11434 |
| Optional Transcription sidecar (profile: `ai`) | `bd-transcription` | 5001 |
| Optional dedicated worker (profile: `worker`) | `bd-worker` | — |

Additional compose files:
- `docker-compose.test.yml` — Isolated test DB (port 5433) + test Redis (port 6380) with tmpfs
- `docker-compose.prod.yml` — Production config with Nginx reverse proxy, resource limits

### Testing Strategy

| Layer | Tool | Location |
|-------|------|----------|
| Unit Tests | Vitest + mocked Prisma/BullMQ | `apps/api/src/**/__tests__/` |
| Integration Tests | Vitest + Supertest | `apps/api/src/**/__tests__/` |
| Frontend Tests | Vitest + React Testing Library | `apps/web/src/__tests__/` |
| Sidecar Tests | pytest | `services/transcription/tests/` |
| E2E Tests | Playwright (Chromium) | `e2e/tests/` |

### CI/CD Pipelines (GitHub Actions)

**CI Pipeline** (`.github/workflows/ci.yml`):
1. Lint & Type Check — all packages
2. Backend Tests — with PostgreSQL + Redis service containers, Prisma push, coverage upload
3. Frontend Tests — Vitest
4. Transcription Tests — pytest
5. Docker Build — backend, frontend, transcription images (main branch only)

**E2E Pipeline** (`.github/workflows/e2e.yml`):
1. Start Docker Compose services
2. Setup database with Prisma + seed
3. Install Playwright browsers
4. Run Playwright tests with trace/screenshot on failure
5. Upload report artifact

### Backend Module Architecture

Each API module follows a consistent 3-layer pattern:
- **`*.routes.ts`** — Express router with middleware (auth, validate, rbac)
- **`*.controller.ts`** — Thin controller using `asyncHandler` wrapper
- **`*.service.ts`** — Business logic, DB queries, queue dispatch

### External Services Layer

All third-party integrations use native `fetch` via a typed `createFetchClient()` wrapper:
- `ollama.service.ts` — ChatOllama via LangChain (lazy-loaded)
- `sendgrid.service.ts` — Email via SendGrid v3 API
- `twilio.service.ts` — SMS via Twilio REST API
- `telegram.service.ts` — Team notifications via Telegram Bot API
- `clearbit.service.ts` — Company enrichment
- `hunter.service.ts` — Email finding/verification
- `apollo.service.ts` — Lead prospecting
- `google-calendar.service.ts` — Calendar event management
- `s3.service.ts` — Presigned URL generation (AWS SDK v3 placeholder)
- `transcription.service.ts` — FastAPI sidecar client

### BullMQ Job Queues

| Queue | Schedule | Purpose |
|-------|----------|---------|
| `lead-search` | On-demand | Real lead discovery (query expansion → web search → scrape → extraction) |
| `lead-enrich` | On-demand | Clearbit + Hunter enrichment |
| `ai-scoring` | On-demand | LangChain AI lead scoring (0–100) |
| `transcription` | On-demand | FastAPI sidecar call transcription |
| `email-send` | On-demand | SendGrid email dispatch |
| `follow-up` | Delayed | Follow-up sequence steps |
| `sla-check` | Every 4 hours | SLA breach detection + Telegram alerts |
| `notification` | On-demand | Telegram notification dispatch |

### Key Implementation Details

- **Auth Flow:** Login → argon2 verify → JWT access (15min) + refresh (7d) in httpOnly cookies → auto-refresh on 401
- **Rate Limiting:** 3 tiers — global (100/15min), auth (10/15min), AI (5/min)
- **Lead Discovery Policy (Phase 1):** Real-source only; if web/apollo sources return no valid leads, system returns 0 results (no dummy AI-generated leads)
- **Error Handling:** Custom `ApiError` classes (9 types) with centralized error handler
- **Graceful Shutdown:** SIGTERM/SIGINT → close HTTP server, disconnect Prisma, close Redis, drain BullMQ workers
- **Onboarding Pipeline:** 11 stages with SLA config, checklist gates, audit trail
- **Deal Close:** Atomic `$transaction` — lead→WON + proposal→ACCEPTED + create Client + Pipeline + StageLog + AuditLog

---

*Document Version: 2.0 · Implemented MVP scaffold · pnpm monorepo · Docker Compose · Full test coverage · CI/CD*