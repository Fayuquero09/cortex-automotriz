#!/usr/bin/env bash
# Arranca backend (FastAPI) y frontend (Next.js) y abre el navegador.
# Uso: ./scripts/dev_all.sh

set -euo pipefail

# Utilidades
wait_for_port() {
  local port="$1"; shift
  local timeout="${1:-40}"; shift || true
  local step=0.2
  local max_iter
  max_iter=$(awk -v t="$timeout" -v s="$step" 'BEGIN{ printf "%d", (t/s) }')
  for i in $(seq 1 "$max_iter"); do
    if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep "$step"
  done
  return 1
}

open_url() {
  local url="$1"
  if command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 || true
  fi
  # Fallback con AppleScript si hiciera falta
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'tell application "System Events" to open location "'$url'"' >/dev/null 2>&1 || true
  fi
}

# Detecta raíz del repo (carpeta superior a este script)
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.run-logs"
mkdir -p "$LOG_DIR"

# Puertos y URLs por defecto
BACK_HOST="0.0.0.0"
BACK_PORT="8000"
FRONT_PORT="${FRONT_PORT:-3010}"
BACK_URL="http://127.0.0.1:${BACK_PORT}"

echo "[dev] Root: $ROOT_DIR"
echo "[dev] Logs: $LOG_DIR"

# Activa venv si existe
if [ -f "$ROOT_DIR/.venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.venv/bin/activate"
  echo "[dev] .venv activada"
fi

# Resuelve uvicorn (usa el de venv si no está en PATH)
UVICORN_CMD="uvicorn"
if ! command -v "$UVICORN_CMD" >/dev/null 2>&1 && [ -x "$ROOT_DIR/.venv/bin/uvicorn" ]; then
  UVICORN_CMD="$ROOT_DIR/.venv/bin/uvicorn"
fi

# Arranca backend
echo "[dev] Iniciando backend en ${BACK_HOST}:${BACK_PORT}…"
(
  cd "$ROOT_DIR"
  nohup "$UVICORN_CMD" backend.main:app \
    --reload --host "$BACK_HOST" --port "$BACK_PORT" \
    >> "$LOG_DIR/backend.log" 2>&1 & echo $! > "$LOG_DIR/backend.pid"
) 
sleep 1
BACK_PID=$(cat "$LOG_DIR/backend.pid" 2>/dev/null || true)
echo "[dev] Backend PID: ${BACK_PID:-desconocido} (logs en .run-logs/backend.log)"

# Prepara Node (opcional con nvm)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

# Arranca frontend (Next.js) en puerto 3010 por defecto
echo "[dev] Iniciando frontend (Next.js) en puerto ${FRONT_PORT}…"
(
  cd "$ROOT_DIR/cortex_frontend"
  # Instala dependencias si faltan (rápida verificación)
  if [ ! -d node_modules ]; then
    echo "[dev] node_modules no existe; ejecutando npm install (puede tardar)…"
    npm install >> "$LOG_DIR/frontend.log" 2>&1 || true
  fi
  nohup env PORT="$FRONT_PORT" NEXT_PUBLIC_BACKEND_URL="$BACK_URL" \
    npm run dev \
    >> "$LOG_DIR/frontend.log" 2>&1 & echo $! > "$LOG_DIR/frontend.pid"
)
# Espera a que el frontend escuche
if wait_for_port "$FRONT_PORT" 60; then
  echo "[dev] Frontend escuchando en puerto ${FRONT_PORT}"
else
  echo "[dev] Aviso: no se detectó el frontend en puerto ${FRONT_PORT} (continuo de todos modos)"
fi
FRONT_PID=$(cat "$LOG_DIR/frontend.pid" 2>/dev/null || true)
echo "[dev] Frontend PID: ${FRONT_PID:-desconocido} (logs en .run-logs/frontend.log)"

# Abre el navegador apuntando al UI
OPEN_URL="http://localhost:${FRONT_PORT}/ui"
echo "[dev] Abriendo navegador en ${OPEN_URL}…"
open_url "$OPEN_URL"
echo "[dev] Si no se abrió automáticamente, abre manualmente: $OPEN_URL"

echo "[dev] Todo listo. Para detener:"
echo "      kill \$(cat $LOG_DIR/backend.pid 2>/dev/null) \$(cat $LOG_DIR/frontend.pid 2>/dev/null) || true"
