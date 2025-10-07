#!/usr/bin/env zsh
set -euo pipefail

# Resolve repo root (this script lives in tools/scripts/)
SCRIPT_DIR=${0:A:h}
ROOT_DIR=${SCRIPT_DIR:h}
cd "$ROOT_DIR"

mkdir -p logs
LOG_FILE="logs/daily_refresh.log"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] START daily_refresh" | tee -a "$LOG_FILE"

# Activate venv if present
if [ -f .venv/bin/activate ]; then
  source .venv/bin/activate
fi

# Run the job
python3 tools/scripts/daily_refresh.py >> "$LOG_FILE" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] END daily_refresh (rc=$?)" | tee -a "$LOG_FILE"

