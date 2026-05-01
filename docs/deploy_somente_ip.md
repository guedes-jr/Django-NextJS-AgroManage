Perfeito. Vamos fazer com segurança e em fases. Como a máquina ainda está sendo criada, primeiro vamos preparar o **GitHub/local**, depois entramos na VPS.

A estratégia será:

```txt
Local → GitHub → VPS clona o repositório → configura ambiente → roda backend/frontend → Nginx expõe pelo IP
```

Sem Docker, usando:

```txt
Ubuntu Server
PostgreSQL
Django + Gunicorn
Next.js + npm start
Nginx
systemd
GitHub
```

---

# Fase 1 — Preparar o projeto local antes de subir para o GitHub

Na raiz do projeto, primeiro confira se você está na pasta certa:

```bash
pwd
ls
```

Você deve ver algo parecido com:

```txt
backend
frontend
Makefile
```

---

## 1. Criar/ajustar `.gitignore`

Na raiz do projeto, crie ou edite:

```bash
nano .gitignore
```

Coloque:

```gitignore
# Python
__pycache__/
*.pyc
*.pyo
*.pyd
backend/.venv/
backend/venv/
backend/db.sqlite3

# Django
backend/staticfiles/
backend/media/
backend/.env

# Node
frontend/node_modules/
frontend/.next/
frontend/out/
frontend/.env.local
frontend/.env.production
frontend/.env.production.local

# System
.DS_Store
.idea/
.vscode/

# Logs
*.log

# Env
.env
```

Ponto importante: **não envie `.env`, `.venv`, `node_modules`, `.next` nem `db.sqlite3` para o GitHub**.

---

## 2. Conferir se arquivos sensíveis não serão enviados

Rode:

```bash
git status
```

Se aparecer algo como:

```txt
backend/.env
backend/db.sqlite3
frontend/.env.local
frontend/node_modules
frontend/.next
```

não faça commit ainda.

Se algum desses arquivos já estiver rastreado pelo Git, remova do rastreamento sem apagar do seu computador:

```bash
git rm --cached backend/.env
git rm --cached backend/db.sqlite3
git rm --cached frontend/.env.local
```

Se aparecer erro dizendo que o arquivo não está rastreado, tudo bem.

---

## 3. Garantir dependências do backend

Entre no backend:

```bash
cd backend
source .venv/bin/activate
```

Atualize o `requirements.txt`:

```bash
pip freeze > requirements.txt
```

Confirme que tem pelo menos algo relacionado a:

```txt
Django
djangorestframework
gunicorn
psycopg
dj-database-url
python-decouple
django-cors-headers
```

Depois volte para a raiz:

```bash
cd ..
```

---

## 4. Garantir que o frontend tem scripts corretos

Abra:

```bash
cat frontend/package.json
```

Confirme que tem scripts parecidos com:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start"
}
```

Se tiver, está ok.

---

# Fase 2 — Criar repositório no GitHub

No GitHub, crie um repositório novo.

Sugestão de nome:

```txt
agromanage
```

Pode deixar como **Private**, principalmente se ainda é projeto em desenvolvimento.

Depois, na raiz local do projeto, rode:

```bash
git init
git add .
git status
```

Olhe com calma o que vai subir.

Depois:

```bash
git commit -m "initial deploy version"
```

Conecte ao GitHub:

```bash
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

Exemplo:

```bash
git remote add origin git@github.com:seu-usuario/agromanage.git
```

ou via HTTPS:

```bash
git remote add origin https://github.com/seu-usuario/agromanage.git
```

---

# Fase 3 — Quando a VPS estiver pronta

Assim que a VPS terminar de criar, você vai precisar me mandar ou usar:

```txt
IP da VPS
usuário inicial
senha ou chave SSH
sistema operacional instalado
```

Provavelmente será algo assim:

```bash
ssh root@IP_DA_VPS
```

Exemplo:

```bash
ssh root@123.123.123.123
```

---

# Fase 4 — Primeiros comandos na VPS

Quando acessar a VPS, rode:

```bash
apt update && apt upgrade -y
```

Depois instale os pacotes base:

```bash
apt install -y \
  git \
  curl \
  unzip \
  nginx \
  postgresql \
  postgresql-contrib \
  python3 \
  python3-venv \
  python3-pip \
  build-essential \
  libpq-dev
```

---

# Fase 5 — Criar usuário de deploy

Ainda como `root`, crie um usuário próprio:

```bash
adduser deploy
usermod -aG sudo deploy
```

Depois entre nele:

```bash
su - deploy
```

Esse usuário será usado para rodar a aplicação.

---

# Fase 6 — Instalar Node.js

Como usuário `deploy`, rode:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Verifique:

```bash
node -v
npm -v
```

---

# Fase 7 — Criar banco PostgreSQL

Entre no PostgreSQL:

```bash
sudo -u postgres psql
```

Rode:

```sql
CREATE USER agromanage_user WITH PASSWORD 'SENHA_FORTE_AQUI';
CREATE DATABASE agromanage_db OWNER agromanage_user;

ALTER ROLE agromanage_user SET client_encoding TO 'utf8';
ALTER ROLE agromanage_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE agromanage_user SET timezone TO 'America/Sao_Paulo';

GRANT ALL PRIVILEGES ON DATABASE agromanage_db TO agromanage_user;
```

Saia:

```sql
\q
```

Guarde essa string:

```env
DATABASE_URL=postgresql://agromanage_user:SENHA_FORTE_AQUI@127.0.0.1:5432/agromanage_db
```

---

# Fase 8 — Clonar o projeto na VPS

Crie a pasta:

```bash
sudo mkdir -p /var/www/agromanage
sudo chown -R deploy:deploy /var/www/agromanage
```

Agora clone o projeto.

Se o repositório for público ou HTTPS:

```bash
git clone URL_DO_REPOSITORIO /var/www/agromanage
```

Se for privado via SSH, primeiro precisamos configurar chave SSH na VPS e adicionar no GitHub. Podemos fazer isso juntos quando chegar nessa parte.

---

# Fase 9 — Configurar backend na VPS

Entre no backend:

```bash
cd /var/www/agromanage/backend
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Crie o `.env`:

```bash
nano .env
```

Conteúdo inicial usando IP:

```env
DEBUG=False
SECRET_KEY=troque_por_uma_secret_key_forte

ALLOWED_HOSTS=IP_DA_VPS,localhost,127.0.0.1

DATABASE_URL=postgresql://agromanage_user:SENHA_FORTE_AQUI@127.0.0.1:5432/agromanage_db

CORS_ALLOWED_ORIGINS=http://IP_DA_VPS,http://localhost:3000,http://127.0.0.1:3000
CSRF_TRUSTED_ORIGINS=http://IP_DA_VPS

DJANGO_SETTINGS_MODULE=config.settings
```

Depois rode:

```bash
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py createsuperuser
```

---

# Fase 10 — Configurar frontend na VPS

Entre no frontend:

```bash
cd /var/www/agromanage/frontend
npm install
```

Crie o `.env.production`:

```bash
nano .env.production
```

Conteúdo:

```env
NEXT_PUBLIC_API_URL=/api/v1
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8000
NEXT_PUBLIC_APP_NAME=AgroManage
NEXT_PUBLIC_APP_URL=http://IP_DA_VPS
```

Depois:

```bash
npm run build
```

---

# Fase 11 — Criar serviços systemd

Backend:

```bash
sudo nano /etc/systemd/system/agromanage-backend.service
```

Conteúdo:

```ini
[Unit]
Description=AgroManage Django Backend
After=network.target postgresql.service

[Service]
User=deploy
Group=deploy
WorkingDirectory=/var/www/agromanage/backend
EnvironmentFile=/var/www/agromanage/backend/.env
ExecStart=/var/www/agromanage/backend/.venv/bin/gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 2 --timeout 120
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Frontend:

```bash
sudo nano /etc/systemd/system/agromanage-frontend.service
```

Conteúdo:

```ini
[Unit]
Description=AgroManage Next.js Frontend
After=network.target

[Service]
User=deploy
Group=deploy
WorkingDirectory=/var/www/agromanage/frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Ativar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable agromanage-backend
sudo systemctl enable agromanage-frontend
sudo systemctl start agromanage-backend
sudo systemctl start agromanage-frontend
```

---

# Fase 12 — Configurar Nginx pelo IP

Crie:

```bash
sudo nano /etc/nginx/sites-available/agromanage
```

Conteúdo:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location /static/ {
        alias /var/www/agromanage/backend/staticfiles/;
    }

    location /media/ {
        alias /var/www/agromanage/backend/media/;
    }

    location /api/v1/ {
        proxy_pass http://127.0.0.1:8000/api/v1/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /admin/ {
        proxy_pass http://127.0.0.1:8000/admin/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Ative:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -s /etc/nginx/sites-available/agromanage /etc/nginx/sites-enabled/agromanage
sudo nginx -t
sudo systemctl reload nginx
```

---

# Fase 13 — Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw enable
sudo ufw status
```

Não libere 3000, 8000 nem 5432.

---

# Fase 14 — Testes finais

No navegador:

```txt
http://IP_DA_VPS
```

Admin:

```txt
http://IP_DA_VPS/admin/
```

API:

```txt
http://IP_DA_VPS/api/v1/
```

Logs úteis:

```bash
sudo journalctl -u agromanage-backend -f
```

```bash
sudo journalctl -u agromanage-frontend -f
```

```bash
sudo tail -f /var/log/nginx/error.log
```

---

Quando a VPS terminar de criar, me mande o **IP** e me diga se você vai acessar com **senha** ou **chave SSH**. Aí seguimos comando por comando, sem pular etapa.
