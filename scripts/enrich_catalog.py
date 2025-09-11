#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime
import csv
import json
import math
import re
from typing import Dict, List, Tuple

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OEM_DIR = DATA / "oem_specs_processed"
ENRICHED_DIR = DATA / "enriched"
OVERRIDES_DIR = DATA / "overrides"
ALIASES_DIR = DATA / "aliases"
ALIASES_FILE = ALIASES_DIR / "alias_names.csv"


ACRONYMS = {"BMW","VW","GMC","RAM","BYD","GWM","MG","JAC","BAIC","MINI","DS"}
UPPER_TOKENS = {"CX-5","CX-3","CX-30","ID.4","RAV4","RAV-4","X-Trail","Q5","Q3","GLA","GLC"}


def normalize_token(tok: str) -> str:
    t = tok.strip()
    if not t:
        return t
    if t.upper() in ACRONYMS:
        return t.upper()
    if any(c.isdigit() for c in t) and ("-" in t or "." in t):
        return t.upper()
    return t[:1].upper() + t[1:].lower()


def normalize_name(s: str) -> str:
    if s is None:
        return ""
    s = s.strip()
    # preserve acronyms and known tokens
    parts = re.split(r"(\s+)", s)
    out = []
    for p in parts:
        if p.isspace():
            out.append(p)
            continue
        if p.upper() in ACRONYMS or p.upper() in UPPER_TOKENS:
            out.append(p.upper())
        else:
            out.append(normalize_token(p))
    return "".join(out)


def normalize_year(val) -> int:
    try:
        f = float(val)
    except Exception:
        try:
            return int(str(val))
        except Exception:
            return None  # type: ignore
    return int(math.floor(f))


def segment_from_body_style(bs: str) -> str:
    s = (bs or "").strip().lower()
    if "pick" in s or "cab" in s:
        return "pickup"
    if "todo terreno" in s or "suv" in s or "crossover" in s:
        return "suv"
    if "van" in s:
        return "van"
    if "hatch" in s:
        return "hatch"
    return "sedan"


WEIGHTS = {
    "pickup": {"capacidad":30, "seguridad":20, "adas":20, "traccion":10, "confort":10, "conectividad":10},
    "suv":    {"adas":25, "seguridad":25, "confort":15, "conectividad":15, "capacidad":10, "multimedia":10},
    "sedan":  {"adas":25, "seguridad":25, "confort":15, "conectividad":15, "eficiencia":10, "multimedia":10},
    "van":    {"seguridad":25, "adas":20, "confort":20, "capacidad":20, "conectividad":10, "multimedia":5},
}


def overlay_ev(weights: Dict[str,int], cat: str | object) -> Dict[str,int]:
    c = str(cat or "").lower()
    if not any(k in c for k in ("electrico","bev","hev","phev")):
        return weights
    w = dict(weights)
    shift = 10
    # Reasigna de multimedia/capacidad hacia electrificación/eficiencia
    if w.get("multimedia",0) >= 5:
        w["multimedia"] = max(0, w["multimedia"] - 5)
        w["eficiencia"] = w.get("eficiencia",0) + 5
    if w.get("capacidad",0) >= 5:
        w["capacidad"] = max(0, w["capacidad"] - 5)
        w["electrificacion"] = w.get("electrificacion",0) + 5
    return w


def _truthy(v: object) -> bool:
    s = str(v).strip().lower()
    return s in {"true","1","si","sí","estandar","estándar","incluido","standard","std","present","x","y"}


def _num(v: object) -> float | None:
    try:
        f = float(str(v).strip())
        if pd.isna(f):
            return None
        return f
    except Exception:
        return None


def _has_text(v: object, *tokens: str) -> bool:
    s = str(v or "").lower()
    return all(t.lower() in s for t in tokens)


def compute_pillars(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    cols = {c.lower() for c in out.columns}

    # ----- ADAS -----
    adas_weights = {
        'alerta_colision': 20,
        'sensor_punto_ciego': 20,
        'camara_360': 15,
        'asistente_estac_frontal': 10,
        'asistente_estac_trasero': 10,
        'control_frenado_curvas': 10,
        'crucero_adaptativo': 15,
    }
    adas_total = sum(adas_weights.values())

    def has_cruise_adapt(row) -> bool:
        # Busca en la columna *_original si menciona adaptativo/ACC
        for c in ('control_crucero_original','header_description'):
            if c in out.columns and _has_text(row.get(c), 'adapt'):
                return True
        return False

    def score_adas(row) -> float:
        s = 0
        s += adas_weights['alerta_colision'] if _truthy(row.get('alerta_colision')) or _truthy(row.get('alerta_colision_original')) else 0
        s += adas_weights['sensor_punto_ciego'] if _truthy(row.get('sensor_punto_ciego')) or _truthy(row.get('sensor_punto_ciego_original')) or _truthy(row.get('tiene_camara_punto_ciego')) else 0
        s += adas_weights['camara_360'] if _truthy(row.get('camara_360')) else 0
        s += adas_weights['asistente_estac_frontal'] if _truthy(row.get('asistente_estac_frontal')) or _truthy(row.get('asistente_estac_frontal_original')) else 0
        s += adas_weights['asistente_estac_trasero'] if _truthy(row.get('asistente_estac_trasero')) else 0
        s += adas_weights['control_frenado_curvas'] if _truthy(row.get('control_frenado_curvas')) else 0
        s += adas_weights['crucero_adaptativo'] if has_cruise_adapt(row) else 0
        # Señales en texto libre para mantener de carril / TSR
        hd = row.get('header_description')
        if _has_text(hd, 'lane') or _has_text(hd, 'carril'):
            s += 10
        if _has_text(hd, 'señales') or _has_text(hd, 'tsr'):
            s += 6
        return round(100.0 * s / adas_total, 1)

    # ----- Seguridad -----
    def airbags_count(row) -> int:
        cnt = 0
        for c in (
            'bolsas_aire_delanteras_conductor','bolsas_aire_delanteras_pasajero',
            'bolsas_aire_laterales_adelante','bolsas_aire_laterales_atras',
            'bolsas_cortina_todas_filas','bolsas_rodillas_conductor','bolsas_rodillas_pasajero',
            'bolsas_aire_antisumergimiento_atras','bolsas_aire_antisumergimiento_tercera_fila'
        ):
            v = row.get(c)
            if v is None:
                continue
            if isinstance(v, (int,float)):
                try:
                    if float(v) > 0:
                        cnt += 1
                except Exception:
                    pass
            else:
                if _truthy(v):
                    cnt += 1
        return cnt

    def score_safety(row) -> float:
        s = 0.0
        # ABS y ESC
        if _truthy(row.get('abs')) or _truthy(row.get('abs_original')):
            s += 20
        if _truthy(row.get('control_estabilidad')) or _truthy(row.get('control_estabilidad_original')) or _truthy(row.get('control_electrico_de_traccion')):
            s += 20
        # Airbags: escala 0..40 (0-6+)
        ab = airbags_count(row)
        s += min(40.0, ab * (40.0/6.0))
        # Blind spot o 360 ya cuentan en ADAS; aquí un pequeño extra si ambos
        if (_truthy(row.get('sensor_punto_ciego')) or _truthy(row.get('tiene_camara_punto_ciego'))) and _truthy(row.get('camara_360')):
            s += 10
        # Faros avanzados aportan seguridad
        if _has_text(row.get('faros_delanteros') or row.get('tipo_faros') or row.get('header_description'), 'led'):
            s += 6
        if _has_text(row.get('header_description'), 'matriz') or _has_text(row.get('header_description'), 'matrix'):
            s += 6
        # Antiniebla suma poco
        if _truthy(row.get('luces_antiniebla')):
            s += 4
        return round(min(100.0, s), 1)

    # ----- Confort -----
    def score_comfort(row) -> float:
        s = 0.0
        for c in ('asientos_calefaccion_conductor','asientos_calefaccion_pasajero','asientos_ventilacion_conductor','asientos_ventilacion_pasajero'):
            if _truthy(row.get(c)):
                s += 8
        # Clima multizona: zonas_clima (1,2,3…)
        z = _num(row.get('zonas_clima')) or 0
        if z >= 3:
            s += 20
        elif z == 2:
            s += 12
        elif z == 1:
            s += 6
        # Aire acondicionado básico
        if _truthy(row.get('aire_acondicionado')):
            s += 6
        if _truthy(row.get('llave_inteligente')) or _truthy(row.get('llave_inteligente_original')):
            s += 8
        if _truthy(row.get('techo_corredizo')) or _truthy(row.get('techo_corredizo_delantero_original')):
            s += 12
        # Maletero eléctrico
        if _truthy(row.get('apertura_remota_maletero')):
            s += 6
        if _truthy(row.get('cierre_automatico_maletero')):
            s += 8
        # Conveniencia adicional
        if _truthy(row.get('volante_electrico_ajustable')):
            s += 6
        if _truthy(row.get('ventanas_electricas')):
            s += 4
        if _truthy(row.get('seguros_electricos')):
            s += 4
        if _truthy(row.get('limpiaparabrisas_lluvia')):
            s += 4
        # Tapicería premium en texto libre
        if _has_text(row.get('tapizado_adicional_de_asiento') or row.get('header_description'), 'piel'):
            s += 6
        return round(min(100.0, s), 1)

    # ----- Info‑entretenimiento -----
    def score_infotainment(row) -> float:
        s = 0.0
        if _truthy(row.get('tiene_pantalla_tactil')):
            s += 18
        if _truthy(row.get('android_auto')) or _truthy(row.get('android_auto_original')):
            s += 18
        if _truthy(row.get('apple_carplay')) or _truthy(row.get('apple_carplay_original')):
            s += 18
        # Bocinas, escala 0..30 (hasta 12 tan bien)
        spk = _num(row.get('bocinas') or row.get('speakers_count')) or 0
        if spk > 0:
            s += min(30.0, spk * (30.0/12.0))
        # Tamaño de pantallas (si está disponible en enriquecido JSON)
        main_in = _num(row.get('screen_main_in')) or 0
        cluster_in = _num(row.get('screen_cluster_in')) or 0
        if main_in > 0:
            s += min(15.0, max(0.0, (main_in - 6.0) * 2.5))  # 6" base, 12" ~ +15
        if cluster_in > 0:
            s += min(10.0, max(0.0, (cluster_in - 4.0) * 2.0))  # 4" base, 9" ~ +10
        # Conectividad y carga
        usb_a = int((_num(row.get('usb_a_count')) or 0))
        usb_c = int((_num(row.get('usb_c_count')) or 0))
        if usb_a > 0:
            s += min(8.0, usb_a * 2.0)
        if usb_c > 0:
            s += min(8.0, usb_c * 2.5)
        if _truthy(row.get('wireless_charging')):
            s += 8
        # Audio de marca (texto)
        hd = row.get('header_description')
        if _has_text(hd, 'bose') or _has_text(hd, 'jbl') or _has_text(hd, 'harman') or _has_text(hd, 'sony'):
            s += 6
        # 12V es utilitario; aquí ignoramos
        return round(min(100.0, s), 1)

    # ----- Tracción -----
    def score_traction(row) -> float:
        s = 0.0
        tr = str(row.get('traccion_original') or row.get('driven_wheels') or '').lower()
        if '4x4' in tr or '4wd' in tr or 'awd' in tr:
            s += 70
        elif 'rwd' in tr or 'trasera' in tr or 'rear' in tr:
            s += 45
        elif 'fwd' in tr or 'delantera' in tr or 'front' in tr:
            s += 30
        if _truthy(row.get('control_electrico_de_traccion')):
            s += 15
        return round(min(100.0, s), 1)

    # ----- Utilidad -----
    def score_utility(row) -> float:
        s = 0.0
        seats = int((_num(row.get('capacidad_de_asientos')) or 0))
        if seats >= 7:
            s += 30
        if _truthy(row.get('tercera_fila')) or _truthy(row.get('tercera_fila_original')):
            s += 20
        if _truthy(row.get('rieles_techo')) or _truthy(row.get('rieles_techo_original')):
            s += 15
        if _truthy(row.get('enganche_remolque')) or _truthy(row.get('preparacion_remolque')):
            s += 20
        if _truthy(row.get('apertura_remota_maletero')) or _truthy(row.get('cierre_automatico_maletero')):
            s += 10
        # Tomas de corriente
        p12 = int((_num(row.get('power_12v_count')) or 0))
        p110 = int((_num(row.get('power_110v_count')) or 0))
        if p12 > 0:
            s += min(8.0, p12 * 2.0)
        if p110 > 0:
            s += min(10.0, p110 * 5.0)
        return round(min(100.0, s), 1)

    # ----- Performance -----
    def score_performance(row) -> float:
        hp = _num(row.get('caballos_fuerza')) or 0.0
        seg = segment_from_body_style(str(row.get('body_style','')))
        ref = {'suv': 300.0, 'pickup': 400.0, 'sedan': 280.0, 'hatch': 220.0, 'van': 260.0}.get(seg, 280.0)
        base = 0.0
        if hp > 0:
            base = min(100.0, (hp / ref) * 100.0)
        # Bonus por aceleración (si existe): más rápido => mayor score
        acc = _num(row.get('accel_0_100_s')) or 0.0
        bonus = 0.0
        if acc and acc > 0:
            bonus += max(0.0, min(25.0, (12.0/acc - 1.0) * 100.0 * 0.25))
        vmax = _num(row.get('vmax_kmh')) or 0.0
        if vmax and vmax > 0:
            bonus += min(10.0, max(0.0, (vmax - 180.0) * 0.1))
        # Modo de manejo (texto original) suma pequeño bonus
        if _has_text(row.get('modo_manejo_direccion_original'), 'modo') or _has_text(row.get('header_description'), 'drive mode'):
            bonus += 5.0
        return round(min(100.0, base + bonus), 1)

    # ----- Eficiencia y electrificación -----
    def fuel_bucket(row) -> str:
        s = str(row.get('categoria_combustible_final') or row.get('tipo_de_combustible_original') or '').lower()
        if any(k in s for k in ('bev','eléctrico','electrico')):
            return 'bev'
        if any(k in s for k in ('phev','enchuf')):
            return 'phev'
        if any(k in s for k in ('hev','híbrido','hibrido')):
            return 'hev'
        if 'diesel' in s:
            return 'diesel'
        if 'gasolina' in s or 'petrol' in s or 'nafta' in s:
            return 'gasolina'
        return 'other'

    def score_efficiency(row) -> float:
        b = fuel_bucket(row)
        if b == 'bev':
            return 100.0
        if b == 'phev':
            # si trae KML usa, si no ~85
            kml = _num(row.get('combinado_kml'))
            if not (kml and kml > 0):
                return 85.0
        kml = _num(row.get('combinado_kml')) or 0.0
        if kml <= 0:
            return 0.0
        # Mapear KML 8..20 => 0..100 (clipeado)
        lo, hi = 8.0, 20.0
        val = max(0.0, min(100.0, (kml - lo) / (hi - lo) * 100.0))
        if b == 'hev':
            val = min(100.0, val + 10.0)
        return round(val, 1)

    def score_electrification(row) -> float:
        b = fuel_bucket(row)
        if b == 'bev':
            return 100.0
        if b == 'phev':
            return 80.0
        if b == 'hev':
            return 60.0
        return 0.0

    # Compute columns
    out['equip_p_adas'] = out.apply(score_adas, axis=1)
    out['equip_p_safety'] = out.apply(score_safety, axis=1)
    out['equip_p_comfort'] = out.apply(score_comfort, axis=1)
    out['equip_p_infotainment'] = out.apply(score_infotainment, axis=1)
    out['equip_p_traction'] = out.apply(score_traction, axis=1)
    out['equip_p_utility'] = out.apply(score_utility, axis=1)
    out['equip_p_performance'] = out.apply(score_performance, axis=1)
    out['equip_p_efficiency'] = out.apply(score_efficiency, axis=1)
    out['equip_p_electrification'] = out.apply(score_electrification, axis=1)

    # Warranty score (0..100) si hay columnas
    def score_warranty(row) -> float:
        s = 0.0
        fm = _num(row.get('warranty_full_months')) or 0.0
        fk = _num(row.get('warranty_full_km')) or 0.0
        pm = _num(row.get('warranty_powertrain_months')) or 0.0
        pk = _num(row.get('warranty_powertrain_km')) or 0.0
        rm = _num(row.get('warranty_roadside_months')) or 0.0
        cm = _num(row.get('warranty_corrosion_months')) or 0.0
        em = _num(row.get('warranty_electric_months')) or (_num(row.get('warranty_battery_months')) or 0.0)
        # Normalizaciones típicas
        s += min(30.0, (fm/36.0) * 30.0)
        s += min(10.0, (fk/60000.0) * 10.0) if fk>0 else 0.0
        s += min(25.0, (pm/72.0) * 25.0)
        s += min(10.0, (pk/100000.0) * 10.0) if pk>0 else 0.0
        s += min(10.0, (rm/36.0) * 10.0)
        s += min(5.0, (cm/60.0) * 5.0)
        s += min(10.0, (em/96.0) * 10.0)
        return round(min(100.0, s), 1)

    try:
        out['warranty_score'] = out.apply(score_warranty, axis=1)
    except Exception:
        out['warranty_score'] = 0
    return out


def compute_scores(df: pd.DataFrame) -> pd.DataFrame:
    # Primero calcula pilares por versión con heurística fina
    base = compute_pillars(df)
    # Luego compón score ponderado por segmento
    segs = base.get("body_style","sedan").apply(segment_from_body_style)
    cats = base.get("categoria_combustible_final","")
    scores: list[float] = []
    for i, row in base.iterrows():
        w = WEIGHTS.get(segs.iloc[i], WEIGHTS["sedan"]).copy()
        w = overlay_ev(w, cats.iloc[i])
        # Mapear categorías del WEIGHTS a pilares concretos
        parts = {
            'adas': float(row.get('equip_p_adas', 0) or 0),
            'seguridad': float(row.get('equip_p_safety', 0) or 0),
            'confort': float(row.get('equip_p_comfort', 0) or 0),
            'conectividad': float(row.get('equip_p_infotainment', 0) or 0),
            'multimedia': float(row.get('equip_p_infotainment', 0) or 0),
            'traccion': float(row.get('equip_p_traction', 0) or 0),
            'capacidad': float(row.get('equip_p_utility', 0) or 0),
            'eficiencia': float(row.get('equip_p_efficiency', 0) or 0),
            'electrificacion': float(row.get('equip_p_electrification', 0) or 0),
        }
        s = 0.0
        for cat, wt in w.items():
            s += (wt/100.0) * parts.get(cat, 0.0)
        scores.append(round(s, 1))
    base["equip_score"] = scores
    return base


def fuel_costs(df: pd.DataFrame) -> pd.DataFrame:
    km_anuales = float(os.getenv("KILOMETROS_ANUALES", "20000"))
    precio_magna = float(os.getenv("PRECIO_GASOLINA_MAGNA_LITRO", "23.57"))
    precio_premium = float(os.getenv("PRECIO_GASOLINA_PREMIUM_LITRO", "25.00"))
    precio_diesel = float(os.getenv("PRECIO_DIESEL_LITRO", "25.33"))

    kml_col = os.getenv("NOMBRE_COLUMNA_KML", "combinado_kml").lower()
    fuel_col = os.getenv("NOMBRE_COLUMNA_TIPO_COMBUSTIBLE", "tipo_de_combustible_original").lower()
    if kml_col not in df.columns:
        return df
    def cost(row):
        try:
            kml = float(row.get(kml_col, 0) or 0)
        except Exception:
            kml = 0.0
        if kml <= 0:
            return None
        fuel = str(row.get(fuel_col, "")).lower()
        price = precio_magna
        if "premium" in fuel: price = precio_premium
        if "diesel" in fuel: price = precio_diesel
        if any(k in fuel for k in ("electrico","eléctrico")):
            return 0.0
        litros = (60000.0 / kml)
        return round(litros * price, 2)
    df["fuel_cost_60k_mxn"] = df.apply(cost, axis=1)
    return df


def load_oem_frames() -> List[pd.DataFrame]:
    frames: List[pd.DataFrame] = []
    if not OEM_DIR.exists():
        return frames
    for p in OEM_DIR.rglob("*"):
        if p.suffix.lower() == ".csv":
            try:
                df = pd.read_csv(p, low_memory=False)
                df.columns = [str(c).lower() for c in df.columns]
                frames.append(df)
            except Exception:
                pass
        elif p.suffix.lower() == ".json":
            try:
                obj = json.loads(p.read_text())
                df = pd.json_normalize(obj)
                df.columns = [str(c).lower() for c in df.columns]
                frames.append(df)
            except Exception:
                pass
    return frames


def build_key_cols(df: pd.DataFrame) -> pd.DataFrame:
    for c in ("make","model","version"):
        if c in df.columns:
            df[c] = df[c].astype(str).map(normalize_name)
    if "ano" in df.columns:
        df["ano"] = df["ano"].map(normalize_year)
    return df


def load_aliases() -> pd.DataFrame:
    if ALIASES_FILE.exists():
        ali = pd.read_csv(ALIASES_FILE)
        ali.columns = [str(c).lower() for c in ali.columns]
        for c in ("scope","from_name","to_name","make","model"):
            if c in ali.columns:
                ali[c] = ali[c].astype(str).fillna("").str.strip()
        # normalize names with same rules to maximize hits
        if "from_name" in ali.columns:
            ali["from_name"] = ali["from_name"].map(normalize_name)
        if "to_name" in ali.columns:
            ali["to_name"] = ali["to_name"].map(normalize_name)
        if "make" in ali.columns:
            ali["make"] = ali["make"].map(normalize_name)
        if "model" in ali.columns:
            ali["model"] = ali["model"].map(normalize_name)
        return ali
    return pd.DataFrame(columns=["scope","from_name","to_name","make","model","notes"])


def apply_alias_cols(df: pd.DataFrame, aliases: pd.DataFrame) -> pd.DataFrame:
    if aliases.empty:
        return df
    out = df.copy()
    # make-level
    a_make = aliases[aliases.get("scope","") == "make"]
    if not a_make.empty and "make" in out.columns:
        amap = dict(zip(a_make["from_name"], a_make["to_name"]))
        out["make"] = out["make"].replace(amap)
    # model-level with optional make context
    a_model = aliases[aliases.get("scope","") == "model"]
    if not a_model.empty and {"make","model"}.issubset(out.columns):
        # build dict keyed by (make, from_name)
        amap = { (r.make or None, r.from_name): r.to_name for r in a_model.itertuples(index=False) }
        out["model"] = [ amap.get((m, v), amap.get((None, v), v)) for m, v in zip(out["make"], out["model"]) ]
    # version-level with optional make/model context
    a_ver = aliases[aliases.get("scope","") == "version"]
    if not a_ver.empty and {"version"}.issubset(out.columns):
        # map by most specific: (make, model, from) -> to; then (make, None, from); then (None, None, from)
        rows = list(a_ver.itertuples(index=False))
        def map_version(mk, md, v):
            for r in rows:
                if r.scope != "version":
                    continue
                if r.from_name == v and ((r.make=="" or r.make==mk) and (r.model=="" or r.model==md)):
                    return r.to_name
            return v
        if {"make","model"}.issubset(out.columns):
            out["version"] = [ map_version(m, d, v) for m,d,v in zip(out["make"], out["model"], out["version"]) ]
        else:
            out["version"] = [ map_version("", "", v) for v in out["version"] ]
    return out


def main():
    ENRICHED_DIR.mkdir(parents=True, exist_ok=True)
    OVERRIDES_DIR.mkdir(parents=True, exist_ok=True)
    base_path = DATA / "equipo_veh_limpio_procesado.csv"
    if not base_path.exists():
        raise SystemExit(f"Base catalog not found: {base_path}")
    base = pd.read_csv(base_path, low_memory=False)
    base.columns = [c.lower() for c in base.columns]
    base = build_key_cols(base)
    aliases = load_aliases()
    base = apply_alias_cols(base, aliases)

    # OEM frames (2026 first, then 2025)
    oem_frames = load_oem_frames()
    if oem_frames:
        oem = pd.concat(oem_frames, ignore_index=True, sort=False)
        oem = build_key_cols(oem)
        oem = apply_alias_cols(oem, aliases)
        # filter by years of interest
        if "ano" in oem.columns:
            oem = oem[oem["ano"].isin([2026, 2025])]
        key = [k for k in ("make","model","version","ano") if k in base.columns and k in oem.columns]
        if key:
            # choose most recent duplicate per key if oem has timestamp
            dedup_cols = key
            oem = oem.drop_duplicates(subset=dedup_cols, keep="last")
            # merge non-price fields from OEM into base
            merged = base.merge(oem, on=key, how="left", suffixes=("", "_oem"))
            num_protect = {"msrp","precio_transaccion","caballos_fuerza","longitud_mm"}
            for c in merged.columns:
                if c.endswith("_oem"):
                    src = c
                    dst = c[:-4]
                    if dst in num_protect:
                        # fill only if base is null
                        merged[dst] = merged[dst].where(merged[dst].notna(), merged[src])
                    else:
                        merged[dst] = merged[dst].combine_first(merged[src])
            # drop oem temp columns
            drop_cols = [c for c in merged.columns if c.endswith("_oem")]
            base = merged.drop(columns=drop_cols)

    # Derivados
    base = compute_scores(base)
    base = fuel_costs(base)

    # Metadata
    ts = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    # Ensure metadata columns exist before fillna
    for col, default in (
        ("specs_source", "OEM_OR_JATO"),
        ("specs_updated_at", ts),
        ("price_source", "JATO"),
        ("price_updated_at", ts),
    ):
        if col not in base.columns:
            base[col] = None
        base[col] = base[col].fillna(default)

    # Write versioned
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = ENRICHED_DIR / f"catalog_{stamp}.csv"
    base.to_csv(out, index=False)
    # Symlink swap
    cur = ENRICHED_DIR / "current.csv"
    try:
        if cur.exists() or cur.is_symlink():
            cur.unlink()
        os.symlink(out.name, cur)  # relative link inside directory
    except Exception:
        # fallback: copy
        base.to_csv(cur, index=False)
    print(f"Wrote: {out}")
    print(f"Symlinked: {cur} -> {out.name}")


if __name__ == "__main__":
    main()
