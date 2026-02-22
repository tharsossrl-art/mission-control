#!/usr/bin/env bash
# Start Mission Control + verify Gateway + seed agents if needed
set -e

MC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
MC_PORT=4000
GW_PORT=18789
TOKEN="${MC_API_TOKEN:-33d8142f758c62e058ba0d5736cd495089900804329a6dbe467d44905786c831}"

echo "=== Mission Control — Start All ==="
echo ""

# 1. Check if Gateway is running
echo "[1/5] Checking OpenClaw Gateway on port $GW_PORT..."
if lsof -ti:$GW_PORT >/dev/null 2>&1; then
  echo "  Gateway: RUNNING (port $GW_PORT)"
else
  echo "  Gateway: NOT RUNNING"
  echo "  Starting Gateway..."
  if command -v openclaw &>/dev/null; then
    openclaw gateway start &
    sleep 3
    if lsof -ti:$GW_PORT >/dev/null 2>&1; then
      echo "  Gateway: STARTED"
    else
      echo "  WARNING: Gateway failed to start. MC will run without live agent connection."
    fi
  else
    echo "  WARNING: 'openclaw' not found. Start Gateway manually: openclaw gateway start"
  fi
fi

# 2. Start Mission Control
echo ""
echo "[2/5] Starting Mission Control on port $MC_PORT..."
if lsof -ti:$MC_PORT >/dev/null 2>&1; then
  echo "  MC already running on port $MC_PORT"
else
  cd "$MC_DIR"
  npm run dev > /tmp/mission-control.log 2>&1 &
  MC_PID=$!
  echo "  MC started (PID: $MC_PID, log: /tmp/mission-control.log)"

  # Wait for it to be ready
  echo "  Waiting for MC to be ready..."
  for i in $(seq 1 15); do
    if curl -s -o /dev/null -w '' http://localhost:$MC_PORT 2>/dev/null; then
      echo "  MC: READY"
      break
    fi
    sleep 1
    if [ "$i" = "15" ]; then
      echo "  WARNING: MC not responding after 15s. Check /tmp/mission-control.log"
    fi
  done
fi

# 3. Check agent count, seed if needed
echo ""
echo "[3/5] Checking agents..."
AGENT_COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:$MC_PORT/api/agents 2>/dev/null | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

if [ "$AGENT_COUNT" -lt 5 ] 2>/dev/null; then
  echo "  Found $AGENT_COUNT agents — seeding..."
  bash "$MC_DIR/scripts/seed-agents.sh" "http://localhost:$MC_PORT" "$TOKEN"
else
  echo "  Found $AGENT_COUNT agents — OK"
fi

# 4. Health checks
echo ""
echo "[4/5] Running health checks..."

# Gateway
if curl -s -o /dev/null -w '' http://localhost:$GW_PORT 2>/dev/null || lsof -ti:$GW_PORT >/dev/null 2>&1; then
  echo "  Gateway:  OK (port $GW_PORT)"
else
  echo "  Gateway:  DOWN"
fi

# MC
if curl -s -o /dev/null -w '' http://localhost:$MC_PORT 2>/dev/null; then
  echo "  MC:       OK (port $MC_PORT)"
else
  echo "  MC:       DOWN"
fi

# Bridge
BRIDGE_STATUS=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:$MC_PORT/api/bridge/health 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "unknown")
echo "  Bridge:   $BRIDGE_STATUS"

# 5. Print URLs
echo ""
echo "[5/5] URLs:"
echo "  Mission Control:  http://localhost:$MC_PORT"
echo "  Agents API:       http://localhost:$MC_PORT/api/agents"
echo "  Tasks API:        http://localhost:$MC_PORT/api/tasks"
echo "  Bridge Health:    http://localhost:$MC_PORT/api/bridge/health"
echo "  SSE Stream:       http://localhost:$MC_PORT/api/events/stream?token=$TOKEN"
echo ""
echo "=== All systems started ==="
