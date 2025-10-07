#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
LOGS = ROOT / "logs"
BACKUPS = ROOT / "archive"


def run(cmd: list[str]) -> int:
    print("$", " ".join(cmd))
    return subprocess.call(cmd)


def ensure_dirs():
    (DATA / "overrides").mkdir(parents=True, exist_ok=True)
    (DATA / "enriched").mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)


def backup_snapshot():
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUPS / f"_backup_{stamp}"
    dest.mkdir(parents=True, exist_ok=True)
    # minimal snapshot
    for p in [ROOT / "backend", ROOT / "frontend" / "dist", DATA / "enriched" / "current.csv"]:
        if p.exists():
            run(["rsync", "-a", str(p), str(dest)])
    return dest


def main():
    ensure_dirs()
    # Step 0: process raw catalog (equipo_veh_limpio.csv -> equipo_veh_limpio_procesado.csv)
    raw = DATA / "equipo_veh_limpio.csv"
    if raw.exists():
        rc0 = run([sys.executable, str(ROOT / "scripts" / "process_raw_catalog.py")])
        if rc0 != 0:
            print("WARN: process_raw_catalog failed; continuing if a processed file already exists")
    # TODO: Pull MY2026 + updates 24/25/26 (placeholder)
    # Step 1: enrich catalog
    rc = run([sys.executable, str(ROOT / "scripts" / "enrich_catalog.py")])
    if rc != 0:
        sys.exit(rc)
    # Step 2: snapshot
    snap = backup_snapshot()
    print(f"Snapshot at: {snap}")


if __name__ == "__main__":
    main()
