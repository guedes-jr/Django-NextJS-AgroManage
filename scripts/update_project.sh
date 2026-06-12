#!/bin/bash

set -euo pipefail

PROJECT_DIR="/var/www/agromanage"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
REPO_URL="https://github.com/guedes-jr/Django-NextJS-AgroManage.git"
BRANCH="main"

BACKEND_SERVICE="agromanage-backend"
FRONTEND_SERVICE="agromanage-frontend"

DJANGO_SETTINGS_MODULE_VALUE="config.settings.prod"
ENV_FILE="$BACKEND_DIR/.env"
DEFAULT_UPDATE_TIMEOUT_SECONDS="600"
SUDO_TIMEOUT_SECONDS="60"
CURL_TIMEOUT_SECONDS="20"

load_env_var() {
  local key="$1"
  local file="$2"
  if [ -f "$file" ]; then
    grep -E "^[[:space:]]*${key}=" "$file" | tail -n 1 | sed -E "s/^[[:space:]]*${key}=//; s/[[:space:]]*$//; s/^['\"]//; s/['\"]$//" || true
  fi
  return 0
}

DEPLOY_USER="${DEPLOY_USER:-$(load_env_var DEPLOY_USER "$ENV_FILE")}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PASSWORD="${DEPLOY_PASSWORD:-$(load_env_var DEPLOY_PASSWORD "$ENV_FILE")}"
UPDATE_TIMEOUT_SECONDS="${UPDATE_TIMEOUT_SECONDS:-$(load_env_var UPDATE_TIMEOUT_SECONDS "$ENV_FILE")}"
UPDATE_TIMEOUT_SECONDS="${UPDATE_TIMEOUT_SECONDS:-$DEFAULT_UPDATE_TIMEOUT_SECONDS}"

start_watchdog() {
  (
    sleep "$UPDATE_TIMEOUT_SECONDS"
    echo "[ERRO] Tempo limite de atualização excedido (${UPDATE_TIMEOUT_SECONDS}s). Encerrando processo."
    kill -TERM -- "-$$" 2>/dev/null || kill -TERM "$$" 2>/dev/null || true
    sleep 10
    kill -KILL -- "-$$" 2>/dev/null || kill -KILL "$$" 2>/dev/null || true
  ) &
  WATCHDOG_PID=$!
}

stop_watchdog() {
  if [ -n "${WATCHDOG_PID:-}" ]; then
    kill "$WATCHDOG_PID" 2>/dev/null || true
  fi
}

trap stop_watchdog EXIT

run_timeout() {
  local seconds="$1"
  shift

  if command -v timeout >/dev/null 2>&1; then
    timeout --foreground "$seconds" "$@"
    return $?
  fi

  "$@"
}

run_sudo() {
  if [ -n "${DEPLOY_PASSWORD:-}" ]; then
    printf '%s\n' "$DEPLOY_PASSWORD" | run_timeout "$SUDO_TIMEOUT_SECONDS" sudo -S -p "" "$@"
  else
    run_timeout "$SUDO_TIMEOUT_SECONDS" sudo -n "$@"
  fi
}

require_sudo_access() {
  if [ -n "${DEPLOY_PASSWORD:-}" ]; then
    if ! printf '%s\n' "$DEPLOY_PASSWORD" | run_timeout "$SUDO_TIMEOUT_SECONDS" sudo -S -p "" -v; then
      echo "[ERRO] DEPLOY_PASSWORD foi carregado, mas o sudo recusou a senha para o usuário $(id -un)."
      exit 1
    fi
    return
  fi

  if ! run_timeout "$SUDO_TIMEOUT_SECONDS" sudo -n -v; then
    echo "[ERRO] DEPLOY_PASSWORD não foi carregado e sudo sem senha não está configurado para o usuário $(id -un)."
    echo "[ERRO] Configure DEPLOY_PASSWORD em $ENV_FILE ou NOPASSWD no sudoers para os comandos systemctl/nginx necessários."
    exit 1
  fi
}

if [ "$(id -un)" != "$DEPLOY_USER" ]; then
  echo "[DEPLOY] Alternando execução para o usuário $DEPLOY_USER..."
  if [ -n "${DEPLOY_PASSWORD:-}" ]; then
    printf '%s\n' "$DEPLOY_PASSWORD" | run_timeout "$SUDO_TIMEOUT_SECONDS" sudo -S -p "" -u "$DEPLOY_USER" env DEPLOY_USER="$DEPLOY_USER" UPDATE_TIMEOUT_SECONDS="$UPDATE_TIMEOUT_SECONDS" bash "$0" "$@"
    exit $?
  fi
  exec sudo -u "$DEPLOY_USER" env DEPLOY_USER="$DEPLOY_USER" UPDATE_TIMEOUT_SECONDS="$UPDATE_TIMEOUT_SECONDS" bash "$0" "$@"
fi

start_watchdog

echo "=========================================="
echo "[DEPLOY] Atualizando AgroManage"
echo "=========================================="
echo "[DEPLOY] Timeout global configurado: ${UPDATE_TIMEOUT_SECONDS}s"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "[ERRO] Diretório do projeto não encontrado: $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

echo "[DEPLOY] Verificando repositório Git..."

if [ ! -d ".git" ]; then
  echo "[ERRO] Este diretório não é um repositório Git."
  echo "Clone o projeto primeiro:"
  echo "git clone $REPO_URL $PROJECT_DIR"
  exit 1
fi

CURRENT_REMOTE=$(git remote get-url origin || true)

if [ "$CURRENT_REMOTE" != "$REPO_URL" ]; then
  echo "[DEPLOY] Ajustando remote origin..."
  git remote set-url origin "$REPO_URL"
fi

echo "[DEPLOY] Salvando commit atual para possível rollback..."
PREVIOUS_COMMIT=$(git rev-parse HEAD)
echo "$PREVIOUS_COMMIT" > "$PROJECT_DIR/.last_deploy_commit"

echo "[DEPLOY] Buscando atualizações do GitHub..."
git fetch origin "$BRANCH"

echo "[DEPLOY] Atualizando código para origin/$BRANCH..."
git reset --hard "origin/$BRANCH"

echo "[DEPLOY] Limpando arquivos não rastreados com segurança..."
git clean -fd \
  -e backend/.env \
  -e backend/.venv \
  -e backend/media \
  -e backend/staticfiles \
  -e frontend/.env.production \
  -e frontend/.env.local \
  -e frontend/node_modules

echo "[DEPLOY] Validando backend..."

if [ ! -f "$BACKEND_DIR/.env" ]; then
  echo "[ERRO] Arquivo backend/.env não encontrado."
  echo "Crie o arquivo antes de continuar."
  exit 1
fi

cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  echo "[DEPLOY] Criando ambiente virtual Python..."
  python3 -m venv .venv
fi

echo "[DEPLOY] Ativando ambiente virtual..."
source .venv/bin/activate

echo "[DEPLOY] Atualizando pip..."
python -m pip install --upgrade pip

echo "[DEPLOY] Instalando dependências do backend..."
pip install -r requirements/prod.txt

echo "[DEPLOY] Garantindo Gunicorn instalado..."
pip install gunicorn

echo "[DEPLOY] Checando configuração Django..."
DJANGO_SETTINGS_MODULE="$DJANGO_SETTINGS_MODULE_VALUE" python manage.py check

echo "[DEPLOY] Aplicando migrations..."
DJANGO_SETTINGS_MODULE="$DJANGO_SETTINGS_MODULE_VALUE" python manage.py migrate --noinput

echo "[DEPLOY] Coletando arquivos estáticos..."
DJANGO_SETTINGS_MODULE="$DJANGO_SETTINGS_MODULE_VALUE" python manage.py collectstatic --noinput

echo "[DEPLOY] Validando frontend..."

cd "$FRONTEND_DIR"

if [ -f ".env.local" ]; then
  echo "[AVISO] frontend/.env.local encontrado."
  echo "[AVISO] Em produção ele pode sobrescrever .env.production."
  echo "[AVISO] Renomeando para .env.local.bak..."
  mv .env.local ".env.local.bak.$(date +%Y%m%d_%H%M%S)"
fi

if [ ! -f ".env.production" ]; then
  echo "[ERRO] Arquivo frontend/.env.production não encontrado."
  echo "Crie o arquivo com:"
  echo "NEXT_PUBLIC_API_URL=/api/v1"
  echo "NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000"
  echo "NEXT_PUBLIC_APP_NAME=AgroManage"
  echo "NEXT_PUBLIC_APP_URL=http://191.252.218.62"
  exit 1
fi

echo "[DEPLOY] Instalando dependências do frontend..."

if [ -f "package-lock.json" ]; then
  npm ci
else
  npm install
fi

echo "[DEPLOY] Gerando build do Next.js..."
npm run build

echo "[DEPLOY] Reiniciando serviços..."
require_sudo_access

run_sudo systemctl daemon-reload
run_sudo systemctl restart "$BACKEND_SERVICE"
run_sudo systemctl restart "$FRONTEND_SERVICE"
run_sudo systemctl reload nginx

echo "[DEPLOY] Aguardando serviços subirem..."
sleep 5

echo "[DEPLOY] Verificando status do backend..."
if ! run_sudo systemctl is-active --quiet "$BACKEND_SERVICE"; then
  echo "[ERRO] Backend não subiu corretamente."
  run_sudo systemctl status "$BACKEND_SERVICE" --no-pager
  exit 1
fi

echo "[DEPLOY] Verificando status do frontend..."
if ! run_sudo systemctl is-active --quiet "$FRONTEND_SERVICE"; then
  echo "[ERRO] Frontend não subiu corretamente."
  run_sudo systemctl status "$FRONTEND_SERVICE" --no-pager
  exit 1
fi

echo "[DEPLOY] Testando backend local..."
if ! run_timeout "$CURL_TIMEOUT_SECONDS" curl -fsI http://127.0.0.1:8000/admin/ > /dev/null; then
  echo "[ERRO] Backend não respondeu em http://127.0.0.1:8000/admin/"
  exit 1
fi

echo "[DEPLOY] Testando frontend local..."
if ! run_timeout "$CURL_TIMEOUT_SECONDS" curl -fsI http://127.0.0.1:3000/login > /dev/null; then
  echo "[ERRO] Frontend não respondeu em http://127.0.0.1:3000/login"
  exit 1
fi

echo "=========================================="
echo "[DEPLOY] Atualização concluída com sucesso!"
echo "=========================================="
echo "Commit anterior salvo em:"
echo "$PROJECT_DIR/.last_deploy_commit"
echo ""
echo "Frontend:"
echo "http://191.252.218.62/login"
echo ""
echo "Admin:"
echo "http://191.252.218.62/admin/"
