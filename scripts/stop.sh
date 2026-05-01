#!/bin/bash
# =============================================================================
# AgroManage — stop.sh
# Lista e encerra todos os processos de dev por porta.
# =============================================================================
# NOTA: set -e removido intencionalmente.
# kill retorna !=0 quando o processo já não existe, o que causaria
# saída prematura com erro mesmo em situações normais (make Error 1).
set -uo pipefail

RESET='\033[0m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'

# ─── Lista processos escutando em uma porta ───────────────────────────────────
list_port() {
  local port="$1"
  local name="$2"
  echo -e "${CYAN}${BOLD}[PORT $port]${RESET} $name"
  local info
  info=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$info" ]; then
    echo "$info" | awk 'NR==1 || /LISTEN/ {printf "  %s\n", $0}'
  else
    echo -e "  ${YELLOW}(nenhum processo escutando)${RESET}"
  fi
}

# ─── Encerra todos os processos em uma porta ─────────────────────────────────
stop_port() {
  local port="$1"
  local name="$2"
  local pids=()
  local pid
  # lsof pode retornar múltiplos PIDs (um por linha)
  while IFS= read -r pid; do
    [[ -n "$pid" ]] && pids+=("$pid")
  done < <(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ "${#pids[@]}" -gt 0 ]; then
    for pid in "${pids[@]}"; do
      kill "$pid" 2>/dev/null \
        && echo -e "${GREEN}[STOP]${RESET} $name — PID $pid (port $port) encerrado." \
        || echo -e "${RED}[STOP]${RESET} $name — PID $pid não pôde ser encerrado (já morreu?)."
    done
  else
    echo -e "${YELLOW}[STOP]${RESET} $name (port $port) não estava rodando."
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━  AgroManage — Processos ativos  ━━━${RESET}"
echo ""
list_port 8000 "Django backend"
list_port 3000 "Next.js frontend"
list_port 5678 "debugpy (Python)"
list_port 9229 "Node inspector"
echo ""

echo -e "${BOLD}━━━  Encerrando serviços  ━━━${RESET}"
echo ""
stop_port 8000 "Django backend"
stop_port 3000 "Next.js frontend"
stop_port 5678 "debugpy"
stop_port 9229 "Node inspector"
echo ""

echo -e "${BOLD}━━━  Verificação final  ━━━${RESET}"
echo ""
list_port 8000 "Django backend"
list_port 3000 "Next.js frontend"
echo ""
echo -e "${GREEN}${BOLD}[STOP]${RESET} ✅ Concluído."
echo ""
