<div align="center">

<img src="logo_name_right.png" alt="AgroManage Logo" width="500"/>

# AgroManage

**Plataforma completa de gestão agropecuária — Pecuária · Lavoura · Estoque · Financeiro**

[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![Django](https://img.shields.io/badge/Django-5.0-092E20?style=flat-square&logo=django&logoColor=white)](https://djangoproject.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## Índice

- [Visão Geral](#visão-geral)
- [Stack Tecnológica](#stack-tecnológica)
- [Início Rápido](#início-rápido)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Comandos Make — Referência Completa](#comandos-make--referência-completa)
  - [Setup](#setup)
  - [Dev](#dev)
  - [Banco de Dados](#banco-de-dados)
  - [Qualidade](#qualidade)
  - [Docker](#docker)
  - [Git — Conventional Commits](#git--conventional-commits)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [API Docs](#api-docs)
- [Debug](#debug)
- [Contribuindo](#contribuindo)

---

## Visão Geral

O **AgroManage** é uma plataforma de gestão agropecuária de nível produtivo, desenvolvida com Django REST Framework no backend e Next.js 14 no frontend. Suporta gestão de fazendas, rebanhos (bovinos, suínos, aves), culturas, estoque de insumos e controle financeiro, com arquitetura pronta para multi-tenant.

### Domínios suportados

| Domínio | Funcionalidades |
|---|---|
| 🏡 **Fazendas** | Propriedades, setores, geolocalização |
| 🐄 **Pecuária** | Lotes de animais, espécies, raças, entrada/saída |
| 🌾 **Lavoura** | Talhões, ciclos de plantio, colheitas |
| 📦 **Estoque** | Insumos, movimentações, fornecedores, alertas de mínimo |
| 💰 **Financeiro** | Transações, categorias, contas a pagar/receber |
| 📊 **Relatórios** | Dashboards, indicadores por domínio |
| ✅ **Tarefas** | Agenda operacional, atribuições por usuário |
| 🔍 **Auditoria** | Log imutável de ações críticas |

---

## Stack Tecnológica

```
┌─────────────────────────────────────────────────────────┐
│                        FRONTEND                          │
│   Next.js 14 · TypeScript · Tailwind CSS · App Router   │
├─────────────────────────────────────────────────────────┤
│                         NGINX                            │
│        Reverse Proxy · Static Files · SSL/TLS           │
├──────────────────────────┬──────────────────────────────┤
│        BACKEND            │         WORKERS              │
│   Django 5 · DRF · JWT   │  Celery · Redis · Celery Beat│
├──────────────────────────┴──────────────────────────────┤
│                       DATABASE                           │
│                   PostgreSQL 16                          │
└─────────────────────────────────────────────────────────┘
```

---

## Início Rápido

### Pré-requisitos

- Python 3.12+
- Node.js 20+
- PostgreSQL 16+ **ou** Docker

### Setup (ambiente local)

```bash
# 1. Clone o repositório
git clone https://github.com/guedes-jr/Django-NextJS-AgroManage.git
cd Django-NextJS-AgroManage

# 2. Execute o setup completo (uma única vez)
make setup

# 3. Inicie o ambiente de desenvolvimento
make dev
```

O comando `make dev` inicia **backend e frontend no mesmo terminal** com logs coloridos:

```
[BACKEND]  Starting Django dev server on http://localhost:8000 ...
[FRONTEND] Starting Next.js dev server on http://localhost:3000 ...
```

### Setup via Docker

```bash
# Dev com hot reload
make docker-dev

# Produção
make docker-prod
```

---

## Estrutura do Projeto

```
Django-NextJS-AgroManage/
├── .cursorrules              # Regras de IA para o projeto
├── .editorconfig             # Estilo de código entre editores
├── .gitignore
├── Makefile                  # Todos os comandos de dev
├── README.md
├── docker-compose.yml        # Stack de produção
├── docker-compose.dev.yml    # Overrides de dev (hot reload)
│
├── ia/                       # Contexto e diretrizes para agentes de IA
│   ├── agro_system.skill     # Skill principal do sistema
│   ├── architecture.md
│   ├── backend-guidelines.md
│   └── ...
│
├── backend/                  # Django project
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py       # Configurações base
│   │   │   ├── dev.py        # Overrides de dev
│   │   │   ├── prod.py       # Overrides de produção
│   │   │   └── test.py       # Overrides de testes
│   │   ├── urls.py           # Roteamento principal
│   │   ├── celery.py         # Configuração Celery
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── apps/
│   │   ├── accounts/         # Usuários, autenticação, roles
│   │   ├── organizations/    # Multi-tenancy
│   │   ├── farms/            # Fazendas e setores
│   │   ├── livestock/        # Rebanhos, espécies, raças, lotes
│   │   ├── crops/            # Talhões, ciclos de plantio, colheitas
│   │   ├── inventory/        # Estoque, insumos, fornecedores
│   │   ├── finance/          # Transações, categorias financeiras
│   │   ├── reports/          # Dashboards e relatórios
│   │   ├── tasks/            # Tarefas operacionais
│   │   └── audit/            # Log de auditoria imutável
│   ├── common/
│   │   ├── models.py         # BaseModel (UUID + timestamps)
│   │   ├── pagination.py     # StandardResultsPagination
│   │   ├── exceptions.py     # custom_exception_handler
│   │   ├── permissions.py    # Permissões compartilhadas
│   │   └── utils.py          # Funções utilitárias
│   ├── requirements/
│   │   ├── base.txt          # Deps de produção
│   │   ├── dev.txt           # Deps de desenvolvimento
│   │   └── prod.txt          # Deps extras de produção
│   └── pytest.ini
│
├── frontend/                 # Next.js project
│   └── src/
│       ├── app/              # App Router (pages e layouts)
│       ├── components/
│       │   ├── ui/           # Design system primitivos
│       │   ├── layout/       # Sidebar, header, navegação
│       │   └── feedback/     # Toast, modais, loading
│       ├── features/         # Módulos por domínio
│       │   ├── auth/
│       │   ├── farms/
│       │   ├── livestock/
│       │   ├── crops/
│       │   ├── inventory/
│       │   ├── finance/
│       │   └── reports/
│       ├── services/
│       │   └── api.ts        # Axios com interceptors JWT
│       ├── hooks/            # Custom hooks compartilhados
│       ├── lib/
│       │   ├── constants.ts  # Constantes globais
│       │   └── formatters.ts # Formatação de datas, moeda, etc.
│       ├── validators/       # Schemas Zod
│       └── types/
│           └── index.ts      # Tipos TypeScript globais
│
├── docker/
│   ├── backend/Dockerfile    # Multi-stage Python 3.12
│   ├── frontend/Dockerfile   # Multi-stage Node 20
│   └── nginx/
│       ├── Dockerfile
│       └── nginx.conf
│
└── scripts/
    ├── setup.sh              # Setup inicial completo
    ├── dev.sh                # Dev com logs coloridos unificados
    ├── debug.sh              # Debug com debugpy + Node inspector
    ├── migrate.sh            # makemigrations + migrate
    ├── seed.sh               # Dados de demonstração
    └── stop.sh               # Para todos os serviços
```

---

## Comandos Make — Referência Completa

> Execute `make help` para ver todos os comandos disponíveis com descrição.

### Setup

| Comando | Descrição |
|---|---|
| `make setup` | **First-time setup**: cria `.venv`, instala dependências Python e Node, copia `.env`, roda migrations, cria superuser e seed |
| `make install-backend` | Atualiza/reinstala dependências Python (requirements/dev.txt) |
| `make install-frontend` | Reinstala dependências Node.js (`npm install`) |

```bash
# Exemplo — primeiro uso
make setup
```

---

### Dev

| Comando | Descrição |
|---|---|
| `make dev` | Inicia Django (`:8000`) + Next.js (`:3000`) **no mesmo terminal** com logs coloridos por prefixo |
| `make debug` | Modo debug: Django com **debugpy** em `:5678` + Next.js com **Node inspector** em `:9229` |
| `make stop` | Para todos os serviços de dev (mata processos nas portas 8000, 3000, 5678, 9229) |
| `make shell` | Abre o Django shell interativo (`shell_plus` se disponível) |
| `make dbshell` | Abre o shell direto no banco PostgreSQL via Django |
| `make logs` | Segue os logs de todos os containers Docker (requer stack rodando) |

```bash
# Fluxo típico de desenvolvimento
make dev           # Inicia tudo

# Em outro terminal, quando precisar reiniciar
make stop
make dev
```

**Exemplo de saída do `make dev`:**
```
[SYSTEM]  AgroManage Dev Environment
[SYSTEM]  Press Ctrl+C to stop all services.

[BACKEND]  Starting Django dev server on http://localhost:8000 ...
[BACKEND]  PID: 12345
[FRONTEND] Starting Next.js dev server on http://localhost:3000 ...
[FRONTEND] PID: 12346
```

---

### Banco de Dados

| Comando | Descrição |
|---|---|
| `make migrations` | Cria arquivos de migração (`makemigrations`) para todos os apps |
| `make migrate` | Aplica todas as migrations pendentes no banco |
| `make seed` | Carrega dados iniciais de demonstração (organização, fazenda, setores, espécies) |
| `make reset-db` | ⚠️ **Destrói** todos os dados, roda migrations e seed novamente |
| `make dbshell` | Acessa o shell do banco de dados diretamente |

```bash
# Após criar ou modificar um model
make migrations
make migrate

# Carregar dados de exemplo
make seed

# Recomeçar do zero (cuidado!)
make reset-db
```

---

### Qualidade

| Comando | Descrição |
|---|---|
| `make test` | Roda a suite completa de testes com relatório de cobertura (`pytest --cov`) |
| `make test-fast` | Roda os testes sem cobertura (mais rápido, para iteração rápida) |
| `make lint` | Executa **ruff** no backend e **eslint** no frontend |
| `make format` | Auto-formata código: **ruff format** (Python) e **prettier** (TypeScript) |
| `make typecheck` | Executa **mypy** no backend e **tsc** no frontend |

```bash
# Antes de cada commit — garante qualidade
make lint
make test-fast

# Verificação completa antes de PR
make format && make lint && make test && make typecheck
```

---

### Docker

| Comando | Descrição |
|---|---|
| `make docker-dev` | Inicia o stack completo de dev via Docker Compose (com hot reload e Flower) |
| `make docker-prod` | Inicia o stack de produção em background (gunicorn + Next.js standalone + Nginx) |
| `make docker-down` | Para e remove todos os containers |
| `make docker-clean` | ⚠️ Remove containers, volumes e imagens locais do projeto |
| `make logs` | Segue os logs de todos os serviços em tempo real |

```bash
# Dev via Docker (sem precisar de Python/Node locais)
make docker-dev

# Produção
make docker-prod
make logs          # Acompanhar logs

# Cleanup completo
make docker-clean
```

---

### Git — Conventional Commits

Todos os comandos de commit fazem **`git add .` automaticamente** antes de commitar. Use `msg="..."` (ou `MSG="..."`) para definir a mensagem.

#### Commits de funcionalidade

| Comando | Emoji | Tipo | Quando usar |
|---|---|---|---|
| `make commit-feat msg="..."` | ✨ | `feat` | Nova funcionalidade |
| `make commit-ui msg="..."` | 🎨 | `ui` | Alteração de interface/UX |
| `make commit-perf msg="..."` | ⚡ | `perf` | Melhoria de performance |

#### Correções

| Comando | Emoji | Tipo | Quando usar |
|---|---|---|---|
| `make commit-fix msg="..."` | 🐛 | `fix` | Correção de bug |
| `make commit-hotfix msg="..."` | 🚑 | `hotfix` | Correção crítica em produção |
| `make commit-sec msg="..."` | 🔒 | `sec` | Correção de segurança |
| `make commit-revert msg="..."` | ⏪ | `revert` | Reverter um commit anterior |

#### Manutenção

| Comando | Emoji | Tipo | Quando usar |
|---|---|---|---|
| `make commit-refactor msg="..."` | ♻️ | `refactor` | Refatoração sem mudança de comportamento |
| `make commit-chore msg="..."` | 🔧 | `chore` | Manutenção, configs, scripts |
| `make commit-build msg="..."` | 📦 | `build` | Mudanças no sistema de build ou dependências |
| `make commit-ci msg="..."` | 👷 | `ci` | Configurações de CI/CD |
| `make commit-wip msg="..."` | 🚧 | `wip` | Trabalho em progresso (não fazer merge!) |

#### Banco de dados e testes

| Comando | Emoji | Tipo | Quando usar |
|---|---|---|---|
| `make commit-db msg="..."` | 🗃️ | `db` | Migrations ou alterações de schema |
| `make commit-test msg="..."` | ✅ | `test` | Adição ou atualização de testes |

#### Documentação

| Comando | Emoji | Tipo | Quando usar |
|---|---|---|---|
| `make commit-docs msg="..."` | 📚 | `docs` | Documentação |
| `make commit-style msg="..."` | 💄 | `style` | Formatação, sem mudança de lógica |

#### Breaking changes

| Comando | Emoji | Tipo | Quando usar |
|---|---|---|---|
| `make commit-breaking msg="..."` | 💥 | `breaking` | Mudança que quebra compatibilidade |

#### Atalhos Git extras

| Comando | Descrição |
|---|---|
| `make git-add` | `git add .` com exibição do status |
| `make git-status` | `git status` |
| `make git-log` | Log bonito: `git log --oneline --graph --decorate --all -20` |
| `make git-diff` | `git diff` (mudanças não staged) |
| `make push` | `git push origin HEAD` |
| `make push-force` | Force push com confirmação (usa `--force-with-lease`) |
| `make add-commit msg="..."` | Add + commit sem prefixo de tipo |

#### Atalhos ship (commit + push em um passo)

| Comando | Descrição |
|---|---|
| `make ship-feat msg="..."` | ✨ feat: add + commit + push |
| `make ship-fix msg="..."` | 🐛 fix: add + commit + push |
| `make ship-hotfix msg="..."` | 🚑 hotfix: add + commit + push |

```bash
# Exemplos práticos

# Adicionar uma nova funcionalidade
make commit-feat msg="add livestock batch creation endpoint"
# → git commit -m "✨ feat: add livestock batch creation endpoint"

# Corrigir um bug
make commit-fix msg="fix stock movement balance calculation"
# → git commit -m "🐛 fix: fix stock movement balance calculation"

# Criar migration após novo model
make commit-db msg="add AnimalBatch model and migrations"
# → git commit -m "🗃️  db: add AnimalBatch model and migrations"

# Correção crítica + push imediato
make ship-hotfix msg="fix JWT token expiry on production"
# → git add . && git commit -m "🚑 hotfix: fix JWT token expiry on production" && git push

# Ver histórico de commits
make git-log
```

---

## Variáveis de Ambiente

### Backend (`backend/.env`)

Copie `backend/.env.example` para `backend/.env` e ajuste:

| Variável | Padrão | Obrigatório | Descrição |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | `change-me-...` | ✅ (prod) | Chave secreta Django |
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` | — | Módulo de settings ativo |
| `DJANGO_LOG_LEVEL` | `INFO` | — | Nível de log (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `DEBUG` | `True` | — | Ativar modo debug |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | — | Hosts permitidos (vírgula separados) |
| `DATABASE_URL` | `postgres://agro:agro@localhost:5432/agrodb` | ✅ | URL de conexão com PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379/0` | ✅ | URL do Redis (Celery/Cache) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | — | Origens CORS permitidas |

### Frontend (`frontend/.env.local`)

Copie `frontend/.env.example` para `frontend/.env.local`:

| Variável | Padrão | Descrição |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000/api/v1` | URL base da API Django |
| `NEXT_PUBLIC_APP_NAME` | `AgroManage` | Nome da aplicação |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | URL pública do frontend |

---

## API Docs

Com o backend rodando (`make dev`), acesse:

| URL | Descrição |
|---|---|
| [`/api/schema/swagger/`](http://localhost:8000/api/schema/swagger/) | 📖 Swagger UI interativo |
| [`/api/schema/redoc/`](http://localhost:8000/api/schema/redoc/) | 📋 Documentação Redoc |
| [`/api/schema/`](http://localhost:8000/api/schema/) | 🔧 Schema OpenAPI bruto (JSON) |
| [`/admin/`](http://localhost:8000/admin/) | ⚙️ Django Admin |

**Credenciais padrão do Admin** (criadas pelo `make setup`):
```
Email: admin@agro.com
Senha: admin123
```

---

## Debug

### Backend — VS Code / PyCharm (debugpy)

```bash
make debug
# → Aguardando conexão no localhost:5678
```

**VS Code** — adicione ao `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "AgroManage Backend",
      "type": "python",
      "request": "attach",
      "connect": { "host": "localhost", "port": 5678 },
      "pathMappings": [{ "localRoot": "${workspaceFolder}/backend", "remoteRoot": "/app" }]
    }
  ]
}
```

**PyCharm** → Run → Edit Configurations → Python Remote Debug → host: `localhost`, port: `5678`

### Frontend — Chrome DevTools (Node Inspector)

```bash
make debug
# → Node inspector ativo em localhost:9229
```

1. Abra Chrome e acesse `chrome://inspect`
2. Clique em **"Configure..."** → adicione `localhost:9229`
3. Clique em **"inspect"** na target `Next.js`

---

## Contribuindo

1. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
2. Faça suas alterações seguindo os padrões em `ia/coding-standards.md`
3. Garanta qualidade:
   ```bash
   make lint
   make test
   ```
4. Faça o commit usando os atalhos do Makefile:
   ```bash
   make commit-feat MSG="add nova funcionalidade"
   ```
5. Abra um Pull Request

---

## Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para detalhes.

---

<div align="center">
Desenvolvido com ❤️ para o agronegócio brasileiro
</div>
