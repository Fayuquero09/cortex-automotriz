#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional
from collections import deque
import os
import sys

from fastapi import FastAPI, HTTPException, Query, WebSocket, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Ensure project root on path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import json
from datetime import datetime, timedelta
from urllib.request import urlopen
from urllib.error import URLError
import unicodedata

try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore


# ----------------------------- App & Static -----------------------------
FRONTEND_DIR = ROOT / "frontend"
FRONTEND_DIST = FRONTEND_DIR / "dist"

app = FastAPI(title="Cortex Automotriz API (clean)")

# Serve built assets if present
assets_dir = FRONTEND_DIST / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")


# CORS for local dev and hosted FE
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index() -> Response:
    """Serve frontend build if available; else 404."""
    path = FRONTEND_DIST / "index.html"
    if path.exists():
        try:
            html = path.read_text(encoding="utf-8")
            return Response(content=html, media_type="text/html; charset=utf-8")
        except Exception:
            return FileResponse(path)
    raise HTTPException(status_code=404, detail="frontend/dist/index.html not found")


# ------------------------------ Audit utils ------------------------------
AUDIT: deque = deque(maxlen=200)


def audit(kind: str, path: str, **kw: Any) -> None:
    try:
        AUDIT.append({"ts": datetime.utcnow().isoformat() + "Z", "kind": kind, "path": path, **kw})
    except Exception:
        pass


@app.get("/_audit/logs")
def audit_logs() -> Dict[str, Any]:
    return {"count": len(AUDIT), "items": list(AUDIT)}


# ------------------------------ Basic config -----------------------------
@app.get("/config")
def get_config() -> Dict[str, Any]:
    def _to_float(name: str, default: float | None = None) -> Optional[float]:
        try:
            v = os.getenv(name)
            if v is None:
                return default
            return float(str(v).strip())
        except Exception:
            return default
    # Optional online fetch for national average prices (MX)
    def _fetch_fuel_prices() -> Dict[str, Any]:
        url = "https://api.datos.gob.mx/v1/precio.gasolina.publico?pageSize=1000"
        try:
            with urlopen(url, timeout=6) as fh:  # nosec - simple public dataset
                import json as _json
                data = _json.loads(fh.read().decode("utf-8"))
            results = data.get("results") or []
            regs = [float(r.get("regular") or 0) for r in results if (r.get("regular") or "").strip()] or [None]
            prems = [float(r.get("premium") or 0) for r in results if (r.get("premium") or "").strip()] or [None]
            dies = [float(r.get("diesel") or 0) for r in results if (r.get("diesel") or "").strip()] or [None]
            def avg(xs):
                xs = [x for x in xs if x and x>0]
                return round(sum(xs)/len(xs), 2) if xs else None
            as_of = None
            try:
                # pick most recent date field if present
                y = max((r.get("fecha") or r.get("date_insert") or "" for r in results))
                as_of = y[:10] if y else None
            except Exception:
                pass
            return {
                "gasolina_magna_litro": avg(regs),
                "gasolina_premium_litro": avg(prems),
                "diesel_litro": avg(dies),
                "as_of": as_of,
                "source": url,
            }
        except Exception:
            return {"source": url, "as_of": None}

    # cache to avoid hitting network often
    _cache = getattr(get_config, "_fuel_cache", None)
    now = datetime.utcnow()
    if not _cache or (now - _cache.get("ts", now - timedelta(days=2))) > timedelta(hours=12):
        get_config._fuel_cache = {"ts": now, "remote": _fetch_fuel_prices()}  # type: ignore[attr-defined]

    remote = getattr(get_config, "_fuel_cache", {}).get("remote", {})  # type: ignore[attr-defined]

    resp = {
        "app": "Cortex Automotriz",
        "title": "Cortex Automotriz",
        "env": os.getenv("APP_ENV", "dev"),
        "version": os.getenv("APP_VERSION", "local"),
        "api_base": "/",
        "ws_url": "/ws",
        "fuel_prices": {
            "gasolina_magna_litro": _to_float("PRECIO_GASOLINA_MAGNA_LITRO", remote.get("gasolina_magna_litro")),
            "gasolina_premium_litro": _to_float("PRECIO_GASOLINA_PREMIUM_LITRO", remote.get("gasolina_premium_litro")),
            "diesel_litro": _to_float("PRECIO_DIESEL_LITRO", remote.get("diesel_litro")),
            "electricidad_kwh": _to_float("PRECIO_ELECTRICIDAD_KWH"),
        },
        "fuel_prices_meta": {
            "as_of": remote.get("as_of"),
            "source": remote.get("source"),
        },
    }
    audit("resp", "/config", body=resp)
    return resp


# ------------------------------- Data loading ----------------------------
CATALOG_PATH_ENV = "RUTA_DATOS_VEHICULOS"
_DF = None
_DF_MTIME = None
def _allowed_years_from_env() -> set[int]:
    """Get allowed model years from env var ANOS_PERMITIDOS, default to {2024,2025,2026}.

    Supports values like "[2024,2025,2026]", "['2024','2025']" or "2024,2025,2026".
    """
    raw = os.getenv("ANOS_PERMITIDOS")
    if not raw:
        return {2024, 2025, 2026}
    try:
        import json as _json
        obj = _json.loads(raw)
        ys = set(int(x) for x in obj)
        return ys or {2024, 2025, 2026}
    except Exception:
        try:
            parts = [p.strip() for p in str(raw).split(',') if p.strip()]
            ys = set(int(p) for p in parts)
            return ys or {2024, 2025, 2026}
        except Exception:
            return {2024, 2025, 2026}

ALLOWED_YEARS = _allowed_years_from_env()
_MAINT_PATH_ENV = "RUTA_DATOS_MANTENIMIENTO"


def _catalog_path() -> Path:
    env = os.getenv(CATALOG_PATH_ENV)
    if env:
        p = Path(env)
        if not p.is_absolute():
            p = ROOT / p
        if p.exists():
            return p
    # default fallbacks
    p1 = ROOT / "data" / "enriched" / "current.csv"
    if p1.exists():
        return p1
    return ROOT / "data" / "equipo_veh_limpio_procesado.csv"


def _load_catalog():
    global _DF, _DF_MTIME
    if pd is None:
        raise HTTPException(status_code=500, detail="pandas not available in environment")
    path = _catalog_path()
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Catalog CSV not found: {path}")
    m = path.stat().st_mtime
    if _DF is None or _DF_MTIME != m:
        df = pd.read_csv(path, low_memory=False)

        def _slug(s: str) -> str:
            s = str(s or "").strip().lower()
            try:
                s = unicodedata.normalize("NFD", s)
                s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
            except Exception:
                pass
            out = []
            for ch in s:
                if ch.isalnum():
                    out.append(ch)
                else:
                    out.append("_")
            s = "".join(out)
            while "__" in s:
                s = s.replace("__", "_")
            return s.strip("_")

        mapping = {c: _slug(c) for c in df.columns}
        df.rename(columns=mapping, inplace=True)
        # common alias fixes
        if "año" in df.columns and "ano" not in df.columns:
            df.rename(columns={"año": "ano"}, inplace=True)
        if "caballos_de_fuerza" in df.columns and "caballos_fuerza" not in df.columns:
            df.rename(columns={"caballos_de_fuerza": "caballos_fuerza"}, inplace=True)
        # normalize basic columns
        for col in ("make", "model", "version"):
            if col in df.columns:
                df[col] = df[col].astype(str)
        if "ano" in df.columns:
            try:
                df["ano"] = df["ano"].astype(int)
            except Exception:
                pass
        # Ensure equip_score exists for charts. If missing, compute a proxy
        try:
            needs_score = ("equip_score" not in df.columns) or df["equip_score"].isna().all()
        except Exception:
            needs_score = True
        if needs_score:
            try:
                # Try to reuse the scoring logic from scripts.enrich_catalog
                from scripts.enrich_catalog import compute_scores  # type: ignore
                df = compute_scores(df)
            except Exception:
                # Fallback: crude proxy using presence of some common features
                try:
                    candidate_cols = [
                        c for c in df.columns
                        if any(k in c for k in (
                            "android", "carplay", "camara", "sensor_punto_ciego",
                            "control_estabilidad", "abs", "techo", "llave_inteligente",
                            "camara_360", "bolsas_aire", "asistente"))
                    ]
                    def _to01(v):
                        s = str(v).strip().lower()
                        if s in ("true","1","si","sí","estandar","estándar","incluido","standard","std"):
                            return 1
                        if s in ("false","0","no","ninguno","na","n/a","no disponible","-"):
                            return 0
                        try:
                            return 1 if float(s)>0 else 0
                        except Exception:
                            return 0
                    if candidate_cols:
                        # Use column-wise map to avoid deprecated DataFrame.applymap
                        score = df[candidate_cols].apply(lambda col: col.map(_to01)).sum(axis=1)
                        # scale to 0..100
                        mx = float(score.max()) if len(score)>0 else 0.0
                        df["equip_score"] = (score * (100.0 / mx)).round(1) if mx>0 else 0
                except Exception:
                    pass
        # Ensure fuel_cost_60k_mxn present (derive from kml + fuel prices if missing)
        try:
            missing_fuel = ("fuel_cost_60k_mxn" not in df.columns) or df["fuel_cost_60k_mxn"].isna().all()
        except Exception:
            missing_fuel = True
        if missing_fuel:
            try:
                from scripts.enrich_catalog import fuel_costs  # type: ignore
                df = fuel_costs(df)
            except Exception:
                pass

        # Merge enriched equipment from vehiculos_todos_flat.csv if present
        try:
            flat = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
            if flat.exists():
                edf = pd.read_csv(flat, low_memory=False)
                edf.columns = [str(c).strip().lower() for c in edf.columns]
                # Normalize common aliases coming from JSON/flat
                try:
                    rename_map = {}
                    # dimensions
                    for src in ["longitud (mm)", "largo (mm)", "longitud_mm", "largo_mm"]:
                        if src in edf.columns: rename_map[src] = "longitud_mm"; break
                    for src in ["ancho (mm)", "anchura (mm)", "ancho_mm", "width_mm", "anchura_mm", "ancho"]:
                        if src in edf.columns: rename_map[src] = "ancho_mm"; break
                    for src in ["altura (mm)", "alto (mm)", "altura_mm", "alto_mm", "height_mm", "alto"]:
                        if src in edf.columns: rename_map[src] = "altura_mm"; break
                    # performance metrics
                    for c in list(edf.columns):
                        lc = str(c).lower()
                        if ("0-100" in lc or "0–100" in lc or "0 a 100" in lc) and ("s" in lc or "seg" in lc):
                            rename_map[c] = "accel_0_100_s"
                    if "velocidad_maxima_kmh" in edf.columns and "vmax_kmh" not in edf.columns:
                        rename_map["velocidad_maxima_kmh"] = "vmax_kmh"
                    if "v_max_kmh" in edf.columns and "vmax_kmh" not in edf.columns:
                        rename_map["v_max_kmh"] = "vmax_kmh"
                    # images
                    if "photo path" in edf.columns and "images_default" not in edf.columns:
                        rename_map["photo path"] = "images_default"
                    if rename_map:
                        edf.rename(columns=rename_map, inplace=True)
                except Exception:
                    pass
                # build join keys upper
                def up(s):
                    return str(s or "").strip().upper()
                if {"make","model"}.issubset(edf.columns):
                    edf["__mk"] = edf["make"].map(up)
                    edf["__md"] = edf["model"].map(up)
                if "version" in edf.columns:
                    edf["__vr"] = edf["version"].map(up)
                if "ano" in edf.columns:
                    edf["__yr"] = pd.to_numeric(edf["ano"], errors="coerce").astype("Int64")

                # Optional: enrich with raw JSON if available (for dimensions/accel)
                try:
                    # Consider multiple JSON candidates (prefer newest curated files)
                    json_candidates = [
                        ROOT / "data" / "vehiculos-todos.json",
                        ROOT / "data" / "versiones95_full_merged.json",
                        ROOT / "data" / "versiones95_full.json",
                        ROOT / "data" / "versiones95_2024_2026.json",
                    ]
                    raw_json = next((p for p in json_candidates if p.exists()), None)
                    if raw_json and raw_json.exists():
                        import json as _json
                        with raw_json.open("r", encoding="utf-8") as f:
                            arr = _json.load(f)
                        jdf = pd.DataFrame(arr)
                        jdf.columns = [str(c).strip().lower() for c in jdf.columns]
                        # basic columns
                        aliases = {}
                        if "make" not in jdf.columns and "marca" in jdf.columns: aliases["marca"] = "make"
                        if "model" not in jdf.columns and "modelo" in jdf.columns: aliases["modelo"] = "model"
                        if "version" not in jdf.columns and "versión" in jdf.columns: aliases["versión"] = "version"
                        if "ano" not in jdf.columns and "año" in jdf.columns: aliases["año"] = "ano"
                        # dimensions & performance
                        for src in ["longitud (mm)", "largo (mm)", "longitud_mm", "largo_mm"]:
                            if src in jdf.columns: aliases[src] = "longitud_mm"; break
                        for src in ["ancho (mm)", "anchura (mm)", "ancho_mm", "anchura_mm", "width_mm", "ancho"]:
                            if src in jdf.columns: aliases[src] = "ancho_mm"; break
                        for src in ["altura (mm)", "alto (mm)", "altura_mm", "alto_mm", "height_mm", "alto"]:
                            if src in jdf.columns: aliases[src] = "altura_mm"; break
                        if "photo path" in jdf.columns and "images_default" not in jdf.columns:
                            aliases["photo path"] = "images_default"
                        if aliases:
                            jdf.rename(columns=aliases, inplace=True)
                        # detect accel columns heuristically
                        for c in list(jdf.columns):
                            lc = str(c).lower()
                            if ("0-100" in lc or "0–100" in lc or "0 a 100" in lc) and ("s" in lc or "seg" in lc):
                                jdf.rename(columns={c: "accel_0_100_s"}, inplace=True)
                        # build keys
                        if {"make","model"}.issubset(jdf.columns):
                            jdf["__mk"] = jdf["make"].map(up)
                            jdf["__md"] = jdf["model"].map(up)
                        if "version" in jdf.columns:
                            jdf["__vr"] = jdf["version"].map(up)
                        if "ano" in jdf.columns:
                            jdf["__yr"] = pd.to_numeric(jdf["ano"], errors="coerce").astype("Int64")
                        # keep only useful columns to avoid duplications
                        keep = [c for c in jdf.columns if c in {
                            "make","model","version","ano","__mk","__md","__vr","__yr",
                            # dimensiones y desempeño
                            "longitud_mm","ancho_mm","altura_mm","accel_0_100_s","vmax_kmh",
                            # imagen
                            "images_default",
                            # infotainment y conectividad
                            "audio_brand","speakers_count","screen_main_in","screen_cluster_in",
                            "usb_a_count","usb_c_count","power_12v_count","power_110v_count","wireless_charging",
                            # garantías
                            "warranty_full_months","warranty_full_km","warranty_powertrain_months","warranty_powertrain_km",
                            "warranty_roadside_months","warranty_roadside_km","warranty_corrosion_months","warranty_corrosion_km",
                            "warranty_electric_months","warranty_electric_km","warranty_battery_months","warranty_battery_km",
                            # pilares precalculados del JSON (si existieran)
                            "equip_p_adas","equip_p_safety","equip_p_comfort","equip_p_infotainment",
                            "equip_p_traction","equip_p_utility","equip_p_performance","equip_p_efficiency","equip_p_electrification",
                        }]
                        if keep:
                            edf = pd.concat([edf, jdf[keep]], ignore_index=True, sort=False)
                            # collapse duplicates by key preferring first non-null
                            if {"__mk","__md","__yr"}.issubset(edf.columns):
                                gb_keys = ["__mk","__md","__yr"] + (["__vr"] if "__vr" in edf.columns else [])
                                edf = edf.groupby(gb_keys, dropna=False).first().reset_index()
                except Exception:
                    pass

                left = df.copy()
                if {"make","model"}.issubset(left.columns):
                    left["__mk"] = left["make"].astype(str).map(up)
                    left["__md"] = left["model"].astype(str).map(up)
                if "version" in left.columns:
                    left["__vr"] = left["version"].astype(str).map(up)
                if "ano" in left.columns:
                    left["__yr"] = pd.to_numeric(left["ano"], errors="coerce").astype("Int64")

                # prefer version-level join, then model-level
                cols_to_merge = [c for c in edf.columns if c not in {"make","model","version","ano","__mk","__md","__vr","__yr"}]
                if "__vr" in left.columns and "__vr" in edf.columns:
                    left = left.merge(edf[["__mk","__md","__yr","__vr", *cols_to_merge]], on=["__mk","__md","__yr","__vr"], how="left", suffixes=("", "_from_json"))
                else:
                    left = left.merge(edf[["__mk","__md","__yr", *cols_to_merge]], on=["__mk","__md","__yr"], how="left", suffixes=("", "_from_json"))

                # Adopt better fields when faltan o son 0
                def take_json(col: str):
                    j = f"{col}_from_json"
                    if j in left.columns:
                        if col not in left.columns:
                            left[col] = left[j]
                        else:
                            try:
                                base = pd.to_numeric(left[col], errors="coerce")
                                new = pd.to_numeric(left[j], errors="coerce")
                                left[col] = left[col].where(~(base.isna() | (base == 0)), new)
                            except Exception:
                                left[col] = left[col].where(left[col].notna(), left[j])
                        left.drop(columns=[j], inplace=True, errors="ignore")

                take_json("equip_score")
                take_json("combinado_kml")
                take_json("ciudad_kml")
                take_json("carretera_kml")
                take_json("body_style")
                # performance metrics
                take_json("caballos_fuerza")
                take_json("torque_nm")
                take_json("accel_0_100_s")
                take_json("vmax_kmh")
                # dimensions & image
                take_json("longitud_mm")
                take_json("ancho_mm")
                take_json("altura_mm")
                take_json("images_default")
                # infotainment details (copy from _from_json if present)
                for _c in [
                    "audio_brand","speakers_count","screen_main_in","screen_cluster_in",
                    "usb_a_count","usb_c_count","power_12v_count","power_110v_count","wireless_charging",
                    "warranty_full_months","warranty_full_km","warranty_powertrain_months","warranty_powertrain_km",
                    "warranty_roadside_months","warranty_roadside_km","warranty_corrosion_months","warranty_corrosion_km",
                    "warranty_electric_months","warranty_electric_km","warranty_battery_months","warranty_battery_km"
                ]:
                    j = f"{_c}_from_json"
                    if j in left.columns and _c not in left.columns:
                        left.rename(columns={j: _c}, inplace=True)
                # propagate feature flags and pillar scores (copy if not present)
                for c in cols_to_merge:
                    if c.endswith("_from_json"):
                        continue
                    if (c.startswith("feat_") or c.startswith("equip_p_")) and c not in left.columns:
                        left[c] = left[f"{c}_from_json"] if f"{c}_from_json" in left.columns else left.get(c)
                    left.drop(columns=[f"{c}_from_json"], inplace=True, errors="ignore")

                df = left

                # Compute warranty_score on the fly if missing or zeroed
                try:
                    need_ws = ("warranty_score" not in df.columns) or df["warranty_score"].fillna(0).eq(0).all()
                except Exception:
                    need_ws = True
                if need_ws:
                    try:
                        def _num(v):
                            try:
                                return float(v)
                            except Exception:
                                return None
                        def _ws_row(r):
                            fm = _num(r.get("warranty_full_months")) or 0.0
                            fk = _num(r.get("warranty_full_km")) or 0.0
                            pm = _num(r.get("warranty_powertrain_months")) or 0.0
                            pk = _num(r.get("warranty_powertrain_km")) or 0.0
                            rm = _num(r.get("warranty_roadside_months")) or 0.0
                            cm = _num(r.get("warranty_corrosion_months")) or 0.0
                            em = _num(r.get("warranty_electric_months")) or (_num(r.get("warranty_battery_months")) or 0.0)
                            s = 0.0
                            s += min(30.0, (fm/36.0) * 30.0)
                            s += min(10.0, (fk/60000.0) * 10.0) if fk>0 else 0.0
                            s += min(25.0, (pm/72.0) * 25.0)
                            s += min(10.0, (pk/100000.0) * 10.0) if pk>0 else 0.0
                            s += min(10.0, (rm/36.0) * 10.0)
                            s += min(5.0, (cm/60.0) * 5.0)
                            s += min(10.0, (em/96.0) * 10.0)
                            return round(s, 1)
                        df["warranty_score"] = df.apply(_ws_row, axis=1)
                    except Exception:
                        pass
        except Exception:
            pass

        # Try to merge maintenance costs (service_cost_60k_mxn)
        try:
            maint_env = os.getenv(_MAINT_PATH_ENV)
            # Fallback sensible si no se define la variable de entorno
            candidates = []
            if maint_env:
                mp = Path(maint_env)
                if not mp.is_absolute():
                    mp = ROOT / mp
                candidates.append(mp)
            # default local path
            candidates.append(ROOT / "data" / "costos_mantenimiento.csv")
            mp = next((p for p in candidates if p.exists()), None)
            if mp is not None and mp.exists():
                mdf = pd.read_csv(mp, low_memory=False)
                mdf.columns = [str(c).strip().lower() for c in mdf.columns]
                # normalize expected columns
                col_map = {}
                if "make" not in mdf.columns and "marca" in mdf.columns: col_map["marca"] = "make"
                if "model" not in mdf.columns and "modelo" in mdf.columns: col_map["modelo"] = "model"
                if "version" not in mdf.columns and "versión" in mdf.columns: col_map["versión"] = "version"
                if "ano" not in mdf.columns and "año" in mdf.columns: col_map["año"] = "ano"
                if "60000" in mdf.columns: col_map["60000"] = "service_cost_60k_mxn"
                if col_map:
                    mdf.rename(columns=col_map, inplace=True)
                # coerce types
                for c in ("make","model","version"):
                    if c in mdf.columns:
                        mdf[c] = mdf[c].astype(str)
                if "ano" in mdf.columns:
                    mdf["ano"] = pd.to_numeric(mdf["ano"], errors="coerce")
                if "service_cost_60k_mxn" in mdf.columns:
                    # strip $ and commas
                    mdf["service_cost_60k_mxn"] = (
                        mdf["service_cost_60k_mxn"].astype(str).str.replace("$","", regex=False)
                            .str.replace(",","", regex=False)
                    )
                    mdf["service_cost_60k_mxn"] = pd.to_numeric(mdf["service_cost_60k_mxn"], errors="coerce")
                # Build normalized join keys (upper)
                def up(s):
                    return str(s or "").strip().upper()
                if {"make","model","ano"}.issubset(mdf.columns):
                    mdf["__mk"] = mdf["make"].map(up)
                    mdf["__md"] = mdf["model"].map(up)
                    # compact model (remove non-alnum) to improve matches like "4 RUNNER" vs "4RUNNER"
                    import re as _re
                    mdf["__mdc"] = mdf["__md"].map(lambda s: _re.sub(r"[^A-Z0-9]", "", str(s)))
                    mdf["__yr"] = mdf["ano"].astype("Int64")
                    if "version" in mdf.columns:
                        mdf["__vr"] = mdf["version"].map(up)
                    # First do (mk, md, yr, vr)
                    left = df.copy()
                    if {"make","model"}.issubset(left.columns):
                        left["__mk"] = left["make"].astype(str).map(up)
                        left["__md"] = left["model"].astype(str).map(up)
                        import re as _re
                        left["__mdc"] = left["__md"].map(lambda s: _re.sub(r"[^A-Z0-9]", "", str(s)))
                    if "ano" in left.columns:
                        left["__yr"] = pd.to_numeric(left["ano"], errors="coerce").astype("Int64")
                    if "version" in left.columns:
                        left["__vr"] = left["version"].astype(str).map(up)
                    svc = None
                    if "__vr" in left.columns and "__vr" in mdf.columns:
                        svc = mdf[["__mk","__md","__yr","__vr","service_cost_60k_mxn"]]
                        left = left.merge(svc, on=["__mk","__md","__yr","__vr"], how="left")
                    else:
                        left["service_cost_60k_mxn"] = None
                    # Fill missing by (mk, md, yr)
                    try:
                        # merge by (make, model, year)
                        svc2 = mdf.groupby(["__mk","__md","__yr"], dropna=False)["service_cost_60k_mxn"].first().reset_index()
                        left = left.merge(svc2, on=["__mk","__md","__yr"], how="left", suffixes=("", "_by_model"))
                        left["service_cost_60k_mxn"] = left["service_cost_60k_mxn"].combine_first(left.get("service_cost_60k_mxn_by_model"))
                        left.drop(columns=[c for c in left.columns if c.endswith("_by_model")], inplace=True, errors="ignore")
                        # if still missing, try compact model join (make, modelC, year)
                        missing_mask = left["service_cost_60k_mxn"].isna()
                        if missing_mask.any():
                            svc3 = mdf.groupby(["__mk","__mdc","__yr"], dropna=False)["service_cost_60k_mxn"].first().reset_index()
                            left = left.merge(svc3, left_on=["__mk","__mdc","__yr"], right_on=["__mk","__mdc","__yr"], how="left", suffixes=("", "_by_model_c"))
                            left["service_cost_60k_mxn"] = left["service_cost_60k_mxn"].combine_first(left.get("service_cost_60k_mxn_by_model_c"))
                            left.drop(columns=[c for c in left.columns if c.endswith("_by_model_c")], inplace=True, errors="ignore")
                        # if still missing, ignore year and match by version when present
                        missing_mask = left["service_cost_60k_mxn"].isna()
                        if missing_mask.any() and "__vr" in left.columns and "__vr" in mdf.columns:
                            # exact version (make, model, version) ignoring year
                            svc4 = mdf.groupby(["__mk","__md","__vr"], dropna=False)["service_cost_60k_mxn"].first().reset_index()
                            left = left.merge(svc4, on=["__mk","__md","__vr"], how="left", suffixes=("", "_by_ver"))
                            left.loc[missing_mask, "service_cost_60k_mxn"] = left.loc[missing_mask, "service_cost_60k_mxn"].combine_first(left.loc[missing_mask, "service_cost_60k_mxn_by_ver"])
                            left.drop(columns=[c for c in left.columns if c.endswith("_by_ver")], inplace=True, errors="ignore")
                        # final fallback: compact model + version, ignoring year
                        missing_mask = left["service_cost_60k_mxn"].isna()
                        if missing_mask.any() and "__vr" in left.columns and "__vr" in mdf.columns:
                            import re as _re
                            mdf["__vrc"] = mdf.get("__vr").map(lambda s: _re.sub(r"[^A-Z0-9]", "", str(s)))
                            left["__vrc"] = left.get("__vr").map(lambda s: _re.sub(r"[^A-Z0-9]", "", str(s)))
                            svc5 = mdf.groupby(["__mk","__mdc","__vrc"], dropna=False)["service_cost_60k_mxn"].first().reset_index()
                            left = left.merge(svc5, left_on=["__mk","__mdc","__vrc"], right_on=["__mk","__mdc","__vrc"], how="left", suffixes=("", "_by_ver_c"))
                            left.loc[missing_mask, "service_cost_60k_mxn"] = left.loc[missing_mask, "service_cost_60k_mxn"].combine_first(left.loc[missing_mask, "service_cost_60k_mxn_by_ver_c"])
                            left.drop(columns=[c for c in left.columns if c.endswith("_by_ver_c")], inplace=True, errors="ignore")
                    except Exception:
                        pass
                    # Sync back
                    if "service_cost_60k_mxn" in left.columns:
                        df["service_cost_60k_mxn"] = left["service_cost_60k_mxn"]
        except Exception:
            pass

        # Merge sales overlay (ventas por modelo/año y share por segmento)
        try:
            sales_path = ROOT / "data" / "ventas_modelo_supabase.csv"
            if sales_path.exists():
                s = pd.read_csv(sales_path, low_memory=False)
                s.columns = [str(c).strip().lower() for c in s.columns]
                # normalize
                if "anio" in s.columns and "ano" not in s.columns:
                    s.rename(columns={"anio": "ano"}, inplace=True)
                if "unidades" in s.columns:
                    s.rename(columns={"unidades": "ventas_unidades"}, inplace=True)
                if "segmento" in s.columns:
                    s.rename(columns={"segmento": "segmento_ventas"}, inplace=True)
                for c in ("make","model"):
                    if c in s.columns:
                        s[c] = s[c].astype(str)
                if "ano" in s.columns:
                    s["ano"] = pd.to_numeric(s["ano"], errors="coerce").astype("Int64")
                if "ventas_unidades" in s.columns:
                    s["ventas_unidades"] = pd.to_numeric(s["ventas_unidades"], errors="coerce")
                # compute segment totals per año
                seg_tot = None
                if {"segmento_ventas","ano","ventas_unidades"}.issubset(s.columns):
                    seg_tot = s.groupby(["segmento_ventas","ano"], dropna=False)["ventas_unidades"].sum().reset_index().rename(columns={"ventas_unidades":"ventas_seg_total"})
                # join by (make,model,ano)
                if {"make","model"}.issubset(df.columns) and "ano" in df.columns and {"make","model","ano"}.issubset(s.columns):
                    left = df.merge(s[["make","model","ano","segmento_ventas","ventas_unidades"]], on=["make","model","ano"], how="left")
                    if seg_tot is not None:
                        left = left.merge(seg_tot, on=["segmento_ventas","ano"], how="left")
                        try:
                            left["ventas_share_seg_pct"] = (pd.to_numeric(left["ventas_unidades"], errors="coerce") / pd.to_numeric(left["ventas_seg_total"], errors="coerce") * 100.0)
                        except Exception:
                            pass
                    df = left
        except Exception:
            pass

        # Merge YTD sales per model from processed monthly file (2025)
        try:
            sales_ytd = ROOT / "data" / "enriched" / "sales_ytd_2025.csv"
            if sales_ytd.exists():
                s = pd.read_csv(sales_ytd, low_memory=False)
                s.columns = [str(c).strip().lower() for c in s.columns]
                def up2(v):
                    return str(v or "").strip().upper()
                s["__mk"] = s.get("make", pd.Series(dtype=str)).map(up2)
                s["__md"] = s.get("model", pd.Series(dtype=str)).map(up2)
                s["__yr"] = pd.to_numeric(s.get("ano"), errors="coerce").astype("Int64")
                left = df.copy()
                if {"make","model"}.issubset(left.columns):
                    left["__mk"] = left["make"].astype(str).map(up2)
                    left["__md"] = left["model"].astype(str).map(up2)
                if "ano" in left.columns:
                    left["__yr"] = pd.to_numeric(left.get("ano"), errors="coerce").astype("Int64")
                cols = [c for c in s.columns if c not in {"make","model","ano","__mk","__md","__yr"}]
                left = left.merge(s[["__mk","__md","__yr", *cols]], on=["__mk","__md","__yr"], how="left")
                df = left
        except Exception:
            pass

        # Ensure a human-readable segment is available even if sales overlay missing
        try:
            if "segmento_ventas" not in df.columns:
                df["segmento_ventas"] = None
            def _norm_seg(s: str) -> str | None:
                s = (s or "").strip().lower()
                if s in {"nan","none","null","", "na", "n/a", "-"}:
                    return None
                # unify common SUV terms
                if any(x in s for x in ("todo terreno","suv","suvs","crossover","sport utility")):
                    return "SUV'S"
                # pickups/camionetas de carga
                if any(x in s for x in ("pick","cab","chasis","camioneta")):
                    return "Pickup"
                if "van" in s:
                    return "Van"
                if "hatch" in s or "hb" in s:
                    return "Hatchback"
                if any(x in s for x in ("sedan","sedán","saloon")):
                    return "Sedán"
                # If nothing matched and input looks bogus (e.g. 'nan'), return None
                return s.title() if s and s != "nan" else None
            if "body_style" in df.columns:
                mask = df["segmento_ventas"].isna() | (df["segmento_ventas"].astype(str).str.strip()=="")
                mapped = df.loc[mask, "body_style"].apply(_norm_seg)
                df.loc[mask, "segmento_ventas"] = mapped
        except Exception:
            pass

        _DF = df
        _DF_MTIME = m
    return _DF


# ------------------------------- API: /options ---------------------------
@app.get("/options")
def get_options(make: Optional[str] = None, model: Optional[str] = None, year: Optional[int] = None) -> Dict[str, Any]:
    df0 = _load_catalog().copy()
    df = df0.copy()
    # Restrict default option sources to allowed years (2024+). However, to avoid empty brand/model lists,
    # compute top-level makes/models from the full catalog (df0) and apply year filtering only for year-specific lists.
    try:
        if "ano" in df.columns:
            df = df[df["ano"].isin(list(ALLOWED_YEARS))]
    except Exception:
        pass
    # If a specific year is requested, filter lists to that year
    if year is not None and "ano" in df.columns:
        try:
            df = df[df["ano"] == int(year)]
        except Exception:
            pass

    def u(x: Optional[str]) -> Optional[str]:
        return x.upper() if isinstance(x, str) else x

    # Use full catalog for global lists to ensure options always show up
    makes_all = sorted(map(str, df0.get("make", pd.Series(dtype=str)).str.upper().dropna().unique().tolist())) if pd is not None else []
    # Robust fallback: if brands list ends up empty, try enriched flat file
    try:
        if (not makes_all) and pd is not None:
            flat = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
            if flat.exists():
                t = pd.read_csv(flat, low_memory=False)
                col = None
                for c in t.columns:
                    lc = str(c).strip().lower()
                    if lc in {"make", "marca"}:
                        col = c; break
                if col is not None:
                    makes_all = sorted(map(str, t[col].astype(str).str.upper().dropna().unique().tolist()))
    except Exception:
        pass
    models_all = sorted(map(str, df0.get("model", pd.Series(dtype=str)).str.upper().dropna().unique().tolist())) if pd is not None else []

    payload: Dict[str, Any] = {
        "makes": makes_all,
        "brands": makes_all,
        "models": models_all,
        "models_all": models_all,
        "selected": {"make": u(make), "model": u(model), "year": year},
        "autofill": {},
    }

    def _filter_years(ys: List[int]) -> List[int]:
        try:
            return sorted([int(y) for y in ys if int(y) in ALLOWED_YEARS])
        except Exception:
            return []

    if model:
        sub = df[df["model"].str.upper() == model.upper()]
        mf = sorted(sub["make"].str.upper().dropna().unique().tolist()) if len(sub) else []
        years_all = sorted(sub.get("ano", pd.Series(dtype=int)).dropna().unique().tolist()) if len(sub) else []
        years = _filter_years(years_all)
        payload["makes_for_model"] = mf
        payload["years"] = years
        if years:
            payload["autofill"]["default_year"] = max(years)
        if mf:
            payload["autofill"]["make_from_model"] = mf[0]
        if year:
            submy = sub[sub.get("ano") == int(year)] if "ano" in sub.columns else sub
            if "version" in submy.columns:
                payload["versions"] = sorted(map(str, submy["version"].dropna().unique().tolist()))

    if make and not model:
        sub = df[df["make"].str.upper() == make.upper()]
        models = sorted(sub["model"].str.upper().dropna().unique().tolist()) if len(sub) else []
        years_all = sorted(sub.get("ano", pd.Series(dtype=int)).dropna().unique().tolist()) if len(sub) else []
        years = _filter_years(years_all)
        payload["models_for_make"] = models
        payload["years"] = years

    audit("resp", "/options", query={"make": make, "model": model, "year": year}, body_keys=list(payload.keys()))
    return payload


# -------------------------------- API: /catalog --------------------------
@app.get("/catalog")
def get_catalog(limit: int = Query(1000, ge=1, le=20000), make: Optional[str] = None, model: Optional[str] = None, year: Optional[int] = None, format: Optional[str] = None, q: Optional[str] = None) -> Any:  # type: ignore
    df = _load_catalog()
    sub = df
    if make:
        sub = sub[sub["make"].str.upper() == make.upper()]
    if model:
        sub = sub[sub["model"].str.upper() == model.upper()]
    if year and "ano" in sub.columns:
        sub = sub[sub["ano"] == int(year)]
    if q:
        try:
            token = str(q).strip().upper()
            mask = None
            for col in ("make","model","version"):
                if col in sub.columns:
                    m = sub[col].astype(str).str.upper().str.contains(token, na=False)
                    mask = m if mask is None else (mask | m)
            if mask is not None:
                sub = sub[mask]
        except Exception:
            pass
    rows = sub.head(limit).where(sub.notna(), None).to_dict(orient="records")
    if (format or "").lower() in {"obj", "object", "json"}:
        return {"count": len(rows), "items": rows, "total": len(rows)}
    return rows


# --------------------------------- Templates (removed) ------------------


# ------------------------------ Compare APIs ----------------------------
NUMERIC_KEYS = [
    "msrp",
    "precio_transaccion",
    "caballos_fuerza",
    "msrp_mxn",
    # incentives / costs / tco
    "bono",
    "bono_mxn",
    "fuel_cost_60k_mxn",
    "service_cost_60k_mxn",
    "tco_60k_mxn",
    "tco_total_60k_mxn",
    "cost_per_hp_mxn",
    # Equipment pillars (0..100)
    "equip_score",
    "equip_p_adas",
    "equip_p_safety",
    "equip_p_comfort",
    "equip_p_infotainment",
    "equip_p_traction",
    "equip_p_utility",
    "equip_p_performance",
    "equip_p_efficiency",
    "equip_p_electrification",
    "warranty_score",
]


@app.post("/compare")
def post_compare(payload: Dict[str, Any]) -> Dict[str, Any]:
    own = payload.get("own") or {}
    competitors = payload.get("competitors") or []
    def to_num(x):
        try:
            return float(x)
        except Exception:
            return None
    # derive Bono = MSRP - precio_transaccion si no viene
    def bonus(row: Dict[str, Any]) -> Optional[float]:
        """Bono válido solo si TX > 0 y TX < MSRP.

        Devuelve None si no hay bono válido.
        """
        p = to_num(row.get("msrp"))
        tx = to_num(row.get("precio_transaccion"))
        if p is None or tx is None:
            return None
        try:
            p = float(p)
            tx = float(tx)
        except Exception:
            return None
        if tx <= 0:
            return None
        if not (tx < p):
            return None
        try:
            return float(p - tx)
        except Exception:
            return None
    # derive TCO if missing: precio_transaccion + service_cost_60k (requerimiento)
    def tco60(row: Dict[str, Any]) -> Optional[float]:
        p = to_num(row.get("precio_transaccion") or row.get("msrp")) or 0.0
        svc = to_num(row.get("service_cost_60k_mxn")) or 0.0
        try:
            return float(p + svc)
        except Exception:
            return None
    # derive TCO total (incluye fuel/energía 60k)
    def tco60_total(row: Dict[str, Any]) -> Optional[float]:
        base = tco60(row) or 0.0
        fuel = to_num(row.get("fuel_cost_60k_mxn")) or 0.0
        try:
            return float(base + fuel)
        except Exception:
            return None
    # derive cost per HP (MXN/HP)
    def cost_per_hp(row: Dict[str, Any]) -> Optional[float]:
        price = to_num(row.get("precio_transaccion") or row.get("msrp"))
        hp = to_num(row.get("caballos_fuerza"))
        if (price is None) or (hp is None) or hp == 0:
            return None
        try:
            return float(price / hp)
        except Exception:
            return None
    # Calcular/normalizar bono según regla TX>0 y TX<MSRP
    b = bonus(own)
    if b is not None:
        own["bono"] = b
    else:
        # remover bono inválido
        try:
            if "bono" in own: del own["bono"]
            if "bono_mxn" in own: del own["bono_mxn"]
        except Exception:
            pass
    if own.get("tco_60k_mxn") is None:
        t = tco60(own)
        if t is not None:
            own["tco_60k_mxn"] = t
    if own.get("tco_total_60k_mxn") is None:
        tt = tco60_total(own)
        if tt is not None:
            own["tco_total_60k_mxn"] = tt
    if own.get("cost_per_hp_mxn") is None:
        cph = cost_per_hp(own)
        if cph is not None:
            own["cost_per_hp_mxn"] = cph
    base = {k: to_num(own.get(k)) for k in NUMERIC_KEYS if k in own}

    # Equipment match based on pillar proximity (0..100)
    def equip_match_pct(base_row: Dict[str, Any], comp_row: Dict[str, Any]) -> Optional[float]:
        """Match de equipo basado en proximidad de pilares (0..100).

        Reglas:
        - Considera solo pilares con datos válidos (>0) en ambos vehículos.
        - Si hay al menos 2 pilares válidos, usa el promedio de |Δ| y calcula 100-Δ.
        - Si no hay suficientes pilares válidos, cae a equip_score (si ambos >0).
        - Si tampoco hay equip_score usable, devuelve None.
        """
        try:
            # usar columnas que empiezan con equip_p_
            b_keys = [k for k in base_row.keys() if str(k).startswith("equip_p_")]
            c_keys = [k for k in comp_row.keys() if str(k).startswith("equip_p_")]
            keys = sorted(set(b_keys) & set(c_keys))
            diffs: list[float] = []
            for k in keys:
                b = to_num(base_row.get(k))
                c = to_num(comp_row.get(k))
                # tratar 0 y NaN como "sin dato" para evitar falsos 100%
                if b is None or c is None:
                    continue
                try:
                    bf = float(b)
                    cf = float(c)
                except Exception:
                    continue
                if bf <= 0.0 or cf <= 0.0:
                    continue
                # límites razonables 0..100
                if not (0.0 <= bf <= 100.0 and 0.0 <= cf <= 100.0):
                    continue
                diffs.append(abs(bf - cf))
            # Usar pilares solo si hay señal suficiente (>=2)
            if len(diffs) >= 2:
                diff = sum(diffs) / float(len(diffs))
                m = max(0.0, 100.0 - diff)
                return round(m, 1)
            # Fallback: equip_score (solo si ambos >0)
            bs = to_num(base_row.get("equip_score"))
            cs = to_num(comp_row.get("equip_score"))
            try:
                bf = float(bs) if bs is not None else None
                cf = float(cs) if cs is not None else None
            except Exception:
                bf = cf = None  # type: ignore
            if bf is not None and cf is not None and bf > 0.0 and cf > 0.0:
                d = abs(bf - cf)
                return round(max(0.0, 100.0 - d), 1)
            return None
        except Exception:
            return None
    comps = []
    # Helper truthy
    def _truthy(v: Any) -> bool:
        s = str(v).strip().lower()
        return s in {"true","1","si","sí","estandar","estándar","incluido","standard","std","present","x","y"}

    for c in competitors:
        # Calcular/normalizar bono
        b = bonus(c)
        if b is not None:
            c["bono"] = b
        else:
            try:
                if "bono" in c: del c["bono"]
                if "bono_mxn" in c: del c["bono_mxn"]
            except Exception:
                pass
        if c.get("tco_60k_mxn") is None:
            t = tco60(c)
            if t is not None:
                c["tco_60k_mxn"] = t
        if c.get("tco_total_60k_mxn") is None:
            tt = tco60_total(c)
            if tt is not None:
                c["tco_total_60k_mxn"] = tt
        if c.get("cost_per_hp_mxn") is None:
            cph = cost_per_hp(c)
            if cph is not None:
                c["cost_per_hp_mxn"] = cph
        # include equipment match pct
        match = equip_match_pct(own, c)
        if match is not None:
            c["equip_match_pct"] = match
        # Build feature differences vs base
        diffs: Dict[str, Any] = {"features_plus": [], "features_minus": [], "numeric_diffs": []}
        try:
            base_row = own
            comp_row = c
            feature_map = {
                "alerta_colision": "Frenado de emergencia",
                "sensor_punto_ciego": "Punto ciego",
                "tiene_camara_punto_ciego": "Cámara punto ciego",
                "camara_360": "Cámara 360",
                "asistente_estac_frontal": "Asistente estac. frontal",
                "asistente_estac_trasero": "Asistente estac. trasero",
                "control_frenado_curvas": "Frenado en curvas",
                "llave_inteligente": "Llave inteligente",
                "tiene_pantalla_tactil": "Pantalla táctil",
                "android_auto": "Android Auto",
                "apple_carplay": "Apple CarPlay",
                "techo_corredizo": "Techo corredizo",
                "apertura_remota_maletero": "Portón eléctrico",
                "cierre_automatico_maletero": "Cierre portón",
                "limpiaparabrisas_lluvia": "Limpia automático",
                "rieles_techo": "Rieles de techo",
                "tercera_fila": "3ª fila asientos",
                "enganche_remolque": "Enganche remolque",
                "preparacion_remolque": "Preparación remolque",
                "asientos_calefaccion_conductor": "Asiento conductor calefacción",
                "asientos_calefaccion_pasajero": "Asiento pasajero calefacción",
                "asientos_ventilacion_conductor": "Asiento conductor ventilación",
                "asientos_ventilacion_pasajero": "Asiento pasajero ventilación",
            }
            for col, label in feature_map.items():
                b = base_row.get(col)
                d = comp_row.get(col)
                if b is None and d is None:
                    continue
                bt = _truthy(b)
                dt = _truthy(d)
                if dt and not bt:
                    diffs["features_plus"].append(label)
                if bt and not dt:
                    diffs["features_minus"].append(label)
            # Numeric comparisons
            num_map = [
                ("bocinas", "Bocinas"),
                ("speakers_count", "Bocinas"),
                ("screen_main_in", "Pantalla central (in)"),
                ("screen_cluster_in", "Clúster (in)"),
                ("usb_a_count", "USB-A"),
                ("usb_c_count", "USB-C"),
                ("power_12v_count", "Tomas 12V"),
                ("power_110v_count", "Tomas 110V"),
            ]
            seen_labels = set()
            for col, label in num_map:
                try:
                    b = base_row.get(col)
                    d = comp_row.get(col)
                    if b is None and d is None:
                        continue
                    # prefer integers if possible
                    import math
                    def _to_num(x):
                        try:
                            return float(x)
                        except Exception:
                            return None
                    bn = _to_num(b)
                    dn = _to_num(d)
                    if bn is None and dn is None:
                        continue
                    if bn != dn:
                        # avoid duplicate Bocinas if both columns exist
                        if label in seen_labels:
                            continue
                        seen_labels.add(label)
                        diffs["numeric_diffs"].append({"label": label, "own": bn, "comp": dn})
                except Exception:
                    pass
        except Exception:
            pass

        item = {"item": c}
        deltas = {}
        for k, b in base.items():
            v = to_num(c.get(k))
            if b is not None and v is not None:
                deltas[k] = {"delta": v - b, "delta_pct": ((v - b) / b * 100) if b else None}
        item["deltas"] = deltas
        item["diffs"] = diffs
        comps.append(item)
    audit("resp", "/compare", body={"competitors": len(comps)})
    return {"own": own, "competitors": comps}


@app.post("/auto_competitors")
def auto_competitors(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Very simple auto-selection using price similarity and optional filters.

    Body: { own: {...}, k?: int, same_segment?: bool, same_propulsion?: bool }
    """
    df0 = _load_catalog().copy()
    df = df0.copy()
    # limit years of interest if present
    if "ano" in df.columns:
        try:
            df = df[df["ano"].isin(list(ALLOWED_YEARS))]
        except Exception:
            pass
    own = payload.get("own") or {}
    k = int(payload.get("k", 3) or 3)
    same_segment = bool(payload.get("same_segment") or False)
    same_propulsion = bool(payload.get("same_propulsion") or False)
    include_same_brand = bool(payload.get("include_same_brand") or False)
    include_different_years = bool(payload.get("include_different_years") or False)
    min_match_pct = None
    try:
        v = payload.get("min_match_pct")
        if v is not None:
            min_match_pct = float(v)
    except Exception:
        min_match_pct = None

    def u(x):
        return str(x or "").upper()

    mk = u(own.get("make"))
    md = u(own.get("model"))
    yr = int(own.get("ano")) if own.get("ano") else None

    if mk and not include_same_brand:
        df = df[df["make"].str.upper() != mk]  # exclude same brand by default
    if md and yr is not None:
        # exclude the same exact model-year
        if "ano" in df.columns:
            df = df[~((df["model"].str.upper() == md) & (df["ano"] == yr))]
    # restrict to same MY unless explicitly allowed
    if (yr is not None) and ("ano" in df.columns) and (not include_different_years):
        try:
            df = df[df["ano"] == yr]
        except Exception:
            pass

    # optional: filter by same segment/body style
    def _segment(s: str) -> str:
        s = (s or "").strip().lower()
        if any(x in s for x in ("pick", "cab")):
            return "pickup"
        if any(x in s for x in ("todo terreno", "suv", "crossover")):
            return "suv"
        if "van" in s:
            return "van"
        if "hatch" in s:
            return "hatch"
        return "sedan"

    if same_segment and "body_style" in df.columns and md:
        try:
            base_seg = None
            base = df0[(df0["model"].str.upper() == md) & ((df0["ano"] == yr) if yr is not None and "ano" in df0.columns else True)]
            if not base.empty:
                base_seg = _segment(str(base.iloc[0].get("body_style", "")))
            if base_seg:
                df = df[df["body_style"].map(lambda v: _segment(str(v))) == base_seg]
        except Exception:
            pass

    # optional: filter by same propulsion bucket
    def _prop_bucket(s: str) -> str:
        s = (s or "").lower()
        if any(k in s for k in ("bev", "eléctrico", "electrico")):
            return "bev"
        if any(k in s for k in ("phev", "enchuf")):
            return "phev"
        if any(k in s for k in ("hev", "híbrido", "hibrido")):
            return "hev"
        if any(k in s for k in ("diesel", "gasolina", "nafta", "petrol")):
            return "ice"
        return "other"

    if same_propulsion and "categoria_combustible_final" in df.columns and md:
        try:
            base = df0[(df0["model"].str.upper() == md) & ((df0["ano"] == yr) if yr is not None and "ano" in df0.columns else True)]
            if not base.empty:
                bucket = _prop_bucket(str(base.iloc[0].get("categoria_combustible_final", "")))
                if bucket:
                    df = df[df["categoria_combustible_final"].map(lambda v: _prop_bucket(str(v))) == bucket]
        except Exception:
            pass

    # Length and score constraints (combined)
    def _to_float(x):
        try:
            return float(x)
        except Exception:
            return None

    max_len_pct = _to_float(payload.get("max_length_pct"))
    max_len_mm = _to_float(payload.get("max_length_mm"))
    score_diff_pct = _to_float(payload.get("score_diff_pct"))
    # Override: if min_match_pct provided, ignore specific length/score filters here
    try:
        _ov = payload.get("min_match_pct")
        if _ov is not None and str(_ov) != "":
            max_len_pct = None
            max_len_mm = None
            score_diff_pct = None
    except Exception:
        pass

    # Determine own metrics from provided payload or catalog baseline
    own_len = _to_float(own.get("longitud_mm"))
    own_score = _to_float(own.get("equip_score"))
    if (own_len is None or own_score is None) and md:
        try:
            base = df0[(df0["model"].str.upper() == md) & ((df0["ano"] == yr) if yr is not None and "ano" in df0.columns else True)]
            if own_len is None and "longitud_mm" in df0.columns and not base.empty:
                own_len = _to_float(base.iloc[0].get("longitud_mm"))
            if own_score is None and "equip_score" in df0.columns and not base.empty:
                own_score = _to_float(base.iloc[0].get("equip_score"))
        except Exception:
            pass

    # Apply length filter
    if (own_len is not None) and (max_len_pct is not None or max_len_mm is not None) and "longitud_mm" in df.columns:
        try:
            mm_limit = max_len_mm if max_len_mm is not None else float("inf")
            pct_limit = (own_len * (max_len_pct or 0) / 100.0) if max_len_pct is not None else float("inf")
            lim = mm_limit if mm_limit < pct_limit else pct_limit
            diffs = (pd.to_numeric(df["longitud_mm"], errors="coerce") - own_len).abs()
            df = df.assign(_len_diff=diffs)
            df = df[df["_len_diff"] <= lim]
        except Exception:
            pass

    # Apply equip score band
    if (own_score is not None) and (score_diff_pct is not None) and "equip_score" in df.columns:
        try:
            band = abs(own_score) * (score_diff_pct / 100.0)
            scores = pd.to_numeric(df["equip_score"], errors="coerce")
            df = df.assign(_score_diff=(scores - own_score).abs())
            df = df[df["_score_diff"] <= band]
        except Exception:
            pass

    # Length and score constraints (combined)
    try:
        own_price = float(own.get("precio_transaccion") or own.get("msrp") or 0)
    except Exception:
        own_price = 0.0
    if own_price and ("msrp" in df.columns or "precio_transaccion" in df.columns):
        price_col = "precio_transaccion" if "precio_transaccion" in df.columns else "msrp"
        prices = pd.to_numeric(df[price_col], errors="coerce")
        df = df.assign(_dist=(prices - own_price).abs())
        df = df.dropna(subset=["_dist"])  # ensure sortable
        out = df.sort_values(by=["_dist"]).head(k)
    else:
        out = df.head(k)
    # Overall match percentage (price, length, score)
    try:
        comps = []
        if own_price:
            price_col = "precio_transaccion" if "precio_transaccion" in df.columns else ("msrp" if "msrp" in df.columns else None)
            if price_col:
                price_series = pd.to_numeric(df[price_col], errors="coerce")
                comps.append((price_series.sub(own_price).abs().div(own_price).mul(100)))
        if (own_len is not None) and ("longitud_mm" in df.columns):
            len_series = pd.to_numeric(df["longitud_mm"], errors="coerce")
            comps.append((len_series.sub(own_len).abs().div(own_len).mul(100)))
        if (own_score is not None) and ("equip_score" in df.columns):
            score_series = pd.to_numeric(df["equip_score"], errors="coerce")
            denom = own_score if (own_score and own_score != 0) else 100.0
            comps.append((score_series.sub(own_score).abs().div(denom).mul(100)))
        if comps:
            mat = pd.concat(comps, axis=1)
            avg = mat.mean(axis=1, skipna=True)
            df["_match"] = 100.0 - avg.clip(lower=0.0, upper=100.0)
            if min_match_pct is not None:
                df = df[df["_match"] >= float(min_match_pct)]
    except Exception:
        pass

    # drop helper columns
    for c in ["_dist","_len_diff","_score_diff"]:
        if c in out.columns:
            out = out.drop(columns=[c], errors="ignore")
    rows = out.where(out.notna(), None).to_dict(orient="records")
    audit("resp", "/auto_competitors", body={"returned": len(rows)})
    return {"items": rows, "count": len(rows)}


# ------------------------------ Version Diffs -----------------------------
@app.get("/version_diffs")
def version_diffs(make: Optional[str] = None, model: Optional[str] = None, year: Optional[int] = None, base_version: Optional[str] = None) -> Dict[str, Any]:
    """Compare versiones de un mismo modelo (y año opcional) para análisis de price position.

    Params:
      - make (opcional)
      - model (requerido)
      - year (opcional)
      - base_version (opcional)
    """
    if not model:
        raise HTTPException(status_code=400, detail="model es requerido")
    df = _load_catalog().copy()
    for c in ("make","model","version"):
        if c in df.columns:
            df[c] = df[c].astype(str)
    sub = df[df["model"].str.upper() == model.upper()].copy()
    if make:
        sub = sub[sub["make"].str.upper() == make.upper()]
    if year is not None and "ano" in sub.columns:
        try:
            sub = sub[pd.to_numeric(sub["ano"], errors="coerce") == int(year)]
        except Exception:
            pass
    if sub.empty:
        return {"base": None, "items": [], "count": 0}

    # pick base
    base_row = None
    if base_version:
        base_row = sub[sub["version"].str.upper() == base_version.upper()].head(1)
    if base_row is None or len(base_row) == 0:
        price_col = "precio_transaccion" if "precio_transaccion" in sub.columns else ("msrp" if "msrp" in sub.columns else None)
        if price_col:
            try:
                base_row = sub.sort_values(by=[price_col], ascending=True, na_position="last").head(1)
            except Exception:
                base_row = sub.head(1)
        else:
            base_row = sub.head(1)
    if base_row is None or len(base_row) == 0:
        return {"base": None, "items": [], "count": 0}
    base = base_row.iloc[0].to_dict()

    def to_num(x):
        try:
            return float(x)
        except Exception:
            return None

    def _truthy(v: Any) -> bool:
        s = str(v).strip().lower()
        return s in {"true","1","si","sí","estandar","estándar","incluido","standard","std","present","x","y"}

    items: List[Dict[str, Any]] = []
    for _, r in sub.iterrows():
        row = r.to_dict()
        if all(str(row.get(k, "")).upper() == str(base.get(k, "")).upper() for k in ("make","model","version","ano")):
            continue
        # deltas numéricos
        bnums = {k: to_num(base.get(k)) for k in NUMERIC_KEYS if k in base}
        deltas: Dict[str, Any] = {}
        for k, b in bnums.items():
            v = to_num(row.get(k))
            if b is not None and v is not None:
                deltas[k] = {"delta": v - b, "delta_pct": ((v - b) / b * 100) if b else None}
        # diffs de equipo
        diffs: Dict[str, Any] = {"features_plus": [], "features_minus": [], "numeric_diffs": []}
        feature_map = {
            "alerta_colision": "Frenado de emergencia",
            "sensor_punto_ciego": "Punto ciego",
            "tiene_camara_punto_ciego": "Cámara punto ciego",
            "camara_360": "Cámara 360",
            "asistente_estac_frontal": "Asistente estac. frontal",
            "asistente_estac_trasero": "Asistente estac. trasero",
            "control_frenado_curvas": "Frenado en curvas",
            "llave_inteligente": "Llave inteligente",
            "tiene_pantalla_tactil": "Pantalla táctil",
            "android_auto": "Android Auto",
            "apple_carplay": "Apple CarPlay",
            "techo_corredizo": "Techo corredizo",
            "apertura_remota_maletero": "Portón eléctrico",
            "cierre_automatico_maletero": "Cierre portón",
            "limpiaparabrisas_lluvia": "Limpia automático",
            "rieles_techo": "Rieles de techo",
            "tercera_fila": "3ª fila asientos",
            "enganche_remolque": "Enganche remolque",
            "preparacion_remolque": "Preparación remolque",
            "asientos_calefaccion_conductor": "Asiento conductor calefacción",
            "asientos_calefaccion_pasajero": "Asiento pasajero calefacción",
            "asientos_ventilacion_conductor": "Asiento conductor ventilación",
            "asientos_ventilacion_pasajero": "Asiento pasajero ventilación",
        }
        for col, label in feature_map.items():
            b = base.get(col)
            d = row.get(col)
            if b is None and d is None:
                continue
            bt = _truthy(b)
            dt = _truthy(d)
            if dt and not bt:
                diffs["features_plus"].append(label)
            if bt and not dt:
                diffs["features_minus"].append(label)
        num_map = [
            ("bocinas", "Bocinas"),
            ("speakers_count", "Bocinas"),
            ("screen_main_in", "Pantalla central (in)"),
            ("screen_cluster_in", "Clúster (in)"),
            ("usb_a_count", "USB-A"),
            ("usb_c_count", "USB-C"),
            ("power_12v_count", "Tomas 12V"),
            ("power_110v_count", "Tomas 110V"),
        ]
        seen = set()
        for col, label in num_map:
            b = base.get(col)
            d = row.get(col)
            if b is None and d is None:
                continue
            bn = to_num(b)
            dn = to_num(d)
            if bn == dn:
                continue
            if label in seen:
                continue
            seen.add(label)
            diffs["numeric_diffs"].append({"label": label, "own": bn, "comp": dn})
        items.append({"item": row, "deltas": deltas, "diffs": diffs})

    audit("resp", "/version_diffs", body={"count": len(items)})
    return {"base": base, "items": items, "count": len(items)}


# --------------------------------- Health --------------------------------
@app.get("/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "ts": datetime.utcnow().isoformat() + "Z"}


# ------------------------------- Dashboard --------------------------------
@app.get("/dashboard")
def dashboard() -> Dict[str, Any]:
    """Basic inventory stats for a lightweight dashboard.

    Counts are computed for allowed years (2024+) when possible.
    """
    df = _load_catalog().copy()
    try:
        if "ano" in df.columns:
            df = df[df["ano"].isin(list(ALLOWED_YEARS))]
    except Exception:
        pass
    def nuniq(col: str) -> int:
        try:
            return int(df.get(col, pd.Series(dtype=object)).dropna().astype(str).str.upper().nunique()) if pd is not None else 0
        except Exception:
            return 0
    brands = nuniq("make")
    try:
        if pd is not None and {"make","model"}.issubset(df.columns):
            models = int(df[["make","model"]].dropna().astype(str).apply(lambda r: (r["make"].upper(), r["model"].upper()), axis=1).nunique())
        else:
            models = 0
    except Exception:
        models = 0
    # Count unique versions across years (make, model, version, ano)
    try:
        if pd is not None and {"make","model","version","ano"}.issubset(df.columns):
            tmp = df[["make","model","version","ano"]].copy()
            for c in ("make","model","version"):
                tmp[c] = tmp[c].astype(str).str.strip().str.upper()
            tmp["ano"] = pd.to_numeric(tmp["ano"], errors="coerce").astype("Int64")
            tmp = tmp.dropna(subset=["make","model","version","ano"])  # type: ignore[arg-type]
            versions = int(tmp.drop_duplicates(subset=["make","model","version","ano"]).shape[0])
        else:
            versions = int(len(df))
    except Exception:
        versions = int(len(df))
    with_bonus = 0
    with_bonus_by_year: Dict[int, int] = {}
    try:
        if pd is not None and {"precio_transaccion","msrp"}.issubset(df.columns):
            # Bono válido por versión‑año única: (make, model, version, ano) con algún registro TX>0 y TX<MSRP
            a = pd.to_numeric(df["precio_transaccion"], errors="coerce")
            b = pd.to_numeric(df["msrp"], errors="coerce")
            df2 = df.copy()
            df2["__has_bono"] = (a.notna() & b.notna() & (a > 0) & (a < b))
            if {"make","model","version","ano"}.issubset(df2.columns):
                grp = df2.groupby(["make","model","version","ano"], dropna=False)["__has_bono"].any().reset_index()
                with_bonus = int(grp["__has_bono"].sum())
                try:
                    by = grp.groupby(grp["ano"].astype(int))["__has_bono"].sum()
                    with_bonus_by_year = {int(k): int(v) for k, v in by.to_dict().items()}
                except Exception:
                    with_bonus_by_year = {}
            else:
                with_bonus = int(df2["__has_bono"].sum())
    except Exception:
        pass
    return {
        "brands_count": brands,
        "models_count": models,
        "versions_count": versions,
        "with_bonus_count": with_bonus,
        "with_bonus_by_year": with_bonus_by_year,
    }


# ------------------------------- WebSocket --------------------------------
@app.websocket("/ws")
async def ws_echo(ws: WebSocket):  # simple echo for dev
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_text()
            await ws.send_text(msg)
    except Exception:
        try:
            await ws.close()
        except Exception:
            pass

# ------------------------------- Seasonality API ---------------------------
@app.get("/seasonality")
def seasonality(segment: Optional[str] = Query(None), year: Optional[int] = Query(2025)) -> Dict[str, Any]:
    """Return seasonality by segment for a given year (default 2025).

    Response: { segments: [{ name, months: [{ m, units, share_pct }] }] }
    """
    try:
        # Prefer precomputed sales_ytd_{year}.csv to build seasonality on the fly
        sales_ytd = ROOT / "data" / "enriched" / f"sales_ytd_{year}.csv"
        items: Dict[str, list] = {}
        if sales_ytd.exists() and pd is not None:
            s = pd.read_csv(sales_ytd, low_memory=False)
            s.columns = [str(c).strip().lower() for c in s.columns]
            # We need a segment per model; approximate with body_style/segmento from catalog if available
            seg_map: Dict[tuple, str] = {}
            try:
                flat = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
                if flat.exists():
                    f = pd.read_csv(flat, low_memory=False)
                    f.columns = [str(c).strip().lower() for c in f.columns]
                    if {"make","model"}.issubset(f.columns):
                        def _norm_seg(sv: str) -> str:
                            s0 = (sv or "").strip().lower()
                            if any(x in s0 for x in ("pick","cab","chasis")): return "Pickup"
                            if any(x in s0 for x in ("todo terreno","suv","crossover")): return "SUV'S"
                            if "van" in s0: return "Van"
                            if any(x in s0 for x in ("hatch","hb")): return "Hatchback"
                            if any(x in s0 for x in ("sedan","sedán","saloon")): return "Sedán"
                            return sv
                        ff = f[["make","model","segmento_ventas","body_style"]].dropna(how="all")
                        ff["seg"] = ff["segmento_ventas"].fillna(ff["body_style"]).astype(str).map(_norm_seg)
                        grp = ff.groupby([ff["make"].astype(str).str.upper(), ff["model"].astype(str).str.upper()])["seg"].agg(lambda x: x.value_counts().idxmax())
                        seg_map = {k: v for k, v in grp.to_dict().items()}
            except Exception:
                pass
            def up(x): return str(x or "").strip().upper()
            s["__mk"], s["__md"] = s.get("make"," "), s.get("model"," ")
            s["__mk"], s["__md"] = s["__mk"].map(up), s["__md"].map(up)
            s["seg"] = s.apply(lambda r: seg_map.get((r["__mk"], r["__md"])) or "(sin segmento)", axis=1)
            if segment:
                s = s[s["seg"].str.upper() == segment.upper()]
            # aggregate by month fields ventas_{year}_MM if present, else use ytd columns already month-split
            months_cols = [c for c in s.columns if str(c).startswith(f"ventas_{year}_")]
            if not months_cols:
                # if only YTD present, can't split reliably
                return {"segments": []}
            seg_groups = {}
            for _, row in s.iterrows():
                sg = row.get("seg")
                if sg is None: continue
                m = seg_groups.setdefault(sg, {i:0 for i in range(1,13)})
                for mm in range(1,13):
                    col = f"ventas_{year}_{mm:02d}"
                    try:
                        v = int(float(str(row.get(col) or 0).replace(",","")))
                    except Exception:
                        v = 0
                    m[mm] = m.get(mm,0) + v
            for sg, mon in seg_groups.items():
                total = sum(mon.values()) or 1
                items[sg] = [{"m": mm, "units": mon.get(mm,0), "share_pct": round(mon.get(mm,0)/total*100,2)} for mm in range(1,13)]
        # Fallback solo si no existe el archivo precomputado y hay columnas mensuales en el catálogo
        if not items:
            df = _load_catalog().copy()
            month_cols_exist = any(c.startswith(f"ventas_{year}_") for c in map(str, df.columns))
            if not month_cols_exist:
                return {"segments": []}
            if {"segmento_ventas"}.issubset(df.columns):
                def _u(v):
                    try:
                        return int(float(v))
                    except Exception:
                        return 0
                aggr: Dict[str, Dict[int,int]] = {}
                for _, row in df.iterrows():
                    seg = str(row.get("segmento_ventas") or "").strip() or "(sin segmento)"
                    months = aggr.setdefault(seg, {})
                    for m in range(1,13):
                        col = f"ventas_{year}_{m:02d}"
                        if col in df.columns:
                            months[m] = months.get(m,0) + _u(row.get(col))
                for seg, months in aggr.items():
                    total = sum(months.values()) or 1
                    items[seg] = [{"m": m, "units": months.get(m,0), "share_pct": round(months.get(m,0)/total*100,2)} for m in range(1,13)]
        out = [{"name": seg, "months": sorted(vals, key=lambda x: x["m"])} for seg, vals in items.items()]
        audit("resp", "/seasonality", body={"segments": [s.get("name") for s in out]})
        return {"segments": out}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
