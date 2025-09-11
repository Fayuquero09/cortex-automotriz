#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ.setdefault('RUTA_DATOS_VEHICULOS','dataframe_base/data/equipo_veh_limpio_procesado.csv')

from backend.app import _load_catalog  # type: ignore
import pandas as pd  # type: ignore


def main(models: list[str] | None = None) -> int:
    if not models:
        models = ["TERRITORY", "RAV4", "SONG PLUS"]
    models_up = [m.upper() for m in models]

    df = _load_catalog().copy()
    for c in ("make","model","version"):
        if c in df.columns:
            df[c] = df[c].astype(str)

    cols = [c for c in (
        "make","model","version","ano","equip_score",
        "equip_p_adas","equip_p_safety","equip_p_comfort","equip_p_infotainment",
        "equip_p_traction","equip_p_utility","equip_p_performance"
    ) if c in df.columns]

    sub = df[df["model"].str.upper().isin(models_up)][cols].copy()
    out: dict[str, dict] = {}

    def num(s):
        try:
            return float(s)
        except Exception:
            return None

    for (model, year), grp in sub.groupby([sub['model'].str.upper(), sub.get('ano') if 'ano' in sub.columns else 0]):
        # cast equip_score to numeric for stats
        es = pd.to_numeric(grp.get('equip_score'), errors='coerce') if 'equip_score' in grp.columns else pd.Series(dtype=float)
        avg = float(es.mean()) if len(es.dropna()) else None
        mx = float(es.max()) if len(es.dropna()) else None
        mn = float(es.min()) if len(es.dropna()) else None
        top = grp.sort_values(by=[c for c in ['equip_score'] if c in grp.columns], ascending=False).head(5)
        out.setdefault(model, {})[int(year) if pd.notna(year) else None] = {
            'count': int(len(grp)),
            'equip_score_avg': avg,
            'equip_score_min': mn,
            'equip_score_max': mx,
            'examples': top.to_dict(orient='records'),
        }

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())

