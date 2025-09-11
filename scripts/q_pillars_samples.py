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

rav = df[(df['make'].str.upper()=='TOYOTA') & (df['model'].str.upper()=='RAV4') & (df['ano']==2025) & (df['version'].str.upper().str.contains('ADVENTURE'))].head(1)
byd = df[(df['make'].str.upper()=='BYD') & (df['model'].str.upper()=='SONG PLUS') & (df['ano']==2026)].head(1)
ter = df[(df['make'].str.upper()=='FORD') & (df['model'].str.upper()=='TERRITORY') & (df['ano']==2025) & (df['version'].str.upper().str.contains('TITANIUM'))].head(1)

def pill(r):
    return r.filter(like='equip_p_').to_dict(orient='records')

print('RAV4 2025 Adventure pillars:', pill(rav))
print('BYD Song Plus 2026 pillars:', pill(byd))
print('Territory 2025 Titanium pillars:', pill(ter))

