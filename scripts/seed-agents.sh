#!/usr/bin/env bash
# Seed 6 Tharsos agents into Mission Control
# Usage: ./scripts/seed-agents.sh [MC_URL] [MC_API_TOKEN]

MC_URL="${1:-http://localhost:4000}"
TOKEN="${2:-$MC_API_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "Error: MC_API_TOKEN not set. Pass as second arg or export MC_API_TOKEN."
  exit 1
fi

create_agent() {
  local name="$1" role="$2" model="$3" emoji="$4" is_master="$5" desc="$6"

  resp=$(curl -s -w '\n%{http_code}' -X POST "$MC_URL/api/agents" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"$name\",
      \"role\": \"$role\",
      \"model\": \"$model\",
      \"avatar_emoji\": \"$emoji\",
      \"is_master\": $is_master,
      \"description\": \"$desc\",
      \"workspace_id\": \"default\"
    }")

  status=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -1)

  if [ "$status" = "201" ]; then
    echo "  [OK] $name created"
  else
    echo "  [FAIL] $name — HTTP $status: $body"
  fi
}

echo "Seeding 6 agents to $MC_URL..."
echo ""

create_agent "Victor"    "Dispatcher & Strategy"       "claude-opus-4-5"   "🎖️" true  "Chief of Staff. Strategic direction, dispatch, approvals."
create_agent "Radu"      "Senior Developer"            "claude-sonnet-4-6" "🔨" false "Code, APIs, deployment, AI Gateway."
create_agent "Alexandra" "Communications & Research"   "claude-sonnet-4-6" "📡" false "Research, sales, proposals, copy, content."
create_agent "Anabelle"  "Lead Design"                 "claude-sonnet-4-6" "🎨" false "Design, UI/UX, branding, creatives."
create_agent "Mihai"     "QA & Operations"             "claude-sonnet-4-6" "🛡️" false "QA, ops, monitoring, finance, AI Employees."
create_agent "Apex"      "Exceptional Tasks (dormant)" "claude-opus-4-6"   "👁️" false "Dormant. Basel activates for exceptional tasks only."

echo ""
echo "Done. Verify: curl -H 'Authorization: Bearer \$MC_API_TOKEN' $MC_URL/api/agents"
