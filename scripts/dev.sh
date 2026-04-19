#!/usr/bin/env bash
# =============================================================================
# AgroManage — dev.sh
# Starts Django backend + Next.js frontend in the SAME terminal with
# color-coded, prefixed log output.
# Usage: ./scripts/dev.sh  OR  make dev
# =============================================================================
set -euo pipefail

# Ensure common paths are in PATH (for node/npm/psql on Mac)
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# ─── Colors ──────────────────────────────────────────────────────────────────
RESET='\033[0m'
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'

BACKEND_PREFIX="${GREEN}${BOLD}[BACKEND]${RESET}"
FRONTEND_PREFIX="${CYAN}${BOLD}[FRONTEND]${RESET}"
SYSTEM_PREFIX="${YELLOW}${BOLD}[SYSTEM] ${RESET}"

# ─── Resolve project root ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# ─── PIDs registry ────────────────────────────────────────────────────────────
BACKEND_PID=""
FRONTEND_PID=""

# ─── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${SYSTEM_PREFIX} Shutting down services..."
  [[ -n "$BACKEND_PID" ]]  && kill "$BACKEND_PID"  2>/dev/null && echo -e "${BACKEND_PREFIX}  Stopped."
  [[ -n "$FRONTEND_PID" ]] && kill "$FRONTEND_PID" 2>/dev/null && echo -e "${FRONTEND_PREFIX} Stopped."
  echo -e "${SYSTEM_PREFIX} Goodbye!\n"
  exit 0
}
trap cleanup SIGINT SIGTERM

# ─── Check dependencies ───────────────────────────────────────────────────────
check_deps() {
  echo -e "${SYSTEM_PREFIX} Checking dependencies..."

  if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo -e "${RED}[ERROR] Backend venv not found. Run: make setup${RESET}"
    exit 1
  fi

  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${RED}[ERROR] Frontend node_modules not found. Run: make setup${RESET}"
    exit 1
  fi

  if [ ! -f "$BACKEND_DIR/.env" ]; then
    echo -e "${YELLOW}[WARN] backend/.env not found — copying from .env.example${RESET}"
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  fi

  if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    echo -e "${YELLOW}[WARN] frontend/.env.local not found — copying from .env.example${RESET}"
    cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env.local"
  fi
}

# ─── Stream a command with a colored prefix ───────────────────────────────────
stream_with_prefix() {
  local prefix="$1"
  shift
  "$@" 2>&1 | while IFS= read -r line; do
    echo -e "${prefix} ${line}"
  done
}

# ─── Start backend ────────────────────────────────────────────────────────────
start_backend() {
  echo -e "${BACKEND_PREFIX} Starting Django dev server on http://localhost:8000 ..."
  source "$BACKEND_DIR/.venv/bin/activate"
  cd "$BACKEND_DIR"
  stream_with_prefix "$BACKEND_PREFIX" python manage.py runserver 2>&1 &
  BACKEND_PID=$!
  echo -e "${BACKEND_PREFIX} PID: $BACKEND_PID"
}

# ─── Start frontend ───────────────────────────────────────────────────────────
start_frontend() {
  echo -e "${FRONTEND_PREFIX} Starting Next.js dev server on http://localhost:3000 ..."
  cd "$FRONTEND_DIR"
  stream_with_prefix "$FRONTEND_PREFIX" npm run dev 2>&1 &
  FRONTEND_PID=$!
  echo -e "${FRONTEND_PREFIX} PID: $FRONTEND_PID"
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo -e "\n${SYSTEM_PREFIX} ${BOLD}AgroManage Dev Environment${RESET}"
  echo -e "${SYSTEM_PREFIX} Press Ctrl+C to stop all services.\n"

  check_deps
  start_backend
  sleep 1
  start_frontend

  echo -e "\n${SYSTEM_PREFIX} Both services running. Tailing logs...\n"
  wait
}

main
