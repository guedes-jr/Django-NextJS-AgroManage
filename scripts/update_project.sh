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

echo "=========================================="
echo "[DEPLOY] Atualizando AgroManage"
echo "=========================================="

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

sudo systemctl daemon-reload
sudo systemctl restart "$BACKEND_SERVICE"
sudo systemctl restart "$FRONTEND_SERVICE"
sudo systemctl reload nginx

echo "[DEPLOY] Aguardando serviços subirem..."
sleep 5

echo "[DEPLOY] Verificando status do backend..."
if ! sudo systemctl is-active --quiet "$BACKEND_SERVICE"; then
  echo "[ERRO] Backend não subiu corretamente."
  sudo systemctl status "$BACKEND_SERVICE" --no-pager
  exit 1
fi

echo "[DEPLOY] Verificando status do frontend..."
if ! sudo systemctl is-active --quiet "$FRONTEND_SERVICE"; then
  echo "[ERRO] Frontend não subiu corretamente."
  sudo systemctl status "$FRONTEND_SERVICE" --no-pager
  exit 1
fi

echo "[DEPLOY] Testando backend local..."
if ! curl -fsI http://127.0.0.1:8000/admin/ > /dev/null; then
  echo "[ERRO] Backend não respondeu em http://127.0.0.1:8000/admin/"
  exit 1
fi

echo "[DEPLOY] Testando frontend local..."
if ! curl -fsI http://127.0.0.1:3000/login > /dev/null; then
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