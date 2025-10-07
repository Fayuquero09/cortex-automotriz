#!/usr/bin/env bash
# Muestra logs en vivo de backend y frontend en una sola ventana.
# Uso: ./scripts/logs_tail.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.run-logs"
BACK_LOG="$LOG_DIR/backend.log"
FRONT_LOG="$LOG_DIR/frontend.log"

mkdir -p "$LOG_DIR"
touch "$BACK_LOG" "$FRONT_LOG"

echo "[logs] Mostrando logs (Ctrl+C para salir)"
echo "[logs] Backend:  $BACK_LOG"
echo "[logs] Frontend: $FRONT_LOG"

# Cola salidas con etiquetas para distinguir orígenes
cleanup() { trap - INT TERM; [ -n "${T1:-}" ] && kill "$T1" 2>/dev/null || true; [ -n "${T2:-}" ] && kill "$T2" 2>/dev/null || true; }
trap cleanup INT TERM

stdbuf -oL tail -n 100 -F "$BACK_LOG" | sed -e 's/^/[backend] /' & T1=$!
stdbuf -oL tail -n 100 -F "$FRONT_LOG" | sed -e 's/^/[frontend] /' & T2=$!

wait "$T1" "$T2"

