#!/usr/bin/env bash
# Stop Mission Control cleanly
MC_PORT=4000

echo "=== Mission Control — Stop ==="
echo ""

# Kill MC process on port 4000
MC_PIDS=$(lsof -ti:$MC_PORT 2>/dev/null)
if [ -n "$MC_PIDS" ]; then
  echo "Stopping Mission Control (PIDs: $MC_PIDS)..."
  echo "$MC_PIDS" | xargs kill 2>/dev/null
  sleep 1
  # Force kill if still running
  REMAINING=$(lsof -ti:$MC_PORT 2>/dev/null)
  if [ -n "$REMAINING" ]; then
    echo "Force killing remaining processes..."
    echo "$REMAINING" | xargs kill -9 2>/dev/null
  fi
  echo "Mission Control stopped."
else
  echo "Mission Control not running on port $MC_PORT."
fi

echo ""
echo "Note: OpenClaw Gateway is NOT stopped (shared resource)."
echo "  To stop Gateway: openclaw gateway stop"
echo ""
echo "=== Done ==="
