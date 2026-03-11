#!/bin/bash
# ==============================================
# BD Pipeline — Full API Flow Test Script
# Tests Phase 1 → 2 → 3 end-to-end
# ==============================================

set -e

BASE="http://localhost:3001/api/v1"
CT="Content-Type: application/json"
# Force HTTP/1.1 (curl 8.x defaults to HTTP/2 which Express doesn't support)
CURL="curl -s --http1.1 --max-time 15"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

pass() { echo -e "${GREEN}✅ $1${NC}"; }
fail() { echo -e "${RED}❌ $1${NC}"; FAILURES=$((FAILURES+1)); }
section() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }
info() { echo -e "${YELLOW}  → $1${NC}"; }

FAILURES=0
TOTAL=0

# Clear rate limits before testing
docker exec bd-redis redis-cli FLUSHDB > /dev/null 2>&1 || true

check() {
  TOTAL=$((TOTAL+1))
  local desc="$1"
  local response="$2"
  local expected="$3"
  
  if echo "$response" | grep -q "$expected"; then
    pass "$desc"
  else
    fail "$desc"
    echo "  Response: $(echo "$response" | head -c 200)"
  fi
}

# ══════════════════════════════════════════════
section "PHASE 0: HEALTH CHECK"
# ══════════════════════════════════════════════

HEALTH=$($CURL $BASE/health)
check "Health endpoint" "$HEALTH" '"status":"ok"'

# ══════════════════════════════════════════════
section "PHASE 1: AUTHENTICATION"
# ══════════════════════════════════════════════

# Login as admin
ADMIN_RESP=$($CURL -X POST $BASE/auth/login -H "$CT" \
  -d '{"email":"admin@aggroso.com","password":"admin123"}')
check "Admin login" "$ADMIN_RESP" '"accessToken"'
ADMIN_TOKEN=$(echo $ADMIN_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || echo "")

if [ -z "$ADMIN_TOKEN" ]; then
  fail "Could not extract admin token — aborting"
  exit 1
fi
AUTH="Authorization: Bearer $ADMIN_TOKEN"

# Login as BD Manager
BD_RESP=$($CURL -X POST $BASE/auth/login -H "$CT" \
  -d '{"email":"bd@aggroso.com","password":"password123"}')
check "BD Manager login" "$BD_RESP" '"accessToken"'
BD_TOKEN=$(echo $BD_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || echo "")

# Get current user
ME_RESP=$($CURL $BASE/users/me -H "$AUTH")
check "Get current user /me" "$ME_RESP" '"role":"ADMIN"'

# List users (admin only)
USERS_RESP=$($CURL $BASE/users -H "$AUTH")
check "List users (admin)" "$USERS_RESP" '"success":true'

# ══════════════════════════════════════════════
section "PHASE 1: LEADS MANAGEMENT"
# ══════════════════════════════════════════════

# Create lead
LEAD_RESP=$($CURL -X POST $BASE/leads -H "$CT" -H "$AUTH" \
  -d '{
    "companyName": "TestCorp Solutions",
    "contactName": "Alice Test",
    "contactEmail": "alice@testcorp.com",
    "website": "https://testcorp.com",
    "industry": "SaaS",
    "companySize": "50-200",
    "location": "San Francisco, USA",
    "source": "MANUAL"
  }')
check "Create lead" "$LEAD_RESP" '"companyName":"TestCorp Solutions"'
LEAD_ID=$(echo $LEAD_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
info "Lead ID: ${LEAD_ID:0:20}..."

# Create second lead
LEAD2_RESP=$($CURL -X POST $BASE/leads -H "$CT" -H "$AUTH" \
  -d '{
    "companyName": "CloudScale AI",  
    "contactName": "Bob Builder",
    "contactEmail": "bob@cloudscale.ai",
    "website": "https://cloudscale.ai",
    "industry": "AI/ML",
    "companySize": "200-500",
    "location": "New York, USA",
    "source": "MANUAL",
    "notes": "High potential enterprise client"
  }')
check "Create second lead" "$LEAD2_RESP" '"companyName":"CloudScale AI"'
LEAD2_ID=$(echo $LEAD2_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")

# List leads
LEADS_LIST=$($CURL "$BASE/leads?page=1&limit=10" -H "$AUTH")
check "List leads" "$LEADS_LIST" '"success":true'

# Get single lead
LEAD_GET=$($CURL $BASE/leads/$LEAD_ID -H "$AUTH")
check "Get lead by ID" "$LEAD_GET" '"companyName":"TestCorp Solutions"'

# Update lead
LEAD_UPDATE=$($CURL -X PATCH $BASE/leads/$LEAD_ID -H "$CT" -H "$AUTH" \
  -d '{"notes": "Updated: promising SaaS lead for Q1 engagement", "industry": "Enterprise SaaS"}')
check "Update lead" "$LEAD_UPDATE" '"notes":"Updated: promising SaaS lead'

# Search leads
LEAD_SEARCH=$($CURL "$BASE/leads/search?q=TestCorp" -H "$AUTH")
check "Search leads" "$LEAD_SEARCH" '"success":true'

# Review lead (approve)
LEAD_REVIEW=$($CURL -X POST $BASE/leads/$LEAD_ID/review -H "$CT" -H "$AUTH" \
  -d '{"status": "APPROVED"}')
check "Approve lead" "$LEAD_REVIEW" '"status":"APPROVED"'

# Review second lead
LEAD2_REVIEW=$($CURL -X POST $BASE/leads/$LEAD2_ID/review -H "$CT" -H "$AUTH" \
  -d '{"status": "APPROVED"}')
check "Approve second lead" "$LEAD2_REVIEW" '"status":"APPROVED"'

# ══════════════════════════════════════════════
section "PHASE 1: OUTREACH & PITCHES"
# ══════════════════════════════════════════════

# Create outreach pitch for lead 1
PITCH_RESP=$($CURL -X POST $BASE/outreach/pitches -H "$CT" -H "$AUTH" \
  -d "{
    \"leadId\": \"$LEAD_ID\",
    \"channel\": \"EMAIL\",
    \"subject\": \"Partnership Opportunity — Aggroso x TestCorp\",
    \"content\": \"Hi Alice,\\n\\nI wanted to reach out about an exciting partnership opportunity between Aggroso and TestCorp Solutions. Our platform can help streamline your business development pipeline significantly.\\n\\nWould you be available for a quick 15-minute call this week?\\n\\nBest regards,\\nBD Team\"
  }")
check "Create pitch" "$PITCH_RESP" '"subject":"Partnership Opportunity'
PITCH_ID=$(echo $PITCH_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
info "Pitch ID: ${PITCH_ID:0:20}..."

# Create second pitch
PITCH2_RESP=$($CURL -X POST $BASE/outreach/pitches -H "$CT" -H "$AUTH" \
  -d "{
    \"leadId\": \"$LEAD2_ID\",
    \"channel\": \"EMAIL\",
    \"subject\": \"Enterprise AI Partnership — CloudScale\",
    \"content\": \"Dear Bob,\\n\\nCloudScale AI's impressive growth caught our attention. We'd love to explore how Aggroso's BD pipeline can support your expansion.\\n\\nBest,\\nBD Team\"
  }")
check "Create second pitch" "$PITCH2_RESP" '"subject":"Enterprise AI Partnership'
PITCH2_ID=$(echo $PITCH2_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")

# List pitches
PITCHES_LIST=$($CURL "$BASE/outreach/pitches?page=1&limit=10" -H "$AUTH")
check "List pitches" "$PITCHES_LIST" '"success":true'

# Approve pitch
PITCH_APPROVE=$($CURL -X POST $BASE/outreach/pitches/$PITCH_ID/approve -H "$AUTH")
check "Approve pitch" "$PITCH_APPROVE" '"success":true'

# Send pitch
PITCH_SEND=$($CURL -X POST $BASE/outreach/pitches/$PITCH_ID/send -H "$AUTH")
check "Send pitch" "$PITCH_SEND" '"success":true'

# List followups
FOLLOWUP_LIST=$($CURL "$BASE/outreach/followups?page=1&limit=10" -H "$AUTH")
check "List followups" "$FOLLOWUP_LIST" '"success":true'

# ══════════════════════════════════════════════
section "PHASE 1: CLIENTS"
# ══════════════════════════════════════════════

# Convert lead to client
CLIENT_RESP=$($CURL -X POST $BASE/clients -H "$CT" -H "$AUTH" \
  -d "{
    \"leadId\": \"$LEAD_ID\",
    \"contractValue\": 50000,
    \"contractStart\": \"2026-03-15T00:00:00.000Z\",
    \"contractEnd\": \"2027-03-15T00:00:00.000Z\"
  }")
check "Convert lead to client" "$CLIENT_RESP" '"success":true'
CLIENT_ID=$(echo $CLIENT_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
info "Client ID: ${CLIENT_ID:0:20}..."

# Convert second lead to client
CLIENT2_RESP=$($CURL -X POST $BASE/clients -H "$CT" -H "$AUTH" \
  -d "{
    \"leadId\": \"$LEAD2_ID\",
    \"contractValue\": 150000,
    \"contractStart\": \"2026-04-01T00:00:00.000Z\",
    \"contractEnd\": \"2027-04-01T00:00:00.000Z\"
  }")
check "Convert second lead to client" "$CLIENT2_RESP" '"success":true'
CLIENT2_ID=$(echo $CLIENT2_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")

# List clients
CLIENTS_LIST=$($CURL "$BASE/clients?page=1&limit=10" -H "$AUTH")
check "List clients" "$CLIENTS_LIST" '"success":true'

# Get client detail
CLIENT_GET=$($CURL $BASE/clients/$CLIENT_ID -H "$AUTH")
check "Get client detail" "$CLIENT_GET" '"success":true'

# Update client
CLIENT_UPDATE=$($CURL -X PATCH $BASE/clients/$CLIENT_ID -H "$CT" -H "$AUTH" \
  -d '{"contractValue": 65000, "notes": "Upgraded contract after upsell discussion"}')
check "Update client" "$CLIENT_UPDATE" '"success":true'

# ══════════════════════════════════════════════
section "PHASE 1: DEALS"
# ══════════════════════════════════════════════

# Create deal
DEAL_RESP=$($CURL -X POST $BASE/deals -H "$CT" -H "$AUTH" \
  -d "{
    \"leadId\": \"$LEAD_ID\",
    \"title\": \"TestCorp - Enterprise Platform License\",
    \"value\": 65000,
    \"stage\": \"PROPOSAL\",
    \"expectedCloseDate\": \"2026-04-15T00:00:00.000Z\",
    \"notes\": \"Strong interest shown in partnership call\"
  }")
check "Create deal" "$DEAL_RESP" '"title":"TestCorp - Enterprise Platform License"'
DEAL_ID=$(echo $DEAL_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
info "Deal ID: ${DEAL_ID:0:20}..."

# List deals
DEALS_LIST=$($CURL "$BASE/deals?page=1&limit=10" -H "$AUTH")
check "List deals" "$DEALS_LIST" '"success":true'

# Get single deal
DEAL_GET=$($CURL $BASE/deals/$DEAL_ID -H "$AUTH")
check "Get deal by ID" "$DEAL_GET" '"title":"TestCorp'

# Update deal stage
DEAL_UPDATE=$($CURL -X PATCH $BASE/deals/$DEAL_ID -H "$CT" -H "$AUTH" \
  -d '{"stage": "NEGOTIATION", "notes": "Final pricing negotiation in progress"}')
check "Update deal stage" "$DEAL_UPDATE" '"stage":"NEGOTIATION"'

# ══════════════════════════════════════════════
section "PHASE 1: PROPOSALS"
# ══════════════════════════════════════════════

# Create proposal
PROPOSAL_RESP=$($CURL -X POST $BASE/proposals -H "$CT" -H "$AUTH" \
  -d "{
    \"leadId\": \"$LEAD_ID\",
    \"title\": \"TestCorp — Enterprise BD Partnership Proposal\",
    \"content\": \"## Executive Summary\\n\\nThis proposal outlines the partnership between Aggroso and TestCorp Solutions for comprehensive BD pipeline management.\\n\\n## Scope\\n\\n- Lead discovery and scoring\\n- Automated outreach campaigns\\n- Client onboarding automation\\n- Customer success monitoring\\n\\n## Investment\\n\\n- Annual license: USD 65,000\\n- Includes: Full platform access, dedicated support\\n\\n## Timeline\\n\\nImplementation: 4-6 weeks from contract signing\"
  }")
check "Create proposal" "$PROPOSAL_RESP" '"title":"TestCorp'
PROPOSAL_ID=$(echo $PROPOSAL_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
info "Proposal ID: ${PROPOSAL_ID:0:20}..."

# List proposals
PROPOSALS_LIST=$($CURL "$BASE/proposals?page=1&limit=10" -H "$AUTH")
check "List proposals" "$PROPOSALS_LIST" '"success":true'

# ══════════════════════════════════════════════
section "PHASE 2: ONBOARDING PIPELINE"  
# ══════════════════════════════════════════════

# Get onboarding pipeline (all clients)
PIPELINE=$($CURL "$BASE/onboarding/pipeline" -H "$AUTH")
check "Get onboarding pipeline" "$PIPELINE" '"success":true'

# Get client onboarding detail
ONBOARD_DETAIL=$($CURL "$BASE/onboarding/$CLIENT_ID" -H "$AUTH")
check "Get client onboarding detail" "$ONBOARD_DETAIL" '"success":true'

# Advance onboarding stage
ADVANCE=$($CURL -X POST "$BASE/onboarding/$CLIENT_ID/advance" -H "$CT" -H "$AUTH" \
  -d '{"notes": "Kickoff meeting scheduled with stakeholders"}')
check "Advance onboarding stage" "$ADVANCE" '"success":true'

# Advance again to REQUIREMENTS_GATHERING
ADVANCE2=$($CURL -X POST "$BASE/onboarding/$CLIENT_ID/advance" -H "$CT" -H "$AUTH" \
  -d '{"notes": "Requirements gathering initiated"}')
check "Advance to requirements gathering" "$ADVANCE2" '"success":true'

# Add checklist item
CHECKLIST=$($CURL -X POST "$BASE/onboarding/$CLIENT_ID/checklist" -H "$CT" -H "$AUTH" \
  -d '{"label": "Collect stakeholder contact details", "stage": "REQUIREMENTS_GATHERING"}')
check "Add checklist item" "$CHECKLIST" '"success":true'
CHECKLIST_ID=$(echo $CHECKLIST | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")

# Toggle checklist item
if [ -n "$CHECKLIST_ID" ]; then
  TOGGLE=$($CURL -X PATCH "$BASE/onboarding/$CLIENT_ID/checklist/$CHECKLIST_ID" -H "$CT" -H "$AUTH" \
    -d '{"checked": true}')
  check "Toggle checklist item" "$TOGGLE" '"success":true'
fi

# Add requirement
REQUIREMENT=$($CURL -X POST "$BASE/onboarding/$CLIENT_ID/requirements" -H "$CT" -H "$AUTH" \
  -d '{"description": "Integration with existing CRM system", "priority": "HIGH"}')
check "Add requirement" "$REQUIREMENT" '"success":true'

# Get SLA dashboard
SLA=$($CURL "$BASE/onboarding/sla/dashboard" -H "$AUTH")
check "SLA dashboard" "$SLA" '"success":true'

# Advance client 2 onboarding
ADVANCE_C2=$($CURL -X POST "$BASE/onboarding/$CLIENT2_ID/advance" -H "$CT" -H "$AUTH" \
  -d '{"notes": "Fast-tracked kickoff for CloudScale"}')
check "Advance client 2 onboarding" "$ADVANCE_C2" '"success":true'

# ══════════════════════════════════════════════
section "PHASE 2: MEETINGS"
# ══════════════════════════════════════════════

# Schedule meeting
MEETING_RESP=$($CURL -X POST "$BASE/meetings" -H "$CT" -H "$AUTH" \
  -d "{
    \"clientId\": \"$CLIENT_ID\",
    \"title\": \"TestCorp Kickoff Meeting\",
    \"type\": \"KICKOFF\",
    \"scheduledAt\": \"2026-03-20T10:00:00.000Z\",
    \"duration\": 60,
    \"attendees\": [\"alice@testcorp.com\", \"admin@aggroso.com\"],
    \"notes\": \"Initial kickoff to align on project goals and timelines\"
  }")
check "Schedule meeting" "$MEETING_RESP" '"success":true'
MEETING_ID=$(echo $MEETING_RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])" 2>/dev/null || echo "")
info "Meeting ID: ${MEETING_ID:0:20}..."

# Schedule second meeting  
MEETING2_RESP=$($CURL -X POST "$BASE/meetings" -H "$CT" -H "$AUTH" \
  -d "{
    \"clientId\": \"$CLIENT2_ID\",
    \"title\": \"CloudScale Requirements Review\",
    \"type\": \"REVIEW\",
    \"scheduledAt\": \"2026-03-22T14:00:00.000Z\",
    \"duration\": 45,
    \"attendees\": [\"bob@cloudscale.ai\", \"admin@aggroso.com\"]
  }")
check "Schedule second meeting" "$MEETING2_RESP" '"success":true'

# List meetings
MEETINGS_LIST=$($CURL "$BASE/meetings?page=1&limit=10" -H "$AUTH")
check "List meetings" "$MEETINGS_LIST" '"success":true'

# Get upcoming meetings
UPCOMING=$($CURL "$BASE/meetings/upcoming" -H "$AUTH")
check "Get upcoming meetings" "$UPCOMING" '"success":true'

# Add meeting note
if [ -n "$MEETING_ID" ]; then
  NOTE=$($CURL -X POST "$BASE/meetings/$MEETING_ID/notes" -H "$CT" -H "$AUTH" \
    -d '{"content": "Discussed project scope and timeline. Client is excited about the AI features."}')
  check "Add meeting note" "$NOTE" '"success":true'
fi

# ══════════════════════════════════════════════
section "PHASE 3: NPS SURVEYS"
# ══════════════════════════════════════════════

# Collect NPS response for client 1
NPS_RESP=$($CURL -X POST "$BASE/nps/collect" -H "$CT" -H "$AUTH" \
  -d "{
    \"clientId\": \"$CLIENT_ID\",
    \"score\": 9,
    \"feedback\": \"Great onboarding experience! The team was very responsive and the platform is intuitive.\"
  }")
check "Collect NPS response (promoter)" "$NPS_RESP" '"success":true'

# Collect NPS for client 2 (detractor to test alerts)
NPS2_RESP=$($CURL -X POST "$BASE/nps/collect" -H "$CT" -H "$AUTH" \
  -d "{
    \"clientId\": \"$CLIENT2_ID\",
    \"score\": 4,
    \"feedback\": \"Setup took longer than expected. Need better documentation for enterprise features.\"
  }")
check "Collect NPS response (detractor)" "$NPS2_RESP" '"success":true'

# Get NPS by client
NPS_CLIENT=$($CURL "$BASE/nps/$CLIENT_ID" -H "$AUTH")
check "Get NPS by client" "$NPS_CLIENT" '"success":true'

# Get NPS dashboard  
NPS_DASH=$($CURL "$BASE/nps/dashboard" -H "$AUTH")
check "NPS dashboard" "$NPS_DASH" '"success":true'

# ══════════════════════════════════════════════
section "PHASE 3: CUSTOMER SUCCESS"
# ══════════════════════════════════════════════

# Get success dashboard
SUCCESS_DASH=$($CURL "$BASE/success/dashboard" -H "$AUTH")
check "Success dashboard" "$SUCCESS_DASH" '"success":true'

# Get client health
CLIENT_HEALTH=$($CURL "$BASE/success/$CLIENT_ID/health" -H "$AUTH")
check "Get client health score" "$CLIENT_HEALTH" '"success":true'

# Refresh health score
REFRESH=$($CURL -X POST "$BASE/success/$CLIENT_ID/health/refresh" -H "$AUTH")
check "Refresh health score" "$REFRESH" '"success":true'

# Get client 2 health
CLIENT2_HEALTH=$($CURL "$BASE/success/$CLIENT2_ID/health" -H "$AUTH")
check "Get client 2 health" "$CLIENT2_HEALTH" '"success":true'

# Flag upsell opportunity
UPSELL=$($CURL -X POST "$BASE/success/$CLIENT_ID/upsell" -H "$CT" -H "$AUTH" \
  -d '{"reason": "Client showing strong engagement and NPS score of 9. Ready for premium tier upgrade.", "estimatedValue": 30000}')
check "Flag upsell opportunity" "$UPSELL" '"success":true'

# ══════════════════════════════════════════════
section "SUMMARY"
# ══════════════════════════════════════════════

echo ""
PASSED=$((TOTAL - FAILURES))
echo -e "${CYAN}Total tests: $TOTAL${NC}"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILURES -gt 0 ]; then
  echo -e "${RED}Failed: $FAILURES${NC}"
  exit 1
else
  echo -e "${GREEN}🎉 All tests passed!${NC}"
fi
