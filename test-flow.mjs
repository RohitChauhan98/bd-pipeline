/**
 * BD Pipeline — Full API Flow Test
 * Tests Phase 1 → 2 → 3 end-to-end
 *
 * Route paths verified against actual route files.
 * Run: node test-flow.mjs
 */

const BASE = 'http://localhost:3001/api/v1';
let ADMIN_TOKEN = '';
let BD_TOKEN = '';
let ADMIN_USER_ID = '';
let FAILURES = 0;
let TOTAL = 0;

async function req(method, path, body, token) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  };
  if (token) opts.headers['Authorization'] = `Bearer ${token}`;
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(`${BASE}${path}`, opts);
    const text = await res.text();
    try {
      return { status: res.status, data: JSON.parse(text), raw: text };
    } catch {
      return { status: res.status, data: null, raw: text };
    }
  } catch (err) {
    console.log(`  ⚠️  Request ${method} ${path} failed: ${err.message}`);
    return { status: 0, data: null, raw: err.message };
  }
}

function check(desc, response, assertion) {
  TOTAL++;
  try {
    if (assertion(response)) {
      console.log(`  ✅ ${desc}`);
      return true;
    } else {
      FAILURES++;
      console.log(`  ❌ ${desc} — status: ${response.status}, body: ${response.raw?.substring(0, 200)}`);
      return false;
    }
  } catch (e) {
    FAILURES++;
    console.log(`  ❌ ${desc} — error: ${e.message}`);
    return false;
  }
}

function section(title) {
  console.log(`\n━━━ ${title} ━━━`);
}

function info(msg) {
  console.log(`  → ${msg}`);
}

// ══════════════════════════════════════════════
async function main() {
  console.log('BD Pipeline — Full E2E Flow Test\n');

  // ── HEALTH ──
  section('PHASE 0: HEALTH CHECK');
  const health = await req('GET', '/health');
  check('Health endpoint', health, r => r.data?.data?.status === 'ok');

  // ═══════════════════════════════════════════
  // PHASE 1: AUTHENTICATION
  // ═══════════════════════════════════════════
  section('PHASE 1: AUTHENTICATION');

  const adminLogin = await req('POST', '/auth/login', {
    email: 'admin@aggroso.com',
    password: 'admin123',
  });
  check('Admin login', adminLogin, r => r.data?.data?.accessToken);
  ADMIN_TOKEN = adminLogin.data?.data?.accessToken;
  if (!ADMIN_TOKEN) {
    console.log('❌ FATAL: No admin token — aborting');
    process.exit(1);
  }

  const bdLogin = await req('POST', '/auth/login', {
    email: 'bd@aggroso.com',
    password: 'password123',
  });
  check('BD Manager login', bdLogin, r => r.data?.data?.accessToken);
  BD_TOKEN = bdLogin.data?.data?.accessToken;

  const me = await req('GET', '/users/me', null, ADMIN_TOKEN);
  check('Get current user /me', me, r => r.data?.data?.role === 'ADMIN');
  ADMIN_USER_ID = me.data?.data?.id;
  info(`Admin user ID: ${ADMIN_USER_ID?.substring(0, 12)}...`);

  const users = await req('GET', '/users', null, ADMIN_TOKEN);
  check('List users (admin)', users, r => r.data?.success === true);
  info(`Users found: ${users.data?.data?.length || 0}`);

  // ═══════════════════════════════════════════
  // PHASE 1: LEADS MANAGEMENT
  // ═══════════════════════════════════════════
  section('PHASE 1: LEADS MANAGEMENT');

  const lead1 = await req('POST', '/leads', {
    companyName: 'TestCorp Solutions',
    contactName: 'Alice Test',
    contactEmail: `alice+${Date.now()}@testcorp.com`,
    website: 'https://testcorp.com',
    industry: 'SaaS',
    companySize: '50-200',
    location: 'San Francisco, USA',
    source: 'MANUAL',
  }, ADMIN_TOKEN);
  check('Create lead 1 (TestCorp)', lead1, r => r.status === 201);
  const LEAD_ID = lead1.data?.data?.id;
  info(`Lead 1 ID: ${LEAD_ID?.substring(0, 12)}...`);

  const lead2 = await req('POST', '/leads', {
    companyName: 'CloudScale AI',
    contactName: 'Bob Builder',
    contactEmail: `bob+${Date.now()}@cloudscale.ai`,
    website: 'https://cloudscale.ai',
    industry: 'AI/ML',
    companySize: '200-500',
    location: 'New York, USA',
    source: 'MANUAL',
  }, ADMIN_TOKEN);
  check('Create lead 2 (CloudScale)', lead2, r => r.status === 201);
  const LEAD2_ID = lead2.data?.data?.id;
  info(`Lead 2 ID: ${LEAD2_ID?.substring(0, 12)}...`);

  const lead3 = await req('POST', '/leads', {
    companyName: 'DataWave Analytics',
    contactName: 'Carlos Martinez',
    contactEmail: `carlos+${Date.now()}@datawave.io`,
    website: 'https://datawave.io',
    industry: 'Data Analytics',
    companySize: '10-50',
    location: 'Austin, TX',
    source: 'MANUAL',
  }, ADMIN_TOKEN);
  check('Create lead 3 (DataWave)', lead3, r => r.status === 201);
  const LEAD3_ID = lead3.data?.data?.id;
  info(`Lead 3 ID: ${LEAD3_ID?.substring(0, 12)}...`);

  // List & Get
  const leadsList = await req('GET', '/leads?page=1&limit=10', null, ADMIN_TOKEN);
  check('List leads', leadsList, r => r.data?.success === true);

  if (LEAD_ID) {
    const leadGet = await req('GET', `/leads/${LEAD_ID}`, null, ADMIN_TOKEN);
    check('Get lead by ID', leadGet, r => r.data?.data?.companyName === 'TestCorp Solutions');

    const leadUpdate = await req('PATCH', `/leads/${LEAD_ID}`, {
      industry: 'Enterprise SaaS',
      notes: 'Updated: promising SaaS lead for Q1 engagement',
    }, ADMIN_TOKEN);
    check('Update lead', leadUpdate, r => r.data?.success === true);
  }

  // REVIEW: PATCH /leads/:id/review { decision, notes? }
  if (LEAD_ID) {
    const r1 = await req('PATCH', `/leads/${LEAD_ID}/review`, {
      decision: 'APPROVED',
      notes: 'Strong SaaS company, approved for outreach',
    }, ADMIN_TOKEN);
    check('Approve lead 1', r1, r => r.data?.success === true);
  }

  if (LEAD2_ID) {
    const r2 = await req('PATCH', `/leads/${LEAD2_ID}/review`, {
      decision: 'APPROVED',
      notes: 'Enterprise AI client, high priority',
    }, ADMIN_TOKEN);
    check('Approve lead 2', r2, r => r.data?.success === true);
  }

  if (LEAD3_ID) {
    const r3 = await req('PATCH', `/leads/${LEAD3_ID}/review`, {
      decision: 'APPROVED',
      notes: 'Data analytics company with potential',
    }, ADMIN_TOKEN);
    check('Approve lead 3', r3, r => r.data?.success === true);
  }

  const reviewQueue = await req('GET', '/leads/review/queue', null, ADMIN_TOKEN);
  check('Get review queue', reviewQueue, r => r.data?.success === true);

  // ═══════════════════════════════════════════
  // PHASE 1: OUTREACH & PITCHES
  // ═══════════════════════════════════════════
  section('PHASE 1: OUTREACH & PITCHES');

  // POST /outreach/pitch — generatePitchSchema: { leadId, channel, tone?, additionalContext? }
  let PITCH_ID = null;
  if (LEAD_ID) {
    const pitch1 = await req('POST', '/outreach/pitch', {
      leadId: LEAD_ID,
      channel: 'EMAIL',
      tone: 'formal',
      additionalContext: 'Focus on their SaaS platform and partnership value',
    }, ADMIN_TOKEN);
    check('Generate pitch 1 (AI)', pitch1, r => r.status === 201);
    PITCH_ID = pitch1.data?.data?.id;
    info(`Pitch 1 ID: ${PITCH_ID?.substring(0, 12)}...`);
  }

  let PITCH2_ID = null;
  if (LEAD2_ID) {
    const pitch2 = await req('POST', '/outreach/pitch', {
      leadId: LEAD2_ID,
      channel: 'EMAIL',
      tone: 'concise',
      additionalContext: 'Highlight AI integration capabilities',
    }, ADMIN_TOKEN);
    check('Generate pitch 2 (AI)', pitch2, r => r.status === 201);
    PITCH2_ID = pitch2.data?.data?.id;
    info(`Pitch 2 ID: ${PITCH2_ID?.substring(0, 12)}...`);
  }

  // GET /outreach/pitch/:id
  if (PITCH_ID) {
    const pitchGet = await req('GET', `/outreach/pitch/${PITCH_ID}`, null, ADMIN_TOKEN);
    check('Get pitch by ID', pitchGet, r => r.data?.success === true);
  }

  // POST /outreach/pitch/:id/approve
  if (PITCH_ID) {
    const pitchApprove = await req('POST', `/outreach/pitch/${PITCH_ID}/approve`, null, ADMIN_TOKEN);
    check('Approve pitch', pitchApprove, r => r.data?.success === true);
  }

  // POST /outreach/pitch/:id/send — sendPitchSchema: { channel? }
  if (PITCH_ID) {
    const pitchSend = await req('POST', `/outreach/pitch/${PITCH_ID}/send`, { channel: 'EMAIL' }, ADMIN_TOKEN);
    check('Send pitch', pitchSend, r => r.status === 202 || r.data?.success === true);
  }

  // POST /outreach/followup — scheduleFollowupSchema: { leadId, steps: [{ channel, body, delayHours, subject? }] }
  let FOLLOWUP_ID = null;
  if (LEAD_ID) {
    const followup = await req('POST', '/outreach/followup', {
      leadId: LEAD_ID,
      steps: [
        {
          channel: 'EMAIL',
          subject: 'Following up on our partnership proposal',
          body: 'Hi Alice, I wanted to follow up on our earlier conversation about the partnership opportunity.',
          delayHours: 48,
        },
        {
          channel: 'EMAIL',
          subject: 'Quick check-in — TestCorp partnership',
          body: 'Hi Alice, Just checking in regarding our partnership proposal. Happy to answer any questions.',
          delayHours: 96,
        },
      ],
    }, ADMIN_TOKEN);
    check('Schedule follow-up sequence', followup, r => r.status === 201);
    FOLLOWUP_ID = followup.data?.data?.id;
    info(`Follow-up ID: ${FOLLOWUP_ID?.substring(0, 12)}...`);
  }

  if (FOLLOWUP_ID) {
    const followupGet = await req('GET', `/outreach/followup/${FOLLOWUP_ID}`, null, ADMIN_TOKEN);
    check('Get follow-up sequence', followupGet, r => r.data?.success === true);
  }

  // GET /outreach/analytics
  const analytics = await req('GET', '/outreach/analytics', null, ADMIN_TOKEN);
  check('Get outreach analytics', analytics, r => r.data?.success === true);

  // ═══════════════════════════════════════════
  // PHASE 1: PROPOSALS (AI generation)
  // ═══════════════════════════════════════════
  section('PHASE 1: PROPOSALS');

  // POST /proposals/generate — generateProposalSchema: { leadId, requirements?, budget?, timeline?, additionalContext? }
  let PROPOSAL_ID = null;
  if (LEAD3_ID) {
    const proposal = await req('POST', '/proposals/generate', {
      leadId: LEAD3_ID,
      requirements: 'Real-time data pipeline integration with existing systems',
      budget: '$50,000-75,000 annually',
      timeline: '3 months implementation',
      additionalContext: 'DataWave specializes in real-time data analytics',
    }, ADMIN_TOKEN);
    check('Generate proposal (AI)', proposal, r => r.data?.success === true);
    PROPOSAL_ID = proposal.data?.data?.id;
    info(`Proposal ID: ${PROPOSAL_ID?.substring(0, 12)}...`);
  }

  if (PROPOSAL_ID) {
    const proposalGet = await req('GET', `/proposals/${PROPOSAL_ID}`, null, ADMIN_TOKEN);
    check('Get proposal by ID', proposalGet, r => r.data?.success === true);

    const proposalApprove = await req('POST', `/proposals/${PROPOSAL_ID}/approve`, null, ADMIN_TOKEN);
    check('Approve proposal', proposalApprove, r => r.data?.success === true);
  }

  if (LEAD3_ID) {
    const proposalsByLead = await req('GET', `/proposals/lead/${LEAD3_ID}`, null, ADMIN_TOKEN);
    check('List proposals by lead', proposalsByLead, r => r.data?.success === true);
  }

  // ═══════════════════════════════════════════
  // PHASE 1: CLIENTS (direct creation)
  // ═══════════════════════════════════════════
  section('PHASE 1: CLIENTS');

  // POST /clients — createClientSchema: { leadId, companyName, primaryContactName, primaryContactEmail, ... }
  let CLIENT_ID = null;
  if (LEAD_ID) {
    const client1 = await req('POST', '/clients', {
      leadId: LEAD_ID,
      companyName: 'TestCorp Solutions',
      primaryContactName: 'Alice Test',
      primaryContactEmail: 'alice+client@testcorp.com',
      primaryContactPhone: '+1-555-0101',
      contractValue: 50000,
      contractStart: '2026-03-15T00:00:00.000Z',
      contractEnd: '2027-03-15T00:00:00.000Z',
    }, ADMIN_TOKEN);
    check('Create client 1 (TestCorp)', client1, r => r.status === 201);
    CLIENT_ID = client1.data?.data?.id;
    info(`Client 1 ID: ${CLIENT_ID?.substring(0, 12)}...`);
  }

  let CLIENT2_ID = null;
  if (LEAD2_ID) {
    const client2 = await req('POST', '/clients', {
      leadId: LEAD2_ID,
      companyName: 'CloudScale AI',
      primaryContactName: 'Bob Builder',
      primaryContactEmail: 'bob+client@cloudscale.ai',
      primaryContactPhone: '+1-555-0202',
      contractValue: 150000,
      contractStart: '2026-04-01T00:00:00.000Z',
      contractEnd: '2027-04-01T00:00:00.000Z',
    }, ADMIN_TOKEN);
    check('Create client 2 (CloudScale)', client2, r => r.status === 201);
    CLIENT2_ID = client2.data?.data?.id;
    info(`Client 2 ID: ${CLIENT2_ID?.substring(0, 12)}...`);
  }

  const clientsList = await req('GET', '/clients?page=1&limit=10', null, ADMIN_TOKEN);
  check('List clients', clientsList, r => r.data?.success === true);

  if (CLIENT_ID) {
    const clientGet = await req('GET', `/clients/${CLIENT_ID}`, null, ADMIN_TOKEN);
    check('Get client detail', clientGet, r => r.data?.success === true);

    const clientUpdate = await req('PATCH', `/clients/${CLIENT_ID}`, {
      contractValue: 65000,
    }, ADMIN_TOKEN);
    check('Update client contract', clientUpdate, r => r.data?.success === true);
  }

  // ═══════════════════════════════════════════
  // PHASE 1: DEALS (close deal for lead 3 → creates client + pipeline)
  // ═══════════════════════════════════════════
  section('PHASE 1: DEALS');

  // POST /deals/close — dealCloseSchema: { leadId, proposalId, dealValue/contractValue, accountManagerId/assignedManagerId }
  let CLIENT3_ID = null;
  if (LEAD3_ID && PROPOSAL_ID && ADMIN_USER_ID) {
    const dealClose = await req('POST', '/deals/close', {
      leadId: LEAD3_ID,
      proposalId: PROPOSAL_ID,
      contractValue: 75000,
      contractStart: '2026-05-01T00:00:00.000Z',
      contractEnd: '2027-05-01T00:00:00.000Z',
      assignedManagerId: ADMIN_USER_ID,
      notes: 'Deal closed after successful proposal presentation',
    }, ADMIN_TOKEN);
    check('Close deal (creates client + pipeline)', dealClose, r => r.data?.success === true);
    CLIENT3_ID = dealClose.data?.data?.client?.id || dealClose.data?.data?.id;
    info(`Client 3 (from deal) ID: ${CLIENT3_ID?.substring(0, 12)}...`);
  }

  // GET /deals/:id (deal summary by lead ID)
  if (LEAD3_ID) {
    const dealSummary = await req('GET', `/deals/${LEAD3_ID}`, null, ADMIN_TOKEN);
    check('Get deal summary', dealSummary, r => r.data?.success === true);
  }

  // ═══════════════════════════════════════════
  // PHASE 2: ONBOARDING PIPELINE
  // ═══════════════════════════════════════════
  section('PHASE 2: ONBOARDING PIPELINE');

  // GET /onboarding — list all pipelines
  const pipelineList = await req('GET', '/onboarding', null, ADMIN_TOKEN);
  check('List onboarding pipelines', pipelineList, r => r.data?.success === true);

  // GET /onboarding/stages — stage definitions
  const stages = await req('GET', '/onboarding/stages', null, ADMIN_TOKEN);
  check('Get stage definitions', stages, r => r.data?.success === true);

  if (CLIENT_ID) {
    // GET /onboarding/:clientId
    const onboardDetail = await req('GET', `/onboarding/${CLIENT_ID}`, null, ADMIN_TOKEN);
    check('Get client 1 onboarding detail', onboardDetail, r => r.data?.success === true);

    // POST /onboarding/:clientId/stage/advance — advanceStageSchema: { notes? }
    const advance1 = await req('POST', `/onboarding/${CLIENT_ID}/stage/advance`, {
      notes: 'Kickoff meeting scheduled with stakeholders',
    }, ADMIN_TOKEN);
    check('Advance to KICKOFF', advance1, r => r.data?.success === true);

    const advance2 = await req('POST', `/onboarding/${CLIENT_ID}/stage/advance`, {
      notes: 'Requirements gathering initiated',
    }, ADMIN_TOKEN);
    check('Advance to REQUIREMENTS_GATHERING', advance2, r => r.data?.success === true);

    // GET /onboarding/:clientId/checklist
    const checklist = await req('GET', `/onboarding/${CLIENT_ID}/checklist`, null, ADMIN_TOKEN);
    check('Get checklist items', checklist, r => r.data?.success === true);
    const checklistItems = checklist.data?.data || [];
    if (checklistItems.length > 0) {
      const firstItem = checklistItems[0];
      // PATCH /onboarding/:clientId/checklist/:itemId — { isCompleted: boolean }
      const toggle = await req('PATCH', `/onboarding/${CLIENT_ID}/checklist/${firstItem.id}`, {
        isCompleted: true,
      }, ADMIN_TOKEN);
      check('Toggle checklist item', toggle, r => r.data?.success === true);
    }

    // POST /clients/:clientId/requirements — createRequirementSchema: { title, body }
    const requirement = await req('POST', `/clients/${CLIENT_ID}/requirements`, {
      title: 'CRM Integration',
      body: 'Integration with existing CRM system required for data migration',
    }, ADMIN_TOKEN);
    check('Add requirement', requirement, r => r.data?.success === true);

    // GET /onboarding/:clientId/audit
    const audit = await req('GET', `/onboarding/${CLIENT_ID}/audit`, null, ADMIN_TOKEN);
    check('Get audit trail', audit, r => r.data?.success === true);
  }

  // GET /onboarding/sla/dashboard
  const sla = await req('GET', '/onboarding/sla/dashboard', null, ADMIN_TOKEN);
  check('SLA dashboard', sla, r => r.data?.success === true);

  if (CLIENT2_ID) {
    const advance = await req('POST', `/onboarding/${CLIENT2_ID}/stage/advance`, {
      notes: 'Fast-tracked kickoff for CloudScale',
    }, ADMIN_TOKEN);
    check('Advance client 2 to KICKOFF', advance, r => r.data?.success === true);
  }

  // ═══════════════════════════════════════════
  // PHASE 2: MEETINGS
  // ═══════════════════════════════════════════
  section('PHASE 2: MEETINGS');

  let MEETING_ID = null;
  if (CLIENT_ID) {
    const meeting1 = await req('POST', '/meetings', {
      clientId: CLIENT_ID,
      title: 'TestCorp Kickoff Meeting',
      type: 'KICKOFF',
      scheduledAt: '2026-03-20T10:00:00.000Z',
      duration: 60,
      attendees: ['alice@testcorp.com', 'admin@aggroso.com'],
      notes: 'Initial kickoff to align on project goals and timelines',
    }, ADMIN_TOKEN);
    check('Schedule meeting 1', meeting1, r => r.data?.success === true);
    MEETING_ID = meeting1.data?.data?.id;
    info(`Meeting 1 ID: ${MEETING_ID?.substring(0, 12)}...`);
  }

  if (CLIENT2_ID) {
    const meeting2 = await req('POST', '/meetings', {
      clientId: CLIENT2_ID,
      title: 'CloudScale Requirements Review',
      type: 'REVIEW',
      scheduledAt: '2026-03-22T14:00:00.000Z',
      duration: 45,
      attendees: ['bob@cloudscale.ai', 'admin@aggroso.com'],
    }, ADMIN_TOKEN);
    check('Schedule meeting 2', meeting2, r => r.data?.success === true);
  }

  const meetingsList = await req('GET', '/meetings?page=1&limit=10', null, ADMIN_TOKEN);
  check('List meetings', meetingsList, r => r.data?.success === true);

  // GET /meetings/upcoming
  const upcoming = await req('GET', '/meetings/upcoming', null, ADMIN_TOKEN);
  check('Get upcoming meetings', upcoming, r => r.data?.success === true);

  // POST /meetings/:meetingId/notes — meetingNoteSchema: { body }
  if (MEETING_ID) {
    const note = await req('POST', `/meetings/${MEETING_ID}/notes`, {
      body: 'Discussed project scope and timeline. Client is excited about the AI features.',
    }, ADMIN_TOKEN);
    check('Add meeting note', note, r => r.data?.success === true);

    const notes = await req('GET', `/meetings/${MEETING_ID}/notes`, null, ADMIN_TOKEN);
    check('Get meeting notes', notes, r => r.data?.success === true);
  }

  // ═══════════════════════════════════════════
  // PHASE 2: DOCUMENTS
  // ═══════════════════════════════════════════
  section('PHASE 2: DOCUMENTS');

  // GET /documents/:clientId
  if (CLIENT_ID) {
    const docsList = await req('GET', `/documents/${CLIENT_ID}`, null, ADMIN_TOKEN);
    check('List documents for client', docsList, r => r.data?.success === true);
  }

  // ═══════════════════════════════════════════
  // PHASE 3: NPS SURVEYS
  // ═══════════════════════════════════════════
  section('PHASE 3: NPS SURVEYS');

  if (CLIENT_ID) {
    const nps1 = await req('POST', '/nps/collect', {
      clientId: CLIENT_ID,
      score: 9,
      feedback: 'Great onboarding experience! The team was very responsive and the platform is intuitive.',
    }, ADMIN_TOKEN);
    check('Collect NPS (promoter, score=9)', nps1, r => r.data?.success === true);
  }

  if (CLIENT2_ID) {
    const nps2 = await req('POST', '/nps/collect', {
      clientId: CLIENT2_ID,
      score: 4,
      feedback: 'Setup took longer than expected. Need better documentation for enterprise features.',
    }, ADMIN_TOKEN);
    check('Collect NPS (detractor, score=4)', nps2, r => r.data?.success === true);
  }

  if (CLIENT_ID) {
    const npsClient = await req('GET', `/nps/${CLIENT_ID}`, null, ADMIN_TOKEN);
    check('Get NPS by client', npsClient, r => r.data?.success === true);
  }

  const npsDash = await req('GET', '/nps/dashboard', null, ADMIN_TOKEN);
  check('NPS dashboard', npsDash, r => r.data?.success === true);

  // ═══════════════════════════════════════════
  // PHASE 3: CUSTOMER SUCCESS
  // ═══════════════════════════════════════════
  section('PHASE 3: CUSTOMER SUCCESS');

  const successDash = await req('GET', '/success/dashboard', null, ADMIN_TOKEN);
  check('Success dashboard', successDash, r => r.data?.success === true);

  if (CLIENT_ID) {
    const clientHealth = await req('GET', `/success/${CLIENT_ID}/health`, null, ADMIN_TOKEN);
    check('Get client 1 health score', clientHealth, r => r.data?.success === true);

    const refresh = await req('POST', `/success/${CLIENT_ID}/health/refresh`, null, ADMIN_TOKEN);
    check('Refresh health score', refresh, r => r.data?.success === true);

    const upsell = await req('POST', `/success/${CLIENT_ID}/upsell`, {
      reason: 'Client showing strong engagement and NPS score of 9. Ready for premium tier.',
      estimatedValue: 30000,
    }, ADMIN_TOKEN);
    check('Flag upsell opportunity', upsell, r => r.data?.success === true);
  }

  if (CLIENT2_ID) {
    const health2 = await req('GET', `/success/${CLIENT2_ID}/health`, null, ADMIN_TOKEN);
    check('Get client 2 health', health2, r => r.data?.success === true);
  }

  // ═══════════════════════════════════════════
  section('SUMMARY');
  console.log('');
  const passed = TOTAL - FAILURES;
  console.log(`Total tests: ${TOTAL}`);
  console.log(`Passed: ${passed}`);
  if (FAILURES > 0) {
    console.log(`Failed: ${FAILURES}`);
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
