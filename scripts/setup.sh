#!/usr/bin/env bash
# =============================================================================
# AgroManage — setup.sh
# First-time project setup: creates venv, installs deps, copies envs,
# runs migrations and seeds initial data.
# Usage: ./scripts/setup.sh  OR  make setup
# =============================================================================
set -euo pipefail

RESET='\033[0m'; BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
log() { echo -e "${GREEN}${BOLD}[SETUP]${RESET} $*"; }
warn() { echo -e "${YELLOW}${BOLD}[WARN] ${RESET} $*"; }
err() { echo -e "${RED}${BOLD}[ERROR]${RESET} $*"; exit 1; }

# Ensure common paths are in PATH (for node/npm/psql on Mac)
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# ─── Check system requirements ────────────────────────────────────────────────
log "Checking system requirements..."
command -v python3 >/dev/null 2>&1 || err "python3 not found. Install Python 3.12+."
command -v node    >/dev/null 2>&1 || command -v /usr/local/bin/node >/dev/null 2>&1 || err "node not found. Install Node.js 20+."
command -v npm     >/dev/null 2>&1 || command -v /usr/local/bin/npm  >/dev/null 2>&1 || err "npm not found."

NODE_CMD="node"
NPM_CMD="npm"
command -v node >/dev/null 2>&1 || NODE_CMD="/usr/local/bin/node"
command -v npm  >/dev/null 2>&1 || NPM_CMD="/usr/local/bin/npm"

# ─── Backend setup ────────────────────────────────────────────────────────────
log "Setting up backend..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  log "Creating Python virtual environment..."
  python3 -m venv .venv
fi

log "Activating venv and installing requirements..."
source .venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements/dev.txt --quiet

# Copy .env if not exists
if [ ! -f ".env" ]; then
  cp .env.example .env
  warn "backend/.env created from .env.example — review your settings!"
fi

log "Checking database connectivity..."
source .venv/bin/activate
if ! python manage.py check --database default >/dev/null 2>&1; then
    err "Database connectivity check failed. Review your backend/.env settings."
fi

log "Running migrations..."
python manage.py migrate --no-input

log "Collecting static files..."
python manage.py collectstatic --no-input --quiet 2>/dev/null || true

log "Creating superuser (if not exists)..."
python manage.py shell -c "
from apps.accounts.models import User
if not User.objects.filter(email='admin@agro.com').exists():
    User.objects.create_superuser('admin@agro.com', 'admin123', full_name='Admin')
    print('Superuser created: admin@agro.com / admin123')
else:
    print('Superuser already exists.')
"

deactivate

# ─── Frontend setup ───────────────────────────────────────────────────────────
log "Setting up frontend..."
cd "$FRONTEND_DIR"

if [ ! -f ".env.local" ]; then
  cp .env.example .env.local
  warn "frontend/.env.local created from .env.example — review your settings!"
fi

log "Installing frontend dependencies..."
$NPM_CMD install --silent

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
log "✅ Setup complete!"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo "  1. Review and edit backend/.env"
echo "  2. Review and edit frontend/.env.local"
echo "  3. Run: make dev"
echo ""
