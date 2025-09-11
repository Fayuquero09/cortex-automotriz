#!/usr/bin/env python3
from __future__ import annotations

import os, sys
from pathlib import Path
import pandas as pd  # type: ignore

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault('RUTA_DATOS_VEHICULOS','dataframe_base/data/enriched/current.csv')
from backend.app import _load_catalog  # type: ignore

df = _load_catalog().copy()
for c in ('make','model','version'):
    if c in df.columns:
        df[c] = df[c].astype(str)

sub = df[(df['make'].str.upper()=='TOYOTA') & (df['model'].str.upper()=='RAV4') & (df['ano']==2025) & (df['version'].str.upper()=='LE')].head(1)
cols = [
 'asientos_calefaccion_conductor','asientos_calefaccion_pasajero','asientos_ventilacion_conductor','asientos_ventilacion_pasajero',
 'zonas_clima','llave_inteligente','llave_inteligente_original','techo_corredizo','techo_corredizo_delantero_original',
 'apertura_remota_maletero','cierre_automatico_maletero','aire_acondicionado','volante_electrico_ajustable','ventanas_electricas','seguros_electricos','limpiaparabrisas_lluvia','header_description'
]
print(sub[cols].to_string(index=False))
