#!/usr/bin/env bash
# Detiene backend (uvicorn) y frontend (Next.js) lanzados por scripts/dev_all.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.run-logs"

BACK_PID_FILE="$LOG_DIR/backend.pid"
FRONT_PID_FILE="$LOG_DIR/frontend.pid"

BACK_PORT="${BACK_PORT:-8000}"
FRONT_PORT="${FRONT_PORT:-3010}"

echo "[stop] Root: $ROOT_DIR"

kill_pidfile() {
  local name="$1"; shift
  local file="$1"; shift
  if [ -f "$file" ]; then
    local pid
    pid="$(cat "$file" 2>/dev/null || true)"
    if [ -n "${pid:-}" ]; then
      if ps -p "$pid" >/dev/null 2>&1; then
        echo "[stop] Terminando $name PID $pid…"
        kill "$pid" 2>/dev/null || true
        # espera breve
        for _ in {1..20}; do
          if ! ps -p "$pid" >/dev/null 2>&1; then break; fi
          sleep 0.2
        done
        if ps -p "$pid" >/dev/null 2>&1; then
          echo "[stop] Forzando kill -9 $name PID $pid…"
          kill -9 "$pid" 2>/dev/null || true
        fi
      else
        echo "[stop] $name PID $pid no está corriendo."
      fi
    else
      echo "[stop] pidfile vacío para $name ($file)"
    fi
    rm -f "$file" || true
  else
    echo "[stop] No hay pidfile para $name ($file)"
  fi
}

kill_by_port() {
  local port="$1"; shift
  local label="$1"; shift
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [ -n "${pids:-}" ]; then
      echo "[stop] Matando $label en puerto $port: $pids"
      kill $pids 2>/dev/null || true
      sleep 0.5
      local still
      still="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
      if [ -n "${still:-}" ]; then
        kill -9 $still 2>/dev/null || true
      fi
    fi
  fi
}

# Intenta por pidfile primero
kill_pidfile "backend" "$BACK_PID_FILE"
kill_pidfile "frontend" "$FRONT_PID_FILE"

# Fallback por puerto
kill_by_port "$BACK_PORT" "backend"
kill_by_port "$FRONT_PORT" "frontend"
# Adicionales comunes si se corrió manualmente
kill_by_port 3000 "frontend-3000"
kill_by_port 5174 "frontend-proxy"

echo "[stop] Listo. Revisa logs en $LOG_DIR si hace falta."

