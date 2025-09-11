#!/usr/bin/env python3
from __future__ import annotations

import os, sys
from pathlib import Path
import pandas as pd  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('RUTA_DATOS_VEHICULOS','dataframe_base/data/equipo_veh_limpio_procesado.csv')
from backend.app import _load_catalog  # type: ignore

df = _load_catalog().copy()
for c in ('make','model','version'):
    if c in df.columns:
        df[c] = df[c].astype(str)

YEARS = {2024, 2025}
models = [
    ('FORD', 'TERRITORY'),
    ('TOYOTA', 'RAV4'),
    ('BYD', 'SONG PLUS'),
]

def rows_for(make:str, model:str):
    m = make.upper(); d = model.upper()
    sub = df[(df['make'].str.upper()==m) & (df['model'].str.upper()==d)].copy()
    if 'ano' in sub.columns:
        sub = sub[sub['ano'].isin(YEARS)]
    cols = [c for c in ('make','model','version','ano','equip_score','equip_p_adas','equip_p_safety','equip_p_comfort','equip_p_infotainment','equip_p_traction','equip_p_utility','equip_p_performance') if c in sub.columns]
    return sub[cols].sort_values(['ano','version'])

for mk, md in models:
    print(f"\n===== {mk} {md} =====")
    out = rows_for(mk, md)
    if out.empty:
        print("(sin filas)")
    else:
        print(out.to_string(index=False))

