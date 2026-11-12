.DEFAULT_GOAL := help
SHELL := /bin/bash
MOBILE_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
BACKEND_PYTHON ?= $(MOBILE_DIR)/../backend/.venv/bin/python
BACKEND_BIND ?= 0.0.0.0
BACKEND_PORT ?= 8000
API_HOST ?= 127.0.0.1
EXPO_PORT ?= 8081
MOBILE_PLATFORM ?= default
TUNNEL ?=
CLEAR ?=

.PHONY: help dev dev-tunnel test-dev
help:
	@printf '%s\n' 'make dev                     Backend Django + Expo (Ctrl+C encerra ambos)' 'make dev MOBILE_PLATFORM=web  Backend + prévia web' 'make dev API_HOST=192.168.x.x Use o IP do computador para aparelho físico' 'make dev-tunnel              Backend + Expo com tunnel (acesso fora da rede)' 'make test-dev                Testa o supervisor com serviços simulados'

dev:
	@test -x "$(BACKEND_PYTHON)" || { printf '%s\n' 'Ambiente Python ausente. Configure backend/.venv ou informe BACKEND_PYTHON.'; exit 1; }
	@"$(BACKEND_PYTHON)" "$(MOBILE_DIR)/scripts/dev.py" --backend-bind "$(BACKEND_BIND)" --backend-port "$(BACKEND_PORT)" --api-host "$(API_HOST)" --expo-port "$(EXPO_PORT)" --platform "$(MOBILE_PLATFORM)" $(if $(TUNNEL),--tunnel,) $(if $(CLEAR),--clear,)

dev-tunnel:
	@$(MAKE) dev TUNNEL=1

test-dev:
	@"$(BACKEND_PYTHON)" -m unittest discover -s "$(MOBILE_DIR)/scripts" -p 'test_dev.py' -v
