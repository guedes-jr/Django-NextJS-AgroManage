#!/usr/bin/env bash
# =============================================================================
# AgroManage — stop.sh
# Stops all dev processes by port.
# =============================================================================
set -euo pipefail

RESET='\033[0m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'

stop_port() {
  local port="$1"
  local name="$2"
  local pid
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null && echo -e "${GREEN}[STOP]${RESET} $name (port $port) stopped."
  else
    echo -e "${YELLOW}[STOP]${RESET} $name (port $port) was not running."
  fi
}

echo "[STOP] Stopping AgroManage services..."
stop_port 8000 "Django backend"
stop_port 3000 "Next.js frontend"
stop_port 5678 "debugpy"
stop_port 9229 "Node inspector"
echo "[STOP] ✅ Done."
