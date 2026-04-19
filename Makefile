# =============================================================================
# AgroManage — Makefile
# Professional developer commands for local and Docker workflows.
# =============================================================================

.DEFAULT_GOAL := help
SHELL         := /bin/bash

# ─── Paths ────────────────────────────────────────────────────────────────────
ROOT_DIR      := $(shell pwd)
BACKEND_DIR   := $(ROOT_DIR)/backend
FRONTEND_DIR  := $(ROOT_DIR)/frontend
VENV          := $(BACKEND_DIR)/.venv
PYTHON        := $(VENV)/bin/python
PIP           := $(VENV)/bin/pip
DJANGO        := $(PYTHON) $(BACKEND_DIR)/manage.py
NODE_CMD      := $(shell command -v node 2>/dev/null || echo /usr/local/bin/node)
NPM_CMD       := $(shell command -v npm  2>/dev/null || echo /usr/local/bin/npm)

# ─── Commit message guard ─────────────────────────────────────────────────────
# Usage: make commit-feat msg="add farm listing endpoint"
# Allow both MSG="..." and msg="..." (default to msg if set)
MSG ?= $(msg)


# ─── Colors ───────────────────────────────────────────────────────────────────
BOLD   := \033[1m
GREEN  := \033[0;32m
CYAN   := \033[0;36m
YELLOW := \033[1;33m
RED    := \033[0;31m
RESET  := \033[0m

# =============================================================================
# HELP
# =============================================================================

.PHONY: help
help: ## Show this help message
	@echo ""
	@echo -e "  $(GREEN)$(BOLD)AgroManage — Developer Commands$(RESET)"
	@echo ""
	@echo -e "  $(CYAN)SETUP$(RESET)"
	@grep -E '^(setup|install)[^:]*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}; {printf "    make %-25s %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(CYAN)DEV$(RESET)"
	@grep -E '^(dev|stop|logs|shell|debug)[^:]*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}; {printf "    make %-25s %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(CYAN)DATABASE$(RESET)"
	@grep -E '^(migrate|migrations|seed|dbshell|reset)[^:]*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}; {printf "    make %-25s %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(CYAN)QUALITY$(RESET)"
	@grep -E '^(test|lint|format|type)[^:]*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}; {printf "    make %-25s %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(CYAN)DOCKER$(RESET)"
	@grep -E '^(docker)[^:]*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}; {printf "    make %-25s %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  $(CYAN)GIT$(RESET)"
	@grep -E '^(git|commit|add-commit|push)[^:]*:.*##' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*##"}; {printf "    make %-25s %s\n", $$1, $$2}'
	@echo ""
	@echo -e "  Usage for commit commands:"
	@echo -e "    make commit-feat msg=\"add farm listing\"   → git commit -m \"✨ feat: add farm listing\"\n"

# =============================================================================
# SETUP
# =============================================================================

.PHONY: setup
setup: ## First-time project setup (venv + deps + migrate + seed)
	@chmod +x scripts/*.sh
	@bash scripts/setup.sh

.PHONY: install-backend
install-backend: ## Install / update Python dependencies
	@echo -e "$(GREEN)[BACKEND]$(RESET) Installing requirements..."
	@$(PIP) install --upgrade pip --quiet
	@$(PIP) install -r $(BACKEND_DIR)/requirements/dev.txt --quiet
	@echo -e "$(GREEN)[BACKEND]$(RESET) Done."

.PHONY: install-frontend
install-frontend: ## Install / update Node.js dependencies
	@echo -e "$(CYAN)[FRONTEND]$(RESET) Installing dependencies..."
	@cd $(FRONTEND_DIR) && $(NPM_CMD) install
	@echo -e "$(CYAN)[FRONTEND]$(RESET) Done."

# =============================================================================
# DEV
# =============================================================================

.PHONY: dev
dev: ## Start backend + frontend in one terminal with colored logs
	@chmod +x scripts/dev.sh
	@bash scripts/dev.sh

.PHONY: debug
debug: ## Start backend (debugpy:5678) + frontend (inspector:9229) in debug mode
	@chmod +x scripts/debug.sh
	@bash scripts/debug.sh

.PHONY: stop
stop: ## Stop all running dev services (ports 8000 and 3000)
	@chmod +x scripts/stop.sh
	@bash scripts/stop.sh

.PHONY: logs
logs: ## Tail Docker logs for all services (requires Docker stack running)
	@docker compose -f docker-compose.dev.yml logs -f

.PHONY: shell
shell: ## Open Django interactive shell
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && DJANGO_SETTINGS_MODULE=config.settings.dev $(PYTHON) manage.py shell_plus 2>/dev/null || $(PYTHON) manage.py shell

.PHONY: dbshell
dbshell: ## Open Django database shell
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && $(DJANGO) dbshell

.PHONY: venv
venv: ## Print the command to activate the backend venv in your current terminal
	@echo ""
	@echo -e "  $(YELLOW)$(BOLD)Note:$(RESET) Make runs in a subshell — it cannot activate the venv in YOUR terminal."
	@echo -e "  Run the following command manually:\n"
	@echo -e "  $(GREEN)  source backend/.venv/bin/activate$(RESET)\n"
	@echo -e "  To deactivate: $(GREEN)deactivate$(RESET)\n"

.PHONY: venv-check
venv-check: ## Check if the backend venv exists and show installed packages count
	@if [ -d "$(VENV)" ]; then \
		echo -e "$(GREEN)[VENV]$(RESET) Virtual environment found at $(VENV)"; \
		echo -e "$(GREEN)[VENV]$(RESET) Python: $$($(PYTHON) --version)"; \
		echo -e "$(GREEN)[VENV]$(RESET) Packages: $$($(PIP) list 2>/dev/null | tail -n +3 | wc -l | tr -d ' ') installed"; \
	else \
		echo -e "$(RED)[VENV]$(RESET) Virtual environment NOT found. Run: make setup"; \
	fi

# =============================================================================
# DATABASE
# =============================================================================

.PHONY: migrations
migrations: ## Create new Django migrations (makemigrations)
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && $(DJANGO) makemigrations
	@echo -e "$(GREEN)[BACKEND]$(RESET) Migrations created."

.PHONY: migrate
migrate: ## Apply pending Django migrations
	@chmod +x scripts/migrate.sh
	@bash scripts/migrate.sh

.PHONY: seed
seed: ## Load initial seed data into the database
	@chmod +x scripts/seed.sh
	@bash scripts/seed.sh

.PHONY: reset-db
reset-db: ## ⚠️ Drop and recreate the database, run migrations and seed
	@echo -e "\033[1;31m[WARN] This will DESTROY all database data. Ctrl+C to cancel...\033[0m"
	@sleep 3
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && \
		$(DJANGO) flush --no-input && \
		$(DJANGO) migrate --no-input
	@bash scripts/seed.sh

# =============================================================================
# QUALITY
# =============================================================================

.PHONY: test
test: ## Run the full backend test suite with coverage
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && \
		DJANGO_SETTINGS_MODULE=config.settings.test \
		$(VENV)/bin/pytest --tb=short

.PHONY: test-fast
test-fast: ## Run tests without coverage (faster)
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && \
		DJANGO_SETTINGS_MODULE=config.settings.test \
		$(VENV)/bin/pytest --tb=short --no-cov -q

.PHONY: lint
lint: ## Run ruff linter + eslint on backend and frontend
	@echo -e "$(GREEN)[BACKEND] $(RESET) Running ruff..."
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && $(VENV)/bin/ruff check .
	@echo -e "$(CYAN)[FRONTEND]$(RESET) Running eslint..."
	@cd $(FRONTEND_DIR) && $(NPM_CMD) run lint

.PHONY: format
format: ## Auto-format backend (ruff) and frontend (prettier)
	@echo -e "$(GREEN)[BACKEND] $(RESET) Formatting with ruff..."
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && $(VENV)/bin/ruff format .
	@echo -e "$(CYAN)[FRONTEND]$(RESET) Formatting with prettier..."
	@cd $(FRONTEND_DIR) && $(NPM_CMD) run format 2>/dev/null || echo "  (add prettier to package.json to enable)"

.PHONY: typecheck
typecheck: ## Run mypy on backend + tsc on frontend
	@echo -e "$(GREEN)[BACKEND] $(RESET) Running mypy..."
	@source $(VENV)/bin/activate && cd $(BACKEND_DIR) && $(VENV)/bin/mypy . 2>/dev/null || true
	@echo -e "$(CYAN)[FRONTEND]$(RESET) Running tsc..."
	@cd $(FRONTEND_DIR) && $(NPM_CMD) run build --if-present

# =============================================================================
# DOCKER
# =============================================================================

.PHONY: docker-dev
docker-dev: ## Start dev stack via Docker Compose
	@docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

.PHONY: docker-prod
docker-prod: ## Start production stack via Docker Compose
	@docker compose up --build -d

.PHONY: docker-down
docker-down: ## Stop and remove all Docker containers
	@docker compose down

.PHONY: docker-clean
docker-clean: ## ⚠️  Remove all containers, volumes and images for this project
	@docker compose down -v --rmi local

# =============================================================================
# GIT — Conventional Commits with Emojis
# All commands require msg="your message here"
# Example: make commit-feat msg="add livestock batch endpoint"
# =============================================================================

# ─── Guard: ensures MSG is set before committing ──────────────────────────────
_check-msg:
	@if [ -z "$(MSG)" ]; then \
		echo -e "$(RED)[ERROR]$(RESET) MSG is required. Usage: make commit-feat msg=\"your message\""; \
		exit 1; \
	fi

# ─── Stage all changes ────────────────────────────────────────────────────────
.PHONY: git-add
git-add: ## Stage all changes (git add .)
	@git add .
	@echo -e "$(GREEN)[GIT]$(RESET) All changes staged."
	@git status --short

# ─── Status / Log ─────────────────────────────────────────────────────────────
.PHONY: git-status
git-status: ## Show git working tree status
	@git status

.PHONY: git-log
git-log: ## Show pretty git commit log (last 20)
	@git log --oneline --graph --decorate --all -20

.PHONY: git-diff
git-diff: ## Show unstaged changes
	@git diff

# ─── Push ─────────────────────────────────────────────────────────────────────
.PHONY: push
push: ## Push current branch to origin
	@git push origin HEAD
	@echo -e "$(GREEN)[GIT]$(RESET) Pushed to origin/$(shell git branch --show-current)."

.PHONY: push-force
push-force: ## ⚠️  Force push current branch (use with caution)
	@echo -e "$(YELLOW)[WARN]$(RESET) Force pushing in 3s... Ctrl+C to cancel."
	@sleep 3
	@git push origin HEAD --force-with-lease

# ─── Add + Commit (auto-stage) ────────────────────────────────────────────────
.PHONY: add-commit
add-commit: _check-msg ## Stage all and commit (no type prefix). MSG required.
	@git add .
	@git commit -m "$(MSG)"

# ─── Conventional Commits ─────────────────────────────────────────────────────

.PHONY: commit-feat
commit-feat: _check-msg ## ✨ feat: new feature. MSG required.
	@git add .
	@git commit -m "✨ feat: $(MSG)"
	@echo -e "$(GREEN)[GIT]$(RESET) ✨ feat: $(MSG)"

.PHONY: commit-fix
commit-fix: _check-msg ## 🐛 fix: bug fix. MSG required.
	@git add .
	@git commit -m "🐛 fix: $(MSG)"
	@echo -e "$(GREEN)[GIT]$(RESET) 🐛 fix: $(MSG)"

.PHONY: commit-hotfix
commit-hotfix: _check-msg ## 🚑 hotfix: critical production fix. MSG required.
	@git add .
	@git commit -m "🚑 hotfix: $(MSG)"
	@echo -e "$(RED)[GIT]$(RESET) 🚑 hotfix: $(MSG)"

.PHONY: commit-docs
commit-docs: _check-msg ## 📚 docs: documentation changes. MSG required.
	@git add .
	@git commit -m "📚 docs: $(MSG)"
	@echo -e "$(CYAN)[GIT]$(RESET) 📚 docs: $(MSG)"

.PHONY: commit-style
commit-style: _check-msg ## 💄 style: formatting, no logic change. MSG required.
	@git add .
	@git commit -m "💄 style: $(MSG)"
	@echo -e "$(CYAN)[GIT]$(RESET) 💄 style: $(MSG)"

.PHONY: commit-refactor
commit-refactor: _check-msg ## ♻️  refactor: code refactoring. MSG required.
	@git add .
	@git commit -m "♻️  refactor: $(MSG)"
	@echo -e "$(CYAN)[GIT]$(RESET) ♻️  refactor: $(MSG)"

.PHONY: commit-perf
commit-perf: _check-msg ## ⚡ perf: performance improvement. MSG required.
	@git add .
	@git commit -m "⚡ perf: $(MSG)"
	@echo -e "$(GREEN)[GIT]$(RESET) ⚡ perf: $(MSG)"

.PHONY: commit-test
commit-test: _check-msg ## ✅ test: add or update tests. MSG required.
	@git add .
	@git commit -m "✅ test: $(MSG)"
	@echo -e "$(GREEN)[GIT]$(RESET) ✅ test: $(MSG)"

.PHONY: commit-build
commit-build: _check-msg ## 📦 build: build system or dependency changes. MSG required.
	@git add .
	@git commit -m "📦 build: $(MSG)"
	@echo -e "$(CYAN)[GIT]$(RESET) 📦 build: $(MSG)"

.PHONY: commit-ci
commit-ci: _check-msg ## 👷 ci: CI/CD configuration changes. MSG required.
	@git add .
	@git commit -m "👷 ci: $(MSG)"
	@echo -e "$(CYAN)[GIT]$(RESET) 👷 ci: $(MSG)"

.PHONY: commit-chore
commit-chore: _check-msg ## 🔧 chore: maintenance, configs, scripts. MSG required.
	@git add .
	@git commit -m "🔧 chore: $(MSG)"
	@echo -e "$(YELLOW)[GIT]$(RESET) 🔧 chore: $(MSG)"

.PHONY: commit-revert
commit-revert: _check-msg ## ⏪ revert: revert a previous commit. MSG required.
	@git add .
	@git commit -m "⏪ revert: $(MSG)"
	@echo -e "$(YELLOW)[GIT]$(RESET) ⏪ revert: $(MSG)"

.PHONY: commit-wip
commit-wip: _check-msg ## 🚧 wip: work in progress (do not merge). MSG required.
	@git add .
	@git commit -m "🚧 wip: $(MSG)"
	@echo -e "$(YELLOW)[GIT]$(RESET) 🚧 wip: $(MSG)"

.PHONY: commit-breaking
commit-breaking: _check-msg ## 💥 breaking: breaking change. MSG required.
	@git add .
	@git commit -m "💥 breaking: $(MSG)"
	@echo -e "$(RED)[GIT]$(RESET) 💥 breaking: $(MSG)"

.PHONY: commit-db
commit-db: _check-msg ## 🗃️  db: database migrations or schema changes. MSG required.
	@git add .
	@git commit -m "🗃️  db: $(MSG)"
	@echo -e "$(GREEN)[GIT]$(RESET) 🗃️  db: $(MSG)"

.PHONY: commit-ui
commit-ui: _check-msg ## 🎨 ui: UI/UX changes. MSG required.
	@git add .
	@git commit -m "🎨 ui: $(MSG)"
	@echo -e "$(CYAN)[GIT]$(RESET) 🎨 ui: $(MSG)"

.PHONY: commit-sec
commit-sec: _check-msg ## 🔒 sec: security fix or improvement. MSG required.
	@git add .
	@git commit -m "🔒 sec: $(MSG)"
	@echo -e "$(RED)[GIT]$(RESET) 🔒 sec: $(MSG)"

# ─── Shortcut: add + commit + push in one step ────────────────────────────────
.PHONY: ship-feat
ship-feat: _check-msg ## ✨ feat + push. MSG required.
	@git add . && git commit -m "✨ feat: $(MSG)" && git push origin HEAD
	@echo -e "$(GREEN)[GIT]$(RESET) ✨ Shipped: feat: $(MSG)"

.PHONY: ship-fix
ship-fix: _check-msg ## 🐛 fix + push. MSG required.
	@git add . && git commit -m "🐛 fix: $(MSG)" && git push origin HEAD
	@echo -e "$(GREEN)[GIT]$(RESET) 🐛 Shipped: fix: $(MSG)"

.PHONY: ship-hotfix
ship-hotfix: _check-msg ## 🚑 hotfix + push. MSG required.
	@git add . && git commit -m "🚑 hotfix: $(MSG)" && git push origin HEAD
	@echo -e "$(RED)[GIT]$(RESET) 🚑 Shipped: hotfix: $(MSG)"
