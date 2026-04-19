#!/usr/bin/env bash
# =============================================================================
# AgroManage — debug.sh
# Debug mode: Django with debugpy (VS Code / PyCharm) + Next.js with
# Node inspector for Chrome DevTools. Unified colored output.
# Usage: ./scripts/debug.sh  OR  make debug
# =============================================================================
set -euo pipefail

# Ensure common paths are in PATH (for node/npm/psql on Mac)
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

RESET='\033[0m'; BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'

BACKEND_PREFIX="${GREEN}${BOLD}[BACKEND 🐍]${RESET}"
FRONTEND_PREFIX="${CYAN}${BOLD}[FRONTEND ⚡]${RESET}"
SYSTEM_PREFIX="${YELLOW}${BOLD}[DEBUG]   ${RESET}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

BACKEND_PID=""; FRONTEND_PID=""

cleanup() {
  echo -e "\n${SYSTEM_PREFIX} Stopping debug session..."
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

stream_with_prefix() {
  local prefix="$1"; shift
  "$@" 2>&1 | while IFS= read -r line; do echo -e "${prefix} ${line}"; done
}

# ─── Backend: debugpy on port 5678 ────────────────────────────────────────────
start_backend_debug() {
  echo -e "${BACKEND_PREFIX} Starting Django with debugpy on port 5678..."
  echo -e "${BACKEND_PREFIX} Attach your debugger → localhost:5678"
  source "$BACKEND_DIR/.venv/bin/activate"
  cd "$BACKEND_DIR"
  # Install debugpy if not present
  pip show debugpy >/dev/null 2>&1 || pip install debugpy --quiet
  stream_with_prefix "$BACKEND_PREFIX" \
    python -m debugpy --listen 0.0.0.0:5678 --wait-for-client \
    manage.py runserver --noreload 2>&1 &
  BACKEND_PID=$!
}

# ─── Frontend: Node inspector on port 9229 ────────────────────────────────────
start_frontend_debug() {
  echo -e "${FRONTEND_PREFIX} Starting Next.js with Node inspector on port 9229..."
  echo -e "${FRONTEND_PREFIX} Open Chrome → chrome://inspect (localhost:9229)"
  cd "$FRONTEND_DIR"
  stream_with_prefix "$FRONTEND_PREFIX" \
    env NODE_OPTIONS='--inspect=0.0.0.0:9229' npm run dev 2>&1 &
  FRONTEND_PID=$!
}

echo -e "\n${SYSTEM_PREFIX} ${BOLD}AgroManage Debug Session${RESET}"
echo -e "${SYSTEM_PREFIX} Backend debugpy → localhost:5678"
echo -e "${SYSTEM_PREFIX} Frontend inspector → localhost:9229"
echo -e "${SYSTEM_PREFIX} Press Ctrl+C to stop.\n"

start_backend_debug
sleep 2
start_frontend_debug

echo -e "\n${SYSTEM_PREFIX} Debug servers running. Waiting for your debugger...\n"
wait
