#!/usr/bin/env bash
# =============================================================================
# AgroManage — migrate.sh
# Run Django database migrations with env check.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")/backend"

echo "[MIGRATE] Activating venv..."
source "$BACKEND_DIR/.venv/bin/activate"
cd "$BACKEND_DIR"

echo "[MIGRATE] Running makemigrations..."
python manage.py makemigrations

echo "[MIGRATE] Running migrate..."
python manage.py migrate

echo "[MIGRATE] ✅ Done."
