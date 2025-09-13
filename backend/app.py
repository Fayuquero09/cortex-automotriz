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

# --- Load .env early (no external deps) ---
def _load_dotenv_from_root() -> None:
    try:
        p = ROOT / ".env"
        if not p.exists():
            return
        for raw in p.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if (not line) or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            key = k.strip()
            val = v.strip().strip('"').strip("'")
            # do not override already-set environment values
            if key and (os.getenv(key) is None):
                os.environ[key] = val
    except Exception:
        # best-effort; never crash the app
        pass

_load_dotenv_from_root()

# Load Streamlit-style secrets from .streamlit/secrets.toml (optional)
def _load_streamlit_secrets() -> None:
    try:
        p = ROOT / ".streamlit" / "secrets.toml"
        if not p.exists():
            return
        import tomllib  # Python 3.11+
        data = tomllib.loads(p.read_text(encoding="utf-8")) if hasattr(tomllib, "loads") else tomllib.load(p.open("rb"))  # type: ignore
        # Flatten one level: allow top-level keys and a [env] or [backend] table
        items = {}
        if isinstance(data, dict):
            items.update({k: v for k, v in data.items() if not isinstance(v, dict)})
            for sec in ("env", "backend", "secrets"):
                t = data.get(sec)
                if isinstance(t, dict):
                    items.update({k: v for k, v in t.items() if not isinstance(v, dict)})
        for k, v in items.items():
            key = str(k).strip()
            if not key:
                continue
            val = str(v).strip()
            if not val:
                continue
            # set case-preserving key if empty
            if os.getenv(key) is None:
                os.environ[key] = val
            # also set UPPERCASE variant for common env usage
            key_up = key.upper()
            if os.getenv(key_up) is None:
                os.environ[key_up] = val
    except Exception:
        # Best-effort only
        pass

_load_streamlit_secrets()

try:
    import pandas as pd  # type: ignore
except Exception:  # pragma: no cover
    pd = None  # type: ignore

# --------------------------- Shared Row Utilities -------------------------
# These helpers are used in /compare and /price_explain. Keep them at module level
# to avoid NameError and code duplication across endpoints.
from typing import Optional as _Optional, Any as _Any

def _to_num_shared(x: _Any) -> _Optional[float]:
    try:
        return float(x)
    except Exception:
        return None

def _fuel_raw_shared(row: Dict[str, _Any]) -> str:
    for k in ("categoria_combustible_final", "tipo_de_combustible_original", "fuel_type"):
        v = row.get(k)
        if v:
            return str(v)
    return ""

def _kml_from_row_shared(row: Dict[str, _Any]) -> _Optional[float]:
    cand = [
        "combinado_kml","kml_mixto","mixto_kml","rendimiento_mixto_kml","consumo_mixto_kml","consumo_combinado_kml",
        "combinado_km_l","km_l_mixto","mixto_km_l","rendimiento_mixto_km_l","rendimiento_combinado_km_l","consumo_combinado_km_l",
    ]
    for c in cand:
        v = _to_num_shared(row.get(c))
        if v is not None and v > 0:
            return float(v)
    # L/100km -> kml
    for c in ("mixto_l_100km","consumo_mixto_l_100km","l_100km_mixto"):
        v = _to_num_shared(row.get(c))
        if v is not None and v > 0:
            try:
                return 100.0/float(v)
            except Exception:
                pass
    return None

def _fuel_price_for_shared(row: Dict[str, _Any]) -> _Optional[float]:
    try:
        cfg = get_config()
        prices = cfg.get("fuel_prices", {})
    except Exception:
        prices = {}
    lc = _fuel_raw_shared(row).lower()
    if not lc:
        return None
    if "elect" in lc:
        return 0.0
    if "diesel" in lc:
        return _to_num_shared(prices.get("diesel_litro"))
    if "premium" in lc:
        return _to_num_shared(prices.get("gasolina_premium_litro") or prices.get("gasolina_magna_litro"))
    if "magna" in lc or "regular" in lc or any(k in lc for k in ("gas", "nafta", "petrol", "gasolina")):
        return _to_num_shared(prices.get("gasolina_magna_litro") or prices.get("gasolina_premium_litro"))
    return None

def ensure_fuel_60(row: Dict[str, _Any]) -> Dict[str, _Any]:
    out = dict(row)
    if out.get("fuel_cost_60k_mxn") is None:
        kml = _kml_from_row_shared(out)
        price = _fuel_price_for_shared(out)
        if (kml is not None) and (price is not None):
            try:
                out["fuel_cost_60k_mxn"] = round((60000.0 / float(kml)) * float(price))
            except Exception:
                pass
    return out

def _to01_shared(v: _Any) -> int:
    try:
        s = str(v).strip().lower()
    except Exception:
        s = ""
    if s in {"true","1","si","sí","estandar","estándar","incluido","standard","std","present","x","y"}:
        return 1
    try:
        return 1 if float(s) > 0 else 0
    except Exception:
        return 0

def ensure_equip_score(row: Dict[str, _Any]) -> Dict[str, _Any]:
    out = dict(row)
    val = _to_num_shared(out.get("equip_score"))
    if val is not None and val > 0:
        return out
    keys = [
        "android_auto","apple_carplay","tiene_pantalla_tactil","camara_360",
        "sensor_punto_ciego","alerta_colision","abs","control_estabilidad",
        "llave_inteligente","aire_acondicionado","apertura_remota_maletero",
        "cierre_automatico_maletero","ventanas_electricas","seguros_electricos",
    ]
    have = 0; present = 0
    for k in keys:
        valk = out.get(k)
        if valk is None or str(valk).strip() == "":
            continue
        present += 1
        if _to01_shared(valk):
            have += 1
    if present == 0:
        out["equip_score"] = 50.0
    else:
        try:
            out["equip_score"] = round((have/float(present))*100.0, 1)
        except Exception:
            out["equip_score"] = 50.0
    return out

def ensure_pillars(row: Dict[str, _Any]) -> Dict[str, _Any]:
    out = dict(row)
    def _maybe(col: str, val: float) -> None:
        cur = _to_num_shared(out.get(col))
        if cur is None or cur <= 0:
            out[col] = round(max(0.0, min(100.0, val)), 1)
    adas = sum(_to01_shared(out.get(k)) for k in ("alerta_colision","sensor_punto_ciego","camara_360","asistente_estac_frontal","asistente_estac_trasero"))
    _maybe("equip_p_adas", (adas/5.0)*100.0)
    safety = sum(_to01_shared(out.get(k)) for k in ("abs","control_estabilidad","bolsas_cortina_todas_filas","bolsas_aire_delanteras_conductor","bolsas_aire_delanteras_pasajero"))
    _maybe("equip_p_safety", (safety/5.0)*100.0)
    comfort = sum(_to01_shared(out.get(k)) for k in ("llave_inteligente","aire_acondicionado","apertura_remota_maletero","cierre_automatico_maletero","ventanas_electricas","seguros_electricos"))
    _maybe("equip_p_comfort", (comfort/6.0)*100.0)
    info = sum(_to01_shared(out.get(k)) for k in ("tiene_pantalla_tactil","android_auto","apple_carplay","bocinas"))
    _maybe("equip_p_infotainment", (info/4.0)*100.0)
    try:
        dw = str(out.get("driven_wheels") or out.get("traccion_original") or "").lower()
    except Exception:
        dw = ""
    trac = _to01_shared(out.get("control_electrico_de_traccion")) or (1 if ("4x4" in dw or "awd" in dw or "4wd" in dw) else 0)
    _maybe("equip_p_traction", trac*100.0)
    util = sum(_to01_shared(out.get(k)) for k in ("rieles_techo","enchufe_12v","preparacion_remolque","enganche_remolque","tercera_fila"))
    _maybe("equip_p_utility", (util/5.0)*100.0)
    return out

# --------------------------- Prompt File Loader ---------------------------
_PROMPT_CACHE: Dict[str, Dict[str, _Any]] = {}

def _prompt_search_dirs() -> list[Path]:
    dirs: list[Path] = []
    # Next.js frontend public dir
    dirs.append(ROOT / "cortex_frontend" / "public" / "data")
    # Legacy frontend public dir
    dirs.append(ROOT / "frontend" / "public" / "data")
    # Root-level public/data if present
    dirs.append(ROOT / "public" / "data")
    # Optional env override
    base = os.getenv("PROMPT_DATA_DIR")
    if base:
        p = Path(base)
        if not p.is_absolute():
            p = ROOT / p
        dirs.insert(0, p)
    return [d for d in dirs if d.exists()]

def _read_text_cached(path: Path) -> _Optional[str]:
    try:
        key = str(path.resolve())
        st = path.stat()
        ent = _PROMPT_CACHE.get(key)
        if ent and ent.get("mt") == st.st_mtime:
            return ent.get("txt")  # type: ignore[return-value]
        txt = path.read_text(encoding="utf-8")
        _PROMPT_CACHE[key] = {"mt": st.st_mtime, "txt": txt}
        return txt
    except Exception:
        return None

def _load_prompts_for_lang(lang: str) -> tuple[_Optional[str], _Optional[str]]:
    """Return (system_prompt, user_template) from public/data for a given lang.

    Filenames expected:
      prompt_cortex_exec_<lang>_v1.txt
      user_template_exec_<lang>_v1.txt
    """
    lang = (lang or "").strip().lower()
    if lang not in {"es","en","zh"}:
        return None, None
    sys_name = f"prompt_cortex_exec_{lang}_v1.txt"
    usr_name = f"user_template_exec_{lang}_v1.txt"
    for base in _prompt_search_dirs():
        p_sys = base / sys_name
        p_usr = base / usr_name
        sys_txt = _read_text_cached(p_sys) if p_sys.exists() else None
        usr_txt = _read_text_cached(p_usr) if p_usr.exists() else None
        if sys_txt and usr_txt:
            return sys_txt, usr_txt
    return None, None

# ----------------------------- Options Index ------------------------------
_OPTIONS_IDX: Optional[Dict[str, Any]] = None
_OPTIONS_IDX_MTIMES: Dict[str, float] = {}
# Aliases (canonicalization) cache
_ALIASES: Optional[Dict[str, Any]] = None
_ALIASES_MTIME: Optional[float] = None

def _load_aliases() -> Dict[str, Any]:
    """Load alias mappings from data/aliases/alias_names.csv.

    Format: scope,from_name,to_name,make,model,notes
    Supported scopes: make, model, version
    Matching is case-insensitive; canonical outputs are uppercased.
    """
    global _ALIASES, _ALIASES_MTIME
    p = ROOT / "data" / "aliases" / "alias_names.csv"
    mt = p.stat().st_mtime if p.exists() else -1
    if _ALIASES is not None and _ALIASES_MTIME == mt:
        return _ALIASES
    aliases = {"make": {}, "model": []}  # type: ignore
    try:
        if p.exists():
            import csv
            with p.open("r", encoding="utf-8") as fh:
                rd = csv.DictReader((row for row in fh if not str(row).strip().startswith("#")))
                for r in rd:
                    scope = str(r.get("scope") or "").strip().lower()
                    frm = str(r.get("from_name") or "").strip()
                    to = str(r.get("to_name") or "").strip()
                    mk = str(r.get("make") or "").strip()
                    md = str(r.get("model") or "").strip()
                    if not scope or not frm or not to:
                        continue
                    if scope == "make":
                        aliases["make"][frm.upper()] = to.upper()
                    elif scope == "model":
                        aliases["model"].append({
                            "from": frm.upper(),
                            "to": to.upper(),
                            "make": mk.upper() or None,
                        })
    except Exception:
        pass
    _ALIASES, _ALIASES_MTIME = aliases, mt
    return aliases

def _canon_make(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    a = _load_aliases()
    vv = str(v).strip().upper()
    return a["make"].get(vv, vv)

def _canon_model(mk: Optional[str], md: Optional[str]) -> Optional[str]:
    if md is None:
        return md
    a = _load_aliases()
    mk_up = str(mk or "").strip().upper()
    md_up = str(md or "").strip().upper()
    # Prefer rules limited by make
    for rec in a.get("model", []):
        if rec.get("make") and rec.get("make") == mk_up and rec.get("from") == md_up:
            return rec.get("to")
    # Global model rules
    for rec in a.get("model", []):
        if (rec.get("make") is None) and rec.get("from") == md_up:
            return rec.get("to")
    return md_up
# Lightweight cache for /options responses (keyed by query). TTL and invalidation
_OPTIONS_CACHE: Dict[str, Dict[str, Any]] = {}

def _options_cache_sig() -> str:
    """Build a signature of the current data sources, so cache is invalidated
    when catalog or option sources change.
    """
    try:
        couple = os.getenv("OPTIONS_CACHE_COUPLED_TO_CATALOG", "0") in {"1","true","True"}
        mt = _OPTIONS_IDX_MTIMES or {}
        parts = []
        if couple:
            parts.append(str(_DF_MTIME or "0"))
        # include index source mtimes
        parts += [f"{k}:{mt.get(k,'-')}" for k in sorted(mt.keys())]
        return "|".join(parts)
    except Exception:
        return str(datetime.utcnow().timestamp())

def _compact_key(s: str) -> str:
    try:
        import re as _re
        return _re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
    except Exception:
        return str(s or "").upper().replace(" ", "")

def _options_paths() -> Dict[str, Path]:
    """Return sources used to build the options index.

    If a curated versiones95 file exists, prefer it and avoid heavy catalogs
    since structure (make/model/year/version) is stable and price-only changes
    should not invalidate the options index.
    """
    prefer_versiones = (os.getenv("PREFER_VERSIONES95", "1") not in {"0","false","False"})
    ver = ROOT / "data" / "versiones95_2024_2026.json"
    if prefer_versiones and ver.exists():
        return {"versiones95": ver}

    # Fallback to previous multi-source strategy
    paths: Dict[str, Path] = {}
    try:
        paths["catalog"] = _catalog_path()
    except Exception:
        pass
    paths["processed"] = ROOT / "data" / "equipo_veh_limpio_procesado.csv"
    paths["flat"] = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
    p = ROOT / "data" / "vehiculos-todos.json"
    if not p.exists():
        p = ROOT / "data" / "vehiculos-todos1.json"
    paths["json"] = p
    return paths

def _ensure_options_index() -> None:
    global _OPTIONS_IDX, _OPTIONS_IDX_MTIMES
    paths = _options_paths()
    mtimes = {}
    for k, p in paths.items():
        try:
            mtimes[k] = p.stat().st_mtime if p and p.exists() else -1.0
        except Exception:
            mtimes[k] = -1.0
    if _OPTIONS_IDX is not None and mtimes == _OPTIONS_IDX_MTIMES:
        return
    # Build index
    idx: Dict[str, Any] = {"models": {}, "models_compact": {}}
    def add_item(mk: str, md: str, vr: Optional[str], yr: Optional[int]) -> None:
        try:
            if not md:
                return
            model_up = str(md).strip().upper()
            model_c = _compact_key(md)
            mk_up = str(mk or "").strip().upper()
            try:
                mk_up = _canon_make(mk_up) or mk_up
            except Exception:
                pass
            yr_i = int(yr) if (yr is not None and str(yr).isdigit()) else None
            # Restrict to allowed years to keep the index small and stable
            if yr_i is not None and int(yr_i) not in ALLOWED_YEARS:
                return
            rec = idx["models"].setdefault(model_up, {"makes": set(), "years": set(), "versions_by_year": {}, "by_make": {}})
            if mk_up:
                rec["makes"].add(mk_up)
                bm = rec["by_make"].setdefault(mk_up, {"years": set(), "versions_by_year": {}})
            if yr_i is not None:
                rec["years"].add(yr_i)
                if vr:
                    rec["versions_by_year"].setdefault(yr_i, set()).add(str(vr))
                if mk_up:
                    bm["years"].add(yr_i)
                    if vr:
                        bm["versions_by_year"].setdefault(yr_i, set()).add(str(vr))
            # map compact model key
            idx["models_compact"].setdefault(model_c, model_up)
        except Exception:
            pass

    # Prefer curated versiones95 file when available (structure only)
    if "versiones95" in paths and paths["versiones95"].exists():
        try:
            import json as _json
            data = _json.loads(paths["versiones95"].read_text(encoding="utf-8"))
            items = data if isinstance(data, list) else (data.get("items") if isinstance(data, dict) else [])
            for v in items or []:
                mk = str(v.get("MAKE") or v.get("make") or "").strip()
                md = str(v.get("Model") or v.get("model") or "").strip()
                ver = str(v.get("Version") or v.get("version") or "").strip()
                yr = v.get("Año") or v.get("ano") or v.get("year")
                try:
                    yr = int(yr) if yr is not None else None
                except Exception:
                    yr = None
                add_item(mk, md, ver, yr)
        except Exception:
            pass
    else:
        # Legacy multi-source build
        # 1) Catalog (already cached in memory)
        try:
            df0 = _load_catalog().copy()
            if pd is not None and len(df0):
                cols = [c for c in ["make","model","version","ano"] if c in df0.columns]
                t = df0[cols].copy()
                for c in ["make","model","version"]:
                    if c in t.columns:
                        t[c] = t[c].astype(str)
                if "ano" in t.columns:
                    t["ano"] = pd.to_numeric(t["ano"], errors="coerce").astype("Int64")
                for _, r in t.iterrows():
                    add_item(r.get("make",""), r.get("model",""), r.get("version"), int(r.get("ano")) if pd.notna(r.get("ano")) else None)
        except Exception:
            pass
        # 2) Processed CSV
        try:
            p = paths.get("processed")
            if p and p.exists() and pd is not None:
                t = pd.read_csv(p, low_memory=False)
                t.columns = [str(c).strip().lower() for c in t.columns]
                if {"make","model","ano"}.issubset(t.columns):
                    for _, r in t.iterrows():
                        add_item(r.get("make",""), r.get("model",""), r.get("version"), r.get("ano"))
        except Exception:
            pass
        # 3) Flat enriched
        try:
            p = paths.get("flat")
            if p and p.exists() and pd is not None:
                t = pd.read_csv(p, low_memory=False)
                t.columns = [str(c).strip().lower() for c in t.columns]
                if {"make","model","ano"}.issubset(t.columns):
                    for _, r in t.iterrows():
                        add_item(r.get("make",""), r.get("model",""), r.get("version"), r.get("ano"))
        except Exception:
            pass
        # 4) JSON curated
        try:
            p = paths.get("json")
            if p and p.exists():
                import json as _json
                data = _json.loads(p.read_text(encoding="utf-8"))
                items = data.get("vehicles") if isinstance(data, dict) else (data if isinstance(data, list) else [])
                for v in items or []:
                    mk = (v.get("manufacturer",{}) or {}).get("name") or (v.get("make",{}) or {}).get("name") or ""
                    md = (v.get("model",{}) or {}).get("name") or ""
                    ver = (v.get("version",{}) or {}).get("name") or ""
                    yr = (v.get("version",{}) or {}).get("year") or None
                    add_item(mk, md, ver, yr)
        except Exception:
            pass

    _OPTIONS_IDX = idx
    _OPTIONS_IDX_MTIMES = mtimes

def _norm_version_name(s: str | None) -> str:
    """Normalize common version tokens for consistent display.

    Examples: 'doble cabina'/'double cab' -> 'D-Cab', 'diesel' -> 'DSL',
    'automático'/'AT' -> 'AT', 'mild hybrid' -> 'MHEV', 'GSR','GLS','MT','4x4'.
    """
    if not s:
        return ""
    import re
    out = str(s).strip()
    # D‑Cab tokens
    out = re.sub(r"\b(d-?cab(?:ina)?)\b|\b(double\s*cab)\b|\b(doble\s*cabina)\b", "D-Cab", out, flags=re.IGNORECASE)
    # Fuel/drive tokens
    out = re.sub(r"\b(diesel|diésel|díesel|d[ií]esel|dsl)\b", "DSL", out, flags=re.IGNORECASE)
    out = re.sub(r"\b(automático|automatico|auto|a/ t|a/t|at)\b", "AT", out, flags=re.IGNORECASE)
    out = re.sub(r"\b(mild\s*hybrid|mhev|h[íi]brido\s*ligero)\b", "MHEV", out, flags=re.IGNORECASE)
    out = re.sub(r"\bgsr\b", "GSR", out, flags=re.IGNORECASE)
    out = re.sub(r"\bgls\b", "GLS", out, flags=re.IGNORECASE)
    # Common trim/trans tokens requested: TM, IVT
    out = re.sub(r"\btm\b", "TM", out, flags=re.IGNORECASE)
    out = re.sub(r"\bivt\b", "IVT", out, flags=re.IGNORECASE)
    # Additional tokens
    out = re.sub(r"\bgl\b", "GL", out, flags=re.IGNORECASE)
    out = re.sub(r"\bglx\b", "GLX", out, flags=re.IGNORECASE)
    out = re.sub(r"\bgt\b", "GT", out, flags=re.IGNORECASE)
    out = re.sub(r"\bgti\b", "GTI", out, flags=re.IGNORECASE)
    out = re.sub(r"\bcvt\b", "CVT", out, flags=re.IGNORECASE)
    out = re.sub(r"\bdct\b", "DCT", out, flags=re.IGNORECASE)
    out = re.sub(r"\bdsg\b", "DSG", out, flags=re.IGNORECASE)
    out = re.sub(r"\bmt\b|\bmanual\b", "MT", out, flags=re.IGNORECASE)
    out = re.sub(r"\b4\s*x\s*4\b", "4x4", out, flags=re.IGNORECASE)
    # collapse spaces and dashes
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"-{2,}", "-", out)
    # remove duplicated tokens (e.g., 'AT AT')
    out = re.sub(r"\b(AT|DSL|MHEV|GSR|GLS|MT|4x4)(?:\s+\1)+\b", r"\1", out)
    # Capitalize non-token words; keep tokens uppercase
    def _cap(w: str) -> str:
        return w.upper() if re.match(r"^(AT|DSL|MHEV|GSR|GLS|MT|4x4|D-Cab)$", w, flags=re.IGNORECASE) else (w[:1].upper() + w[1:])
    out = " ".join(_cap(w) for w in out.split())
    return out.strip()


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

    # Defaults if remote/env are missing (reasonable public averages; overridable by env)
    DEFAULTS = {
        "gasolina_magna_litro": 24.0,
        "gasolina_premium_litro": 26.0,
        "diesel_litro": 25.0,
        "electricidad_kwh": 2.8,
    }

    # Determine data last update times (catalog and key sources)
    def _fmt_ts(ts: float | None) -> Optional[str]:
        try:
            if ts is None:
                return None
            return datetime.fromtimestamp(float(ts)).isoformat(timespec="seconds")
        except Exception:
            return None
    data_mtimes: Dict[str, float] = {}
    prices_mtime: Optional[float] = None
    industry_mtime: Optional[float] = None
    try:
        # Catalog mtime (prefer already-loaded dataframe timestamp)
        if _DF_MTIME is not None:
            data_mtimes["catalog"] = float(_DF_MTIME)
            prices_mtime = float(_DF_MTIME)
        else:
            pcat = _catalog_path()
            if pcat.exists():
                mt = float(pcat.stat().st_mtime)
                data_mtimes["catalog"] = mt
                prices_mtime = mt
    except Exception:
        pass
    try:
        for k, p in _options_paths().items():
            try:
                if p and p.exists():
                    mt = float(p.stat().st_mtime)
                    data_mtimes[k] = mt
            except Exception:
                pass
    except Exception:
        pass
    # Industry files (INEGI / AMDA sales): prefer enriched sales_ytd_*.csv then raiavl_*.csv
    try:
        enriched = (ROOT / "data" / "enriched")
        if enriched.exists():
            for f in enriched.glob("sales_ytd_*.csv"):
                try:
                    t = float(f.stat().st_mtime)
                    industry_mtime = max(industry_mtime or 0.0, t)
                    data_mtimes.setdefault("sales_ytd", t)
                except Exception:
                    pass
        base = (ROOT / "data")
        if base.exists():
            for f in base.glob("raiavl_venta_mensual_tr_cifra_*.csv"):
                try:
                    t = float(f.stat().st_mtime)
                    industry_mtime = max(industry_mtime or 0.0, t)
                    data_mtimes.setdefault("inegi_sales_csv", t)
                except Exception:
                    pass
    except Exception:
        pass
    latest_ts = max(data_mtimes.values()) if data_mtimes else None

    resp = {
        "app": "Cortex Automotriz",
        "title": "Cortex Automotriz",
        "env": os.getenv("APP_ENV", "dev"),
        "version": os.getenv("APP_VERSION", "local"),
        "api_base": "/",
        "ws_url": "/ws",
        "data_last_updated": _fmt_ts(latest_ts),
        "prices_last_updated": _fmt_ts(prices_mtime),
        "industry_last_updated": _fmt_ts(industry_mtime),
        "data_sources_mtime": {k: _fmt_ts(v) for k, v in data_mtimes.items()},
        "fuel_prices": {
            "gasolina_magna_litro": _to_float("PRECIO_GASOLINA_MAGNA_LITRO", remote.get("gasolina_magna_litro") or DEFAULTS["gasolina_magna_litro"]),
            "gasolina_premium_litro": _to_float("PRECIO_GASOLINA_PREMIUM_LITRO", remote.get("gasolina_premium_litro") or DEFAULTS["gasolina_premium_litro"]),
            "diesel_litro": _to_float("PRECIO_DIESEL_LITRO", remote.get("diesel_litro") or DEFAULTS["diesel_litro"]),
            "electricidad_kwh": _to_float("PRECIO_ELECTRICIDAD_KWH", DEFAULTS["electricidad_kwh"]),
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
        # Apply aliases (canonicalization) for make/model so the whole app uses canonical names
        try:
            _ = _load_aliases()
            if {"make","model"}.issubset(df.columns):
                df["make"] = df["make"].map(lambda s: _canon_make(s))
                # model alias may depend on make
                df["model"] = df.apply(lambda r: _canon_model(r.get("make"), r.get("model")), axis=1)
        except Exception:
            pass
        # If TX is missing or 0, use MSRP as fallback
        try:
            if {"msrp","precio_transaccion"}.issubset(df.columns):
                tx = pd.to_numeric(df["precio_transaccion"], errors="coerce")
                ms = pd.to_numeric(df["msrp"], errors="coerce")
                df["precio_transaccion"] = tx.where(~(tx.isna() | (tx <= 0)), ms)
        except Exception:
            pass
        # add normalized display version
        try:
            if "version" in df.columns:
                df["version_display"] = df["version"].map(_norm_version_name)
        except Exception:
            pass
        if "ano" in df.columns:
            try:
                df["ano"] = df["ano"].astype(int)
            except Exception:
                pass
        # Ensure equip_score exists for charts; and fill missing/zero rows
        try:
            needs_score_all = ("equip_score" not in df.columns) or df["equip_score"].isna().all()
        except Exception:
            needs_score_all = True
        def _compute_proxy_scores(dframe):
            try:
                # Try library scorer first
                from scripts.enrich_catalog import compute_scores  # type: ignore
                return compute_scores(dframe)
            except Exception:
                # Fallback: crude proxy using presence of common features
                import pandas as _pd
                candidate_cols = [
                    c for c in dframe.columns
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
                    score = dframe[candidate_cols].apply(lambda col: col.map(_to01))
                    score_sum = score.sum(axis=1)
                    mx = float(score_sum.max()) if len(score_sum)>0 else 0.0
                    dframe["equip_score"] = (score_sum * (100.0 / mx)).round(1) if mx>0 else 0
                return dframe
        if needs_score_all:
            try:
                df = _compute_proxy_scores(df)
            except Exception:
                pass
        # Even si la columna existe, rellena valores faltantes/<=0 con un proxy simple
        try:
            import pandas as _pd
            if "equip_score" not in df.columns:
                df["equip_score"] = None
            mask = _pd.to_numeric(df.get("equip_score"), errors="coerce").fillna(0) <= 0
            if mask.any():
                df2 = df.copy()
                df2 = _compute_proxy_scores(df2)
                df.loc[mask, "equip_score"] = df2.loc[mask, "equip_score"]
        except Exception:
            pass

        # Fallback muy ligero para pilares (equip_p_*) cuando faltan o son 0
        try:
            import pandas as _pd
            def _to01(v):
                s = str(v).strip().lower()
                if s in ("true","1","si","sí","estandar","estándar","incluido","standard","std"): return 1
                if s in ("false","0","no","ninguno","na","n/a","no disponible","-"): return 0
                try:
                    return 1 if float(s)>0 else 0
                except Exception:
                    return 0
            def _pillar(cols: list[str]) -> _pd.Series:
                cols = [c for c in cols if c in df.columns]
                if not cols:
                    return _pd.Series([0]*len(df))
                binm = df[cols].applymap(_to01)
                sc = (binm.sum(axis=1) / float(len(cols)) * 100.0).round(1)
                return sc
            # Mapas de columnas → pilares (usar solo si existen)
            p_adas = _pillar(["alerta_colision","sensor_punto_ciego","camara_360","asistente_estac_frontal","asistente_estac_trasero"]) \
                     if "alerta_colision" in df.columns or "sensor_punto_ciego" in df.columns or "camara_360" in df.columns else None
            p_safety = _pillar(["abs","control_estabilidad","bolsas_cortina_todas_filas","bolsas_aire_delanteras_conductor","bolsas_aire_delanteras_pasajero"]) \
                      if "abs" in df.columns or "control_estabilidad" in df.columns else None
            p_comfort = _pillar(["llave_inteligente","aire_acondicionado","apertura_remota_maletero","cierre_automatico_maletero","ventanas_electricas","seguros_electricos"]) \
                       if "llave_inteligente" in df.columns or "aire_acondicionado" in df.columns else None
            p_info = _pillar(["tiene_pantalla_tactil","android_auto","apple_carplay","bocinas"]) \
                    if "tiene_pantalla_tactil" in df.columns or "android_auto" in df.columns or "apple_carplay" in df.columns else None
            # tracción/utilidad
            # tracción: control de tracción + (driven_wheels contiene 4x4/awd)
            if "driven_wheels" in df.columns:
                tr_bool = df["driven_wheels"].astype(str).str.lower().str.contains("4x4|awd|4wd|4wd", regex=True).map(lambda x: 1 if x else 0)
            else:
                tr_bool = _pd.Series([0]*len(df))
            if "control_electrico_de_traccion" in df.columns:
                tr_bool = tr_bool.combine_first(df["control_electrico_de_traccion"].map(_to01))
            p_trac = (tr_bool * 100.0).round(1)
            p_util = _pillar(["rieles_techo","enchufe_12v","preparacion_remolque","enganche_remolque","tercera_fila"]) \
                     if "rieles_techo" in df.columns or "enchufe_12v" in df.columns or "preparacion_remolque" in df.columns or "enganche_remolque" in df.columns else None

            def _fill(col: str, series):
                if series is None: return
                if col not in df.columns:
                    df[col] = None
                m = _pd.to_numeric(df[col], errors="coerce").fillna(0) <= 0
                if m.any():
                    df.loc[m, col] = series[m]
            _fill("equip_p_adas", p_adas)
            _fill("equip_p_safety", p_safety)
            _fill("equip_p_comfort", p_comfort)
            _fill("equip_p_infotainment", p_info)
            _fill("equip_p_traction", p_trac)
            _fill("equip_p_utility", p_util)
        except Exception:
            pass
        else:
            # Fill only rows with NaN or 0
            try:
                mask = df["equip_score"].isna() | (pd.to_numeric(df["equip_score"], errors="coerce").fillna(0) == 0)
                if mask.any():
                    temp = df.copy()
                    temp = _compute_proxy_scores(temp)
                    df.loc[mask, "equip_score"] = temp.loc[mask, "equip_score"]
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
        # Rough fallback: if fuel cost is still NaN or 0 for ICE vehicles, estimate with default KML & prices
        try:
            if "fuel_cost_60k_mxn" in df.columns:
                fc = pd.to_numeric(df["fuel_cost_60k_mxn"], errors="coerce")
                needs = fc.isna() | (fc <= 0)
                if needs.any():
                    def _default_fuel_cost(categ):
                        kml = 12.0; price = 24.0
                        if "premium" in categ: kml = 11.0; price = 26.0
                        if "diesel" in categ: kml = 14.0; price = 26.0
                        return (kml, price)
                    def _bev_cost(row):
                        cons = None
                        for cc in ["consumo_kwh_100km","consumo_electrico_kwh_100km","kwh_100km","kwh/100km","kwh_por_100km"]:
                            try:
                                v = row.get(cc)
                                if v is not None and str(v) != "" and not pd.isna(v):
                                    cons = float(v); break
                            except Exception:
                                pass
                        if cons is None:
                            try:
                                bat = float(row.get("battery_kwh") or row.get("bateria_kwh") or 0)
                                rng = float(row.get("autonomia_km") or row.get("rango_km") or 0)
                                if bat>0 and rng>0:
                                    cons = bat / rng * 100.0
                            except Exception:
                                cons = None
                        if cons is None:
                            seg = str(row.get("segmento_ventas") or row.get("body_style") or "").lower()
                            cons = 18.0 if any(s in seg for s in ("todo terreno","suv","crossover")) else (22.0 if any(s in seg for s in ("pickup","camioneta","chasis")) else 16.0)
                        try:
                            price_e = float(os.getenv("PRECIO_ELEC_KWH","2.9"))
                        except Exception:
                            price_e = 2.9
                        return round(cons * (60000.0/100.0) * price_e, 0)
                    def est(row):
                        c = str(row.get("categoria_combustible_final") or "").lower()
                        if any(k in c for k in ("bev","eléctrico","electrico")):
                            return _bev_cost(row)
                        if any(k in c for k in ("phev","enchuf")):
                            # mezcla: electricidad + combustible
                            try:
                                elec_share = float(os.getenv("PHEV_ELEC_SHARE","0.6"))
                            except Exception:
                                elec_share = 0.6
                            elec = _bev_cost(row)
                            kml, price = _default_fuel_cost(c)
                            fuel = round((60000.0 / max(1.0,kml)) * price, 0)
                            return round(elec_share*elec + (1.0-elec_share)*fuel, 0)
                        # ICE
                        kml, price = _default_fuel_cost(c)
                        return round((60000.0 / max(1.0,kml)) * price, 0)
                    est_vals = df.apply(est, axis=1)
                    df.loc[needs, "fuel_cost_60k_mxn"] = df.loc[needs, "fuel_cost_60k_mxn"].where(~needs, est_vals)
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
                            _obj = _json.load(f)
                        # Many curated dumps wrap vehicles under a 'vehicles' key; unwrap it
                        if isinstance(_obj, dict) and "vehicles" in _obj:
                            arr = _obj.get("vehicles") or []
                        else:
                            arr = _obj
                        # Ensure we have a list of dicts
                        if not isinstance(arr, list):
                            arr = []
                        jdf = pd.DataFrame(arr)
                        jdf.columns = [str(c).strip().lower() for c in jdf.columns]
                        # basic columns
                        aliases = {}
                        if "make" not in jdf.columns and "marca" in jdf.columns: aliases["marca"] = "make"
                        if "model" not in jdf.columns and "modelo" in jdf.columns: aliases["modelo"] = "model"
                        if "version" not in jdf.columns and "versión" in jdf.columns: aliases["versión"] = "version"
                        if "ano" not in jdf.columns and "año" in jdf.columns: aliases["año"] = "ano"
                        # dimensions & performance + body style
                        for src in ["longitud (mm)", "largo (mm)", "longitud_mm", "largo_mm"]:
                            if src in jdf.columns: aliases[src] = "longitud_mm"; break
                        for src in ["ancho (mm)", "anchura (mm)", "ancho_mm", "anchura_mm", "width_mm", "ancho"]:
                            if src in jdf.columns: aliases[src] = "ancho_mm"; break
                        for src in ["altura (mm)", "alto (mm)", "altura_mm", "alto_mm", "height_mm", "alto"]:
                            if src in jdf.columns: aliases[src] = "altura_mm"; break
                        for src in ["body style","body_style","bodystyle","segment","segmento","segmento ventas","segmento_ventas"]:
                            if src in jdf.columns: aliases[src] = "body_style"; break
                        if "photo path" in jdf.columns and "images_default" not in jdf.columns:
                            aliases["photo path"] = "images_default"
                        if aliases:
                            jdf.rename(columns=aliases, inplace=True)
                        # detect accel columns heuristically
                        for c in list(jdf.columns):
                            lc = str(c).lower()
                            if ("0-100" in lc or "0–100" in lc or "0 a 100" in lc) and ("s" in lc or "seg" in lc):
                                jdf.rename(columns={c: "accel_0_100_s"}, inplace=True)
                        # Extract fuel economy from nested fuelEconomy dict -> *_kml
                        try:
                            if "fuelEconomy" in jdf.columns:
                                import re as _re
                                def _to_kml(v):
                                    """Interpretar cualquier número como km/l (incluido 'mpg' mal rotulado)."""
                                    try:
                                        if v is None:
                                            return None
                                        s = str(v).strip().lower()
                                        if s == "" or s in {"nan","none","null","-"}:
                                            return None
                                        # Si aparece 'mpg', tratarlo como km/l (bug en el JSON)
                                        m = _re.search(r"(\d+[\.,]?\d*)\s*mpg", s)
                                        if m:
                                            return float(m.group(1).replace(',', '.'))
                                        # l/100km → km/l
                                        m = _re.search(r"(\d+[\.,]?\d*)\s*l\s*/\s*100\s*km", s)
                                        if m:
                                            l100 = float(m.group(1).replace(',', '.'))
                                            return 100.0 / l100 if l100>0 else None
                                        # km/l explícito
                                        m = _re.search(r"(\d+[\.,]?\d*)\s*(km/?l|kml)", s)
                                        if m:
                                            return float(m.group(1).replace(',', '.'))
                                        # número suelto ⇒ km/l
                                        m = _re.search(r"(\d+[\.,]?\d*)", s)
                                        if m:
                                            return float(m.group(1).replace(',', '.'))
                                        return None
                                    except Exception:
                                        return None
                                def _fe_field(fe, key):
                                    if isinstance(fe, dict):
                                        return _to_kml(fe.get(key))
                                    return None
                                jdf["combinado_kml"] = jdf["fuelEconomy"].map(lambda fe: _fe_field(fe, 'combined'))
                                jdf["ciudad_kml"] = jdf["fuelEconomy"].map(lambda fe: _fe_field(fe, 'city'))
                                jdf["carretera_kml"] = jdf["fuelEconomy"].map(lambda fe: _fe_field(fe, 'highway'))
                        except Exception:
                            pass
                        # Extraer tren motriz desde 'version'
                        try:
                            if "version" in jdf.columns:
                                def _from_ver(v):
                                    try:
                                        t = (v or {}).get("transmission")
                                        d = (v or {}).get("drivetrain")
                                        dw = (str(d or "").strip().lower() or None)
                                        doors = (v or {}).get("doors")
                                        body = (v or {}).get("bodyStyle")
                                        return t, d, dw, doors, body
                                    except Exception:
                                        return None, None, None, None, None
                                cols = jdf["version"].map(_from_ver).apply(pd.Series)
                                cols.columns = ["transmision","traccion","driven_wheels","doors","body_style_from_ver"]
                                for cname in ["transmision","traccion","driven_wheels","doors"]:
                                    if cname not in jdf.columns:
                                        jdf[cname] = cols[cname]
                                    else:
                                        base = jdf[cname]
                                        new = cols[cname]
                                        jdf[cname] = base.where(~(base.isna() | (base=="")), new)
                                # Preferir body_style de 'version' si existe
                                if "body_style" not in jdf.columns:
                                    jdf["body_style"] = cols["body_style_from_ver"]
                                else:
                                    jdf["body_style"] = jdf["body_style"].combine_first(cols["body_style_from_ver"])
                        except Exception:
                            pass
                        # Compute a coarse equipment score from nested 'equipment' if present
                        try:
                            if "equipment" in jdf.columns:
                                def _eq(e):
                                    try:
                                        cnt = 0
                                        if not isinstance(e, dict):
                                            return None
                                        neg = {"no disponible","-","0","none","n/a","na","ninguno"}
                                        pos = {"serie","incluido","sí","si","estándar","estandar","yes","y"}
                                        for _k, arr in e.items():
                                            if not isinstance(arr, list):
                                                continue
                                            for it in arr:
                                                if not isinstance(it, dict):
                                                    continue
                                                val = str(it.get("value", "")).strip().lower()
                                                std = bool(it.get("standard"))
                                                attrs = it.get("attributes") or []
                                                text = " ".join([val] + [str(a.get("value","")) for a in attrs]).lower()
                                                ok = False
                                                if std and val not in neg:
                                                    ok = True
                                                if any(p in text for p in pos):
                                                    ok = True
                                                if ok:
                                                    cnt += 1
                                        return cnt
                                    except Exception:
                                        return None
                                jdf["equip_score"] = jdf["equipment"].map(_eq)
                                try:
                                    mx = float(pd.to_numeric(jdf["equip_score"], errors="coerce").max())
                                    if mx and mx > 0:
                                        jdf["equip_score"] = pd.to_numeric(jdf["equip_score"], errors="coerce").fillna(0).mul(100.0/mx).round(1)
                                except Exception:
                                    pass
                                # Extract quantitative counts from nested equipment (heuristics)
                                import re as _re
                                def _first_num(text: str):
                                    try:
                                        m = _re.search(r"(\d+[\.,]?\d*)", text)
                                        if not m:
                                            return None
                                        s = m.group(1).replace(',', '.')
                                        v = float(s)
                                        return v
                                    except Exception:
                                        return None
                                def _quant(e):
                                    out = {"speakers_count": None, "usb_a_count": None, "usb_c_count": None,
                                           "power_12v_count": None, "power_110v_count": None,
                                           "screen_main_in": None, "screen_cluster_in": None}
                                    try:
                                        if not isinstance(e, dict):
                                            return out
                                        for _k, arr in e.items():
                                            if not isinstance(arr, list):
                                                continue
                                            for it in arr:
                                                if not isinstance(it, dict):
                                                    continue
                                                name = str(it.get("name", ""))
                                                value = str(it.get("value", ""))
                                                attrs = it.get("attributes", []) or []
                                                text = f"{name} {value} " + " ".join([f"{a.get('name','')} {a.get('value','')}" for a in attrs])
                                                t = text.lower()
                                                # Speakers
                                                if any(k in t for k in ("bocinas","altav","parlant","speaker")):
                                                    v = _first_num(t)
                                                    if v is not None:
                                                        out["speakers_count"] = int(round(v))
                                                # USB-A / USB-C
                                                if "usb" in t:
                                                    if any(k in t for k in ("usb-c","usb c","tipo c","type-c","type c")):
                                                        v = _first_num(t)
                                                        if v is not None:
                                                            out["usb_c_count"] = int(round(v))
                                                    if any(k in t for k in ("usb-a","usb a","tipo a","type-a","type a")):
                                                        v = _first_num(t)
                                                        if v is not None:
                                                            out["usb_a_count"] = int(round(v))
                                                # Power 12V / 110V
                                                if "12v" in t and ("toma" in t or "tomacorr" in t or "power" in t):
                                                    v = _first_num(t)
                                                    if v is not None:
                                                        out["power_12v_count"] = int(round(v))
                                                if "110v" in t and ("toma" in t or "tomacorr" in t or "power" in t):
                                                    v = _first_num(t)
                                                    if v is not None:
                                                        out["power_110v_count"] = int(round(v))
                                                # Screens
                                                if ("pantalla" in t or "display" in t or "screen" in t):
                                                    v = _first_num(t)
                                                    if v is not None:
                                                        if any(k in t for k in ("cluster","clúster","instrument")):
                                                            out["screen_cluster_in"] = float(v)
                                                        else:
                                                            out["screen_main_in"] = float(v)
                                    except Exception:
                                        return out
                                    return out
                                qdf = jdf["equipment"].map(_quant).apply(pd.Series)
                                for col in ["speakers_count","usb_a_count","usb_c_count","power_12v_count","power_110v_count","screen_main_in","screen_cluster_in"]:
                                    try:
                                        if col not in jdf.columns:
                                            jdf[col] = qdf[col]
                                        else:
                                            base = pd.to_numeric(jdf[col], errors="coerce")
                                            new = pd.to_numeric(qdf[col], errors="coerce")
                                            jdf[col] = jdf[col].where(~(base.isna() | (base == 0)), new)
                                    except Exception:
                                        pass
                                # Infer fuel/energy category directly from JSON text
                                def _infer_fuel_from_json(row):
                                    try:
                                        # prefer existing
                                        cur = str(row.get("categoria_combustible_final") or "").strip().lower()
                                        if cur not in ("", "nan", "none", "null", "-"):
                                            return cur
                                        texts = []
                                        try:
                                            texts.append(str(row.get("version") or ""))
                                        except Exception:
                                            pass
                                        try:
                                            eq = row.get("equipment")
                                            if isinstance(eq, dict):
                                                for _k, arr in eq.items():
                                                    if isinstance(arr, list):
                                                        for it in arr:
                                                            if isinstance(it, dict):
                                                                texts.append(str(it.get("name","")))
                                                                texts.append(str(it.get("value","")))
                                        except Exception:
                                            pass
                                        s = " ".join(texts).lower()
                                        if any(k in s for k in ("bev","eléctrico","electrico","ev")):
                                            return "bev"
                                        if any(k in s for k in ("phev","enchuf")):
                                            return "phev"
                                        if any(k in s for k in ("hev","híbrido","hibrido")):
                                            return "hev"
                                        if any(k in s for k in ("diesel","diésel","tdi","td","dsl")):
                                            return "diesel"
                                        if any(k in s for k in ("premium","ron98")):
                                            return "gasolina premium"
                                        if any(k in s for k in ("gasolina","nafta","petrol")):
                                            return "gasolina"
                                        return None
                                    except Exception:
                                        return None
                                try:
                                    jdf["categoria_combustible_final"] = jdf.apply(_infer_fuel_from_json, axis=1)
                                except Exception:
                                    pass
                                # Reconstruct pillar scores (0..100) from equipment text bag (JSON-first)
                                def _pillars(e):
                                    out = {
                                        "equip_p_adas": 0.0,
                                        "equip_p_safety": 0.0,
                                        "equip_p_comfort": 0.0,
                                        "equip_p_infotainment": 0.0,
                                        "equip_p_traction": 0.0,
                                        "equip_p_utility": 0.0,
                                    }
                                    try:
                                        if not isinstance(e, dict):
                                            return out
                                        items = []
                                        for _k, arr in e.items():
                                            if isinstance(arr, list):
                                                for it in arr:
                                                    if isinstance(it, dict):
                                                        vals = [str(it.get("name","")), str(it.get("value",""))]
                                                        for a in it.get("attributes") or []:
                                                            vals.append(str(a.get("name","")))
                                                            vals.append(str(a.get("value","")))
                                                        items.append(" ".join(vals).lower())
                                        bag = " \n ".join(items)
                                        def has(*words):
                                            return any(w in bag for w in words)
                                        # ADAS
                                        if has("frenado de emergencia","aeb","autonomous emergency"): out["equip_p_adas"] += 10
                                        if has("crucero adaptativo","acc","stop & go","stop&go","cca"): out["equip_p_adas"] += 8
                                        if has("mantenimiento de carril","lane keep","lane centering","lka"): out["equip_p_adas"] += 7
                                        if has("punto ciego","blind spot","blis"): out["equip_p_adas"] += 6
                                        if has("tráfico cruzado","rear cross","cross traffic"): out["equip_p_adas"] += 5
                                        if has("cámara 360","camara 360","surround view","around view"): out["equip_p_adas"] += 5
                                        if has("park assist","auto park","asistente estacionamiento"): out["equip_p_adas"] += 4
                                        # Safety
                                        if has("airbag","bolsa de aire"): out["equip_p_safety"] += 8
                                        if has("abs") or has("control de estabilidad","esc","esp","vdc"): out["equip_p_safety"] += 6
                                        if has("isofix","latch"): out["equip_p_safety"] += 4
                                        # Comfort
                                        if has("asiento eléctrico","memoria asiento","calefacción asiento","ventilación asiento","calefaccion","ventilacion"): out["equip_p_comfort"] += 6
                                        if has("climatizador","dual zone","tri zone","3 zonas","2 zonas"): out["equip_p_comfort"] += 5
                                        if has("portón eléctrico","cajuela eléctrica","power tailgate"): out["equip_p_comfort"] += 4
                                        if has("llave inteligente","keyless","smart key"): out["equip_p_comfort"] += 3
                                        # Infotainment
                                        if has("android auto","apple carplay"): out["equip_p_infotainment"] += 6
                                        if has("pantalla","display","touchscreen"): out["equip_p_infotainment"] += 4
                                        if has("altavoces","bocinas","speakers"): out["equip_p_infotainment"] += 4
                                        if has("usb-c","usb c","tipo c","type-c") or has("usb-a","usb a","tipo a","type-a"): out["equip_p_infotainment"] += 3
                                        if has("wireless charging","carga inalámbrica","carga inalambrica"): out["equip_p_infotainment"] += 3
                                        # Traction/Utility
                                        if has("awd","4x4","4wd"): out["equip_p_traction"] += 8
                                        if has("bloqueo","diferencial","lock diff"): out["equip_p_traction"] += 5
                                        if has("toma 12v","12v","power 12v") or has("110v","220v"): out["equip_p_utility"] += 3
                                        if has("rieles","riel techo","roof rail"): out["equip_p_utility"] += 3
                                        if has("remolque","enganche","trailer"): out["equip_p_utility"] += 4
                                        # Normalize basic caps to 0..100
                                        caps = {
                                            "equip_p_adas": 45.0,
                                            "equip_p_safety": 18.0,
                                            "equip_p_comfort": 18.0,
                                            "equip_p_infotainment": 20.0,
                                            "equip_p_traction": 13.0,
                                            "equip_p_utility": 10.0,
                                        }
                                        for k in out:
                                            m = caps.get(k, 1.0)
                                            out[k] = round(min(100.0, out[k]*(100.0/m)), 1) if out[k]>0 else 0.0
                                        return out
                                    except Exception:
                                        return out
                                pcols = jdf["equipment"].map(_pillars).apply(pd.Series)
                                for c in ["equip_p_adas","equip_p_safety","equip_p_comfort","equip_p_infotainment","equip_p_traction","equip_p_utility"]:
                                    if c in pcols.columns:
                                        jdf[c] = pcols[c]
                        except Exception:
                            pass
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
                            "longitud_mm","ancho_mm","altura_mm","accel_0_100_s","vmax_kmh","body_style",
                            # tren motriz
                            "transmision","traccion","driven_wheels","doors",
                            # imagen
                            "images_default",
                            # infotainment y conectividad
                            "audio_brand","speakers_count","screen_main_in","screen_cluster_in",
                            "usb_a_count","usb_c_count","power_12v_count","power_110v_count","wireless_charging",
                            # fuel/energy inferred from JSON
                            "categoria_combustible_final",
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

                # JSON manda 100%: si existe columna _from_json, sobrescribe siempre
                def prefer_json(col: str):
                    j = f"{col}_from_json"
                    if j in left.columns:
                        left[col] = left[j]
                        left.drop(columns=[j], inplace=True, errors="ignore")

                prefer_json("equip_score")
                prefer_json("combinado_kml")
                prefer_json("ciudad_kml")
                prefer_json("carretera_kml")
                prefer_json("body_style")
                # Tren motriz / transmisión
                prefer_json("transmision")
                prefer_json("traccion")
                prefer_json("driven_wheels")
                prefer_json("doors")
                # Infer fuel category if missing (from existing fields or version text)
                try:
                    if "categoria_combustible_final" not in left.columns:
                        left["categoria_combustible_final"] = None
                    def _infer_fuel(row):
                        try:
                            val = str(row.get("categoria_combustible_final") or "").strip().lower()
                            if val not in ("", "nan", "none", "null", "-"):
                                return val
                            raw = " ".join([
                                str(row.get("tipo_de_combustible_original") or ""),
                                str(row.get("tipo_combustible") or ""),
                                str(row.get("combustible") or ""),
                                str(row.get("version") or ""),
                            ]).lower()
                            if any(k in raw for k in ("bev","eléctrico","electrico","ev")):
                                return "bev"
                            if any(k in raw for k in ("phev","enchuf")):
                                return "phev"
                            if any(k in raw for k in ("hev","híbrido","hibrido")):
                                return "hev"
                            if any(k in raw for k in ("diesel","diésel","tdi","td","dsl")):
                                return "diesel"
                            if any(k in raw for k in ("premium","ron98")):
                                return "gasolina premium"
                            return "gasolina"
                        except Exception:
                            return None
                    left["categoria_combustible_final"] = left.apply(_infer_fuel, axis=1)
                except Exception:
                    pass
                # performance metrics
                prefer_json("caballos_fuerza")
                prefer_json("torque_nm")
                prefer_json("accel_0_100_s")
                prefer_json("vmax_kmh")
                # dimensions & image
                prefer_json("longitud_mm")
                prefer_json("ancho_mm")
                prefer_json("altura_mm")
                prefer_json("images_default")
                # infotainment details (copy from _from_json if present)
                for _c in [
                    "audio_brand","speakers_count","screen_main_in","screen_cluster_in",
                    "usb_a_count","usb_c_count","power_12v_count","power_110v_count","wireless_charging",
                    "warranty_full_months","warranty_full_km","warranty_powertrain_months","warranty_powertrain_km",
                    "warranty_roadside_months","warranty_roadside_km","warranty_corrosion_months","warranty_corrosion_km",
                    "warranty_electric_months","warranty_electric_km","warranty_battery_months","warranty_battery_km"
                ]:
                    j = f"{_c}_from_json"
                    if j in left.columns:
                        left[_c] = left[j]
                        left.drop(columns=[j], inplace=True, errors="ignore")
                # propagate feature flags and pillar scores (copy if not present)
                for c in cols_to_merge:
                    if c.endswith("_from_json"):
                        continue
                    if (c.startswith("feat_") or c.startswith("equip_p_")):
                        jf = f"{c}_from_json"
                        if jf in left.columns:
                            left[c] = left[jf]
                    left.drop(columns=[f"{c}_from_json"], inplace=True, errors="ignore")

                # JSON 100% para MY 2024-2026: si hay columnas *_from_json restantes, sobrescribir para esos años
                try:
                    if "ano" in left.columns:
                        yrs = pd.to_numeric(left["ano"], errors="coerce").astype("Int64")
                        mask = yrs.isin([2024, 2025, 2026])
                        if mask.any():
                            json_cols = [c for c in left.columns if c.endswith("_from_json")]
                            for col in json_cols:
                                base = col[:-11]
                                if base not in left.columns:
                                    left[base] = None
                                left.loc[mask, base] = left.loc[mask, col]
                                left.drop(columns=[col], inplace=True, errors="ignore")
                except Exception:
                    pass

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
                    # Normalizar: quitar símbolos y mapear "Incluido"/"Sin costo" a 0 + bandera incluida
                    raw = mdf["service_cost_60k_mxn"].astype(str)
                    # Detectar 'Incluido' antes de limpiar
                    included_mask = raw.str.contains(r"(?i)\b(inclu[íi]do|incl\.|sin\s*costo|gratis)\b", regex=True)
                    ser = raw.str.replace("$", "", regex=False).str.replace(",", "", regex=False)
                    ser = ser.replace(r"(?i)\s*(inclu[íi]do|incl\.|sin\s*costo|gratis)\s*", "0", regex=True)
                    mdf["service_cost_60k_mxn"] = pd.to_numeric(ser, errors="coerce")
                    mdf["service_included_60k"] = included_mask.fillna(False).astype(bool)
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
                        svc = mdf[["__mk","__md","__yr","__vr","service_cost_60k_mxn","service_included_60k"]]
                        left = left.merge(svc, on=["__mk","__md","__yr","__vr"], how="left")
                    else:
                        left["service_cost_60k_mxn"] = None
                        left["service_included_60k"] = None
                    # Fill missing by (mk, md, yr)
                    try:
                        # merge by (make, model, year)
                        svc2 = mdf.groupby(["__mk","__md","__yr"], dropna=False)[["service_cost_60k_mxn","service_included_60k"]].first().reset_index()
                        left = left.merge(svc2, on=["__mk","__md","__yr"], how="left", suffixes=("", "_by_model"))
                        left["service_cost_60k_mxn"] = left["service_cost_60k_mxn"].combine_first(left.get("service_cost_60k_mxn_by_model"))
                        left["service_included_60k"] = left["service_included_60k"].combine_first(left.get("service_included_60k_by_model"))
                        left.drop(columns=[c for c in left.columns if c.endswith("_by_model")], inplace=True, errors="ignore")
                        # if still missing, try compact model join (make, modelC, year)
                        missing_mask = left["service_cost_60k_mxn"].isna()
                        if missing_mask.any():
                            svc3 = mdf.groupby(["__mk","__mdc","__yr"], dropna=False)[["service_cost_60k_mxn","service_included_60k"]].first().reset_index()
                            left = left.merge(svc3, left_on=["__mk","__mdc","__yr"], right_on=["__mk","__mdc","__yr"], how="left", suffixes=("", "_by_model_c"))
                            left["service_cost_60k_mxn"] = left["service_cost_60k_mxn"].combine_first(left.get("service_cost_60k_mxn_by_model_c"))
                            left["service_included_60k"] = left["service_included_60k"].combine_first(left.get("service_included_60k_by_model_c"))
                            left.drop(columns=[c for c in left.columns if c.endswith("_by_model_c")], inplace=True, errors="ignore")
                        # if still missing, ignore year and match by version when present
                        missing_mask = left["service_cost_60k_mxn"].isna()
                        if missing_mask.any() and "__vr" in left.columns and "__vr" in mdf.columns:
                            # exact version (make, model, version) ignoring year
                            svc4 = mdf.groupby(["__mk","__md","__vr"], dropna=False)[["service_cost_60k_mxn","service_included_60k"]].first().reset_index()
                            left = left.merge(svc4, on=["__mk","__md","__vr"], how="left", suffixes=("", "_by_ver"))
                            left.loc[missing_mask, "service_cost_60k_mxn"] = left.loc[missing_mask, "service_cost_60k_mxn"].combine_first(left.loc[missing_mask, "service_cost_60k_mxn_by_ver"])
                            left.loc[missing_mask, "service_included_60k"] = left.loc[missing_mask, "service_included_60k"].combine_first(left.loc[missing_mask, "service_included_60k_by_ver"])
                            left.drop(columns=[c for c in left.columns if c.endswith("_by_ver")], inplace=True, errors="ignore")
                        # final fallback: compact model + version, ignoring year
                        missing_mask = left["service_cost_60k_mxn"].isna()
                        if missing_mask.any() and "__vr" in left.columns and "__vr" in mdf.columns:
                            import re as _re
                            mdf["__vrc"] = mdf.get("__vr").map(lambda s: _re.sub(r"[^A-Z0-9]", "", str(s)))
                            left["__vrc"] = left.get("__vr").map(lambda s: _re.sub(r"[^A-Z0-9]", "", str(s)))
                            svc5 = mdf.groupby(["__mk","__mdc","__vrc"], dropna=False)[["service_cost_60k_mxn","service_included_60k"]].first().reset_index()
                            left = left.merge(svc5, left_on=["__mk","__mdc","__vrc"], right_on=["__mk","__mdc","__vrc"], how="left", suffixes=("", "_by_ver_c"))
                            left.loc[missing_mask, "service_cost_60k_mxn"] = left.loc[missing_mask, "service_cost_60k_mxn"].combine_first(left.loc[missing_mask, "service_cost_60k_mxn_by_ver_c"])
                            left.loc[missing_mask, "service_included_60k"] = left.loc[missing_mask, "service_included_60k"].combine_first(left.loc[missing_mask, "service_included_60k_by_ver_c"])
                            left.drop(columns=[c for c in left.columns if c.endswith("_by_ver_c")], inplace=True, errors="ignore")
                        # ultimate fallback: match by (make, model) across any year and any version
                        missing_mask = left["service_cost_60k_mxn"].isna()
                        if missing_mask.any():
                            try:
                                svc6 = mdf.groupby(["__mk","__md"], dropna=False)[["service_cost_60k_mxn","service_included_60k"]].first().reset_index()
                                left = left.merge(svc6, on=["__mk","__md"], how="left", suffixes=("", "_by_model_any"))
                                left["service_cost_60k_mxn"] = left["service_cost_60k_mxn"].combine_first(left.get("service_cost_60k_mxn_by_model_any"))
                                left["service_included_60k"] = left["service_included_60k"].combine_first(left.get("service_included_60k_by_model_any"))
                                left.drop(columns=[c for c in left.columns if c.endswith("_by_model_any")], inplace=True, errors="ignore")
                            except Exception:
                                pass
                    except Exception:
                        pass
                    # Sync back
                    if "service_cost_60k_mxn" in left.columns:
                        # Enforce minimum of 1 MXN when not included and year in 2024–2026
                        try:
                            yrs = pd.to_numeric(left.get("__yr"), errors="coerce").astype("Int64") if "__yr" in left.columns else None
                            inc = left.get("service_included_60k") if "service_included_60k" in left.columns else None
                            val = pd.to_numeric(left["service_cost_60k_mxn"], errors="coerce")
                            mask = val.fillna(0).le(0)
                            if yrs is not None:
                                mask = mask & yrs.isin([2024,2025,2026])
                            if inc is not None:
                                mask = mask & (~inc.fillna(False))
                            left.loc[mask, "service_cost_60k_mxn"] = 1.0
                        except Exception:
                            pass
                        df["service_cost_60k_mxn"] = left["service_cost_60k_mxn"]
                    if "service_included_60k" in left.columns:
                        df["service_included_60k"] = left["service_included_60k"]
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
                # Primary join: (make, model, year)
                left = left.merge(s[["__mk","__md","__yr", *cols]], on=["__mk","__md","__yr"], how="left", suffixes=("", "_ytd"))
                # Fallback: if no monthly data matched because the selected year is not in the CSV,
                # attach 2025 monthly data by (make, model) ignoring year so that charts can render.
                try:
                    missing = left.get("ventas_ytd_2025").isna() if "ventas_ytd_2025" in left.columns else None
                except Exception:
                    missing = None
                if missing is not None and missing.any():
                    s_any = s.groupby(["__mk","__md"], dropna=False)[cols].first().reset_index()
                    left = left.merge(s_any, on=["__mk","__md"], how="left", suffixes=("", "_any"))
                    for c in cols:
                        try:
                            src = f"{c}_any"
                            if c in left.columns and src in left.columns:
                                left.loc[missing, c] = left.loc[missing, c].combine_first(left.loc[missing, src])
                        except Exception:
                            pass
                    # Clean helper columns
                    left.drop(columns=[c for c in left.columns if c.endswith("_any") or c.endswith("_ytd")], inplace=True, errors="ignore")
                df = left
        except Exception:
            pass

        # Set segments directly from catalog body_style (with only 'todo terreno' -> "SUV'S")
        try:
            if "segmento_ventas" not in df.columns:
                df["segmento_ventas"] = None
            if "body_style" in df.columns:
                def _seg_from_body(s: str) -> str | None:
                    s = str(s or "").strip()
                    if not s or s.lower() in {"nan","none","null","na","n/a","-"}:
                        return None
                    return "SUV'S" if "todo terreno" in s.lower() else s
                # Overwrite to ensure consistent source for segments
                df["segmento_ventas"] = df["body_style"].map(_seg_from_body)
        except Exception:
            pass

        _DF = df
        _DF_MTIME = m
    return _DF


# ------------------------------- API: /options ---------------------------
@app.get("/options")
def get_options(make: Optional[str] = None, model: Optional[str] = None, year: Optional[int] = None) -> Dict[str, Any]:
    df0 = _load_catalog().copy()
    # Canonicalize incoming params to match dataset
    make = _canon_make(make) if make else make
    model = _canon_model(make, model) if model else model
    # Cache lookup (TTL + source signature)
    try:
        ttl = int(os.getenv("OPTIONS_CACHE_TTL_SEC", "300"))
    except Exception:
        ttl = 300
    try:
        key = f"{(make or '').upper()}|{(model or '').upper()}|{int(year) if year is not None else ''}"
    except Exception:
        key = f"{(make or '').upper()}|{(model or '').upper()}|{year or ''}"
    try:
        now = datetime.utcnow().timestamp()
        sig = _options_cache_sig()
        ent = _OPTIONS_CACHE.get(key)
        if ent and ent.get("sig") == sig and (now - float(ent.get("ts", 0))) < ttl:
            return ent.get("val", {})
    except Exception:
        pass

    df = df0.copy()
    _ensure_options_index()
    idx = _OPTIONS_IDX or {"models": {}, "models_compact": {}}
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

    # Build top-level lists from catalog filtered to allowed years (coverage completa)
    try:
        if pd is not None:
            makes_all = sorted(map(str, df.get("make", pd.Series(dtype=str)).astype(str).str.upper().dropna().unique().tolist()))
            models_all = sorted(map(str, df.get("model", pd.Series(dtype=str)).astype(str).str.upper().dropna().unique().tolist()))
        else:
            makes_all, models_all = [], []
    except Exception:
        makes_all, models_all = [], []

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
        def _compact(s: str) -> str:
            import re as _re
            return _re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
        target = (model or "").upper()
        target_c = _compact(model)
        # Pull from index first
        model_key = target
        if model_key not in idx["models"] and target_c in idx.get("models_compact", {}):
            model_key = idx["models_compact"][target_c]
        rec = idx["models"].get(model_key) or {"makes": set(), "years": set(), "versions_by_year": {}, "by_make": {}}
        mf = set(rec.get("makes", set()))
        years_set = set(rec.get("years", set()))
        versions_set: set[str] = set()
        if year is not None:
            byyr = rec.get("versions_by_year", {}).get(int(year), set())
            versions_set.update(byyr)
            if make:
                bm = rec.get("by_make", {}).get(make.upper(), {})
                versions_set.update(bm.get("versions_by_year", {}).get(int(year), set()))
        # Merge from processed / flat / JSON vehicles only when index lacks enough info
        if (not years_set) or (year is not None and not versions_set) or (make and make.upper() not in mf):
            try:
                # Processed base catalog
                proc = ROOT / "data" / "equipo_veh_limpio_procesado.csv"
                if proc.exists():
                    t = pd.read_csv(proc, low_memory=False)
                    t.columns = [str(c).strip().lower() for c in t.columns]
                    if {"make","model","ano"}.issubset(t.columns):
                        tt = t[(t["model"].astype(str).str.upper()==target) | (t["model"].astype(str).map(_compact)==target_c)]
                        if make and "make" in tt.columns:
                            # Canonicalize make before comparison to avoid alias mismatches
                            mk_up = tt["make"].astype(str).map(lambda s: (_canon_make(s) or str(s).strip().upper()))
                            tt = tt[mk_up == make.upper()]
                        mf.update(tt["make"].astype(str).str.upper().dropna().unique().tolist())
                        years_set.update(pd.to_numeric(tt["ano"], errors="coerce").dropna().astype(int).unique().tolist())
                        if year and "version" in tt.columns:
                            vv = tt[pd.to_numeric(tt["ano"], errors="coerce").fillna(0).astype(int)==int(year)]["version"].dropna().astype(str).tolist()
                            versions_set.update(vv)
                # Flat enriched
                flat = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
                if flat.exists():
                    t = pd.read_csv(flat, low_memory=False)
                    t.columns = [str(c).strip().lower() for c in t.columns]
                    if {"make","model","ano"}.issubset(t.columns):
                        tt = t[(t["model"].astype(str).str.upper()==target) | (t["model"].astype(str).map(_compact)==target_c)]
                        if make and "make" in tt.columns:
                            mk_up = tt["make"].astype(str).map(lambda s: (_canon_make(s) or str(s).strip().upper()))
                            tt = tt[mk_up == make.upper()]
                        mf.update(tt["make"].astype(str).str.upper().dropna().unique().tolist())
                        years_set.update(pd.to_numeric(tt["ano"], errors="coerce").dropna().astype(int).unique().tolist())
                        if year and "version" in tt.columns:
                            vv = tt[pd.to_numeric(tt["ano"], errors="coerce").fillna(0).astype(int)==int(year)]["version"].dropna().astype(str).tolist()
                            versions_set.update(vv)
                # JSON curated direct
                import json as _json
                js = ROOT / "data" / "vehiculos-todos.json"
                if not js.exists():
                    js = ROOT / "data" / "vehiculos-todos1.json"
                if js.exists():
                    data = _json.loads(js.read_text(encoding="utf-8"))
                    items = data.get("vehicles") if isinstance(data, dict) else (data if isinstance(data, list) else [])
                    for v in items or []:
                        mk = (v.get("manufacturer",{}) or {}).get("name") or (v.get("make",{}) or {}).get("name") or ""
                        md = (v.get("model",{}) or {}).get("name") or ""
                        yr = (v.get("version",{}) or {}).get("year") or None
                        mk_can = _canon_make(mk) or str(mk).strip().upper()
                        if (str(md).strip().upper()==target or _compact(md)==target_c) and ((not make) or (mk_can==make.upper())):
                            if mk:
                                mf.add(str(mk).strip().upper())
                            try:
                                years_set.add(int(yr))
                            except Exception:
                                pass
                            if year and yr is not None and str(yr).isdigit() and int(yr)==int(year):
                                name = (v.get("version") or {}).get("name") or ""
                                if name:
                                    versions_set.add(str(name))
            except Exception:
                pass
        years_all = sorted([y for y in years_set if y in ALLOWED_YEARS])
        mf = sorted(list(mf))
        years = _filter_years(years_all)
        payload["makes_for_model"] = mf
        payload["years"] = years
        if years:
            payload["autofill"]["default_year"] = max(years)
        # Versions fallback from all sources when catalog lacks them
        if year and not payload.get("versions"):
            try:
                vlist = sorted({str(v).strip() for v in versions_set if str(v).strip()})
                if vlist:
                    payload["versions"] = vlist
            except Exception:
                pass
        if mf:
            payload["autofill"]["make_from_model"] = mf[0]
        # Final fallback: derive versions from main catalog for selected filters
        if year and not payload.get("versions"):
            try:
                sub2 = df0.copy()
                if make and "make" in sub2.columns:
                    sub2 = sub2[sub2["make"].astype(str).str.upper() == make.upper()]
                if model and "model" in sub2.columns:
                    sub2 = sub2[sub2["model"].astype(str).str.upper() == model.upper()]
                if "ano" in sub2.columns:
                    sub2 = sub2[pd.to_numeric(sub2["ano"], errors="coerce").fillna(0).astype(int) == int(year)]
                if "version" in sub2.columns:
                    vlist = sorted(map(str, sub2["version"].dropna().unique().tolist()))
                    if vlist:
                        payload["versions"] = vlist
            except Exception:
                pass

    if make and not model:
        sub = df[df["make"].str.upper() == make.upper()]
        models = sorted(sub["model"].str.upper().dropna().unique().tolist()) if len(sub) else []
        years_all = sorted(sub.get("ano", pd.Series(dtype=int)).dropna().unique().tolist()) if len(sub) else []
        # Add from index
        try:
            _ensure_options_index()
            idx = _OPTIONS_IDX or {"models": {}}
            if idx.get("models"):
                for m, rec in idx["models"].items():
                    makes = {str(x).upper() for x in rec.get("makes", set())}
                    if make.upper() in makes:
                        # Incluir solo modelos con años permitidos
                        yrs = set(rec.get("years", set()))
                        if yrs.intersection(ALLOWED_YEARS):
                            models.append(m)
                            years_all.extend(list(yrs))
                models = sorted(list(set(models)))
                years_all = sorted(list({int(y) for y in years_all if int(y) in ALLOWED_YEARS}))
        except Exception:
            pass
        years = _filter_years(years_all)
        payload["models_for_make"] = models
        payload["years"] = years

    audit("resp", "/options", query={"make": make, "model": model, "year": year}, body_keys=list(payload.keys()))
    # Save to cache
    try:
        _OPTIONS_CACHE[key] = {"ts": datetime.utcnow().timestamp(), "sig": _options_cache_sig(), "val": payload}
        # Evict oldest if cache grows too large
        if len(_OPTIONS_CACHE) > 500:
            items = sorted(_OPTIONS_CACHE.items(), key=lambda kv: kv[1].get("ts", 0))
            for k, _ in items[: max(1, len(items)//5) ]:
                _OPTIONS_CACHE.pop(k, None)
    except Exception:
        pass
    return payload


# -------------------------------- API: /catalog --------------------------
@app.get("/catalog")
def get_catalog(limit: int = Query(1000, ge=1, le=20000), make: Optional[str] = None, model: Optional[str] = None, year: Optional[int] = None, format: Optional[str] = None, q: Optional[str] = None) -> Any:  # type: ignore
    df = _load_catalog()
    # Canonicalize incoming filters
    make = _canon_make(make) if make else make
    model = _canon_model(make, model) if model else model
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
    # Fallback: if no rows after filters, try building from external sources (processed/flat/JSON)
    if (make or model) and (len(sub) == 0):
        try:
            mk_up = _canon_make(make) or (make or "").upper()
            md_up = _canon_model(make, model) or (model or "").upper()
            def _add_row(arr, mk, md, vr, yr, msrp=None, tx=None, fuel=None, kml=None, hp=None, length=None, eq=None):
                # canonicalize fallback rows too
                mk = _canon_make(mk) or str(mk or '').upper()
                md = _canon_model(mk, md) or str(md or '').upper()
                def _num(x):
                    try:
                        v = float(str(x).replace(',', '').strip())
                        return v
                    except Exception:
                        return None
                row = {c: None for c in df.columns}
                # Precio TX: si no existe o no es válido, usa MSRP como fallback
                txf = _num(tx)
                msf = _num(msrp)
                row.update({"make": mk, "model": md, "version": vr, "ano": yr, "msrp": msrp, "precio_transaccion": (txf if (txf is not None and txf > 0) else msf),
                            "categoria_combustible_final": fuel, "combinado_kml": kml, "caballos_fuerza": hp, "longitud_mm": length, "equip_score": eq})
                arr.append(row)
            new_rows: list[dict] = []
            import json as _json, re as _re
            def _to_kml(val):
                try:
                    s = str(val or "").strip().lower()
                    if not s or s in {"nan","none","null","-"}: return None
                    # Tratar 'mpg' como km/l (bug en JSON)
                    m = _re.search(r"(\d+[\.,]?\d*)\s*mpg", s)
                    if m: return float(m.group(1).replace(',', '.'))
                    m = _re.search(r"(\d+[\.,]?\d*)\s*l\s*/\s*100\s*km", s)
                    if m:
                        l100 = float(m.group(1).replace(',', '.'))
                        return 100.0/l100 if l100>0 else None
                    m = _re.search(r"(\d+[\.,]?\d*)\s*(km/?l|kml)", s)
                    if m: return float(m.group(1).replace(',', '.'))
                    m = _re.search(r"(\d+[\.,]?\d*)", s)
                    if m: return float(m.group(1).replace(',', '.'))
                    return None
                except Exception:
                    return None
            # JSON
            pjson = ROOT / "data" / "vehiculos-todos.json"
            if not pjson.exists(): pjson = ROOT / "data" / "vehiculos-todos1.json"
            if pjson.exists():
                data = _json.loads(pjson.read_text(encoding="utf-8"))
                items = data.get("vehicles") if isinstance(data, dict) else (data if isinstance(data, list) else [])
                for v in items or []:
                    mk = (v.get("manufacturer",{}) or {}).get("name") or (v.get("make",{}) or {}).get("name") or ""
                    md = (v.get("model",{}) or {}).get("name") or ""
                    ver = (v.get("version",{}) or {}).get("name") or ""
                    yr = (v.get("version",{}) or {}).get("year") or None
                    if mk and md and yr and str(yr).isdigit():
                        if (not make or mk.upper()==mk_up) and (not model or md.upper()==md_up) and (not year or int(yr)==int(year)):
                            msrp = (v.get("pricing",{}) or {}).get("msrp")
                            fe = (v.get("fuelEconomy",{}) or {})
                            kml = _to_kml(fe.get("combined")) or _to_kml(fe.get("city")) or _to_kml(fe.get("highway"))
                            _add_row(new_rows, mk, md, ver, int(yr), msrp=msrp, kml=kml)
            # Processed CSV
            pproc = ROOT / "data" / "equipo_veh_limpio_procesado.csv"
            if pproc.exists() and pd is not None:
                t = pd.read_csv(pproc, low_memory=False)
                t.columns = [str(c).strip().lower() for c in t.columns]
                q = t.copy()
                if make: q = q[q["make"].astype(str).str.upper()==mk_up]
                if model: q = q[q["model"].astype(str).str.upper()==md_up]
                if year and "ano" in q.columns:
                    q = q[pd.to_numeric(q["ano"], errors="coerce").fillna(0).astype(int)==int(year)]
                for _, r in q.iterrows():
                    _add_row(new_rows, r.get("make",""), r.get("model",""), r.get("version"), int(r.get("ano")) if not pd.isna(r.get("ano")) else None,
                             msrp=r.get("msrp"), tx=r.get("precio_transaccion"), fuel=r.get("categoria_combustible_final"), kml=r.get("combinado_kml"), hp=r.get("caballos_fuerza"), length=r.get("longitud_mm"))
            # Flat CSV
            pflat = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
            if pflat.exists() and pd is not None:
                t = pd.read_csv(pflat, low_memory=False)
                t.columns = [str(c).strip().lower() for c in t.columns]
                q = t.copy()
                if make: q = q[q["make"].astype(str).str.upper()==mk_up]
                if model: q = q[q["model"].astype(str).str.upper()==md_up]
                if year and "ano" in q.columns:
                    q = q[pd.to_numeric(q["ano"], errors="coerce").fillna(0).astype(int)==int(year)]
                for _, r in q.iterrows():
                    _add_row(new_rows, r.get("make",""), r.get("model",""), r.get("version"), int(r.get("ano")) if not pd.isna(r.get("ano")) else None,
                             msrp=r.get("msrp"), tx=r.get("precio_transaccion"), fuel=r.get("categoria_combustible_final"), kml=r.get("combinado_kml"), hp=r.get("caballos_fuerza"), length=r.get("longitud_mm"))
            if new_rows:
                sub = pd.DataFrame(new_rows)
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
    # Helper to derive a display segment
    def _seg_display(row: Dict[str, Any]) -> Optional[str]:
        try:
            s = str(row.get("segmento_ventas") or row.get("body_style") or "").strip().lower()
            if not s:
                return None
            if any(x in s for x in ("pick","cab","chasis","camioneta")):
                return "Pickup"
            if any(x in s for x in ("todo terreno","suv","suvs","crossover","sport utility")):
                return "SUV'S"
            if "van" in s:
                return "Van"
            if any(x in s for x in ("hatch","hb")):
                return "Hatchback"
            if any(x in s for x in ("sedan","sedán","saloon")):
                return "Sedán"
            return row.get("segmento_ventas") or row.get("body_style") or None
        except Exception:
            return None

    def _ver_display(row: Dict[str, Any]) -> Optional[str]:
        try:
            return _norm_version_name(str(row.get("version") or "")) or None
        except Exception:
            return None

    # --- Energy cost fallback (60k km) ---
    def _fuel_raw(row: Dict[str, Any]) -> str:
        for k in ("categoria_combustible_final", "tipo_de_combustible_original", "fuel_type"):
            v = row.get(k)
            if v:
                return str(v)
        return ""
    def _kml_from_row(row: Dict[str, Any]) -> Optional[float]:
        cand = [
            "combinado_kml","kml_mixto","mixto_kml","rendimiento_mixto_kml","consumo_mixto_kml","consumo_combinado_kml",
            "combinado_km_l","km_l_mixto","mixto_km_l","rendimiento_mixto_km_l","rendimiento_combinado_km_l","consumo_combinado_km_l",
        ]
        for c in cand:
            v = to_num(row.get(c))
            if v is not None and v > 0:
                return float(v)
        # L/100km -> kml
        for c in ("mixto_l_100km","consumo_mixto_l_100km","l_100km_mixto"):
            v = to_num(row.get(c))
            if v is not None and v > 0:
                try:
                    return 100.0/float(v)
                except Exception:
                    pass
        return None
    def _fuel_price_for(row: Dict[str, Any]) -> Optional[float]:
        try:
            cfg = get_config()
        except Exception:
            cfg = {"fuel_prices": {}}
        prices = cfg.get("fuel_prices", {})
        lc = _fuel_raw(row).lower()
        if not lc:
            return None
        if "elect" in lc:
            return 0.0
        if "diesel" in lc:
            return to_num(prices.get("diesel_litro"))
        if "premium" in lc:
            return to_num(prices.get("gasolina_premium_litro") or prices.get("gasolina_magna_litro"))
        # magna / regular / gasolina genérica
        if "magna" in lc or "regular" in lc:
            return to_num(prices.get("gasolina_magna_litro") or prices.get("gasolina_premium_litro"))
        if any(k in lc for k in ("gas", "nafta", "petrol", "gasolina")):
            return to_num(prices.get("gasolina_magna_litro") or prices.get("gasolina_premium_litro"))
        return None
    def ensure_fuel_60(row: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(row)
        if out.get("fuel_cost_60k_mxn") is None:
            kml = _kml_from_row(out)
            price = _fuel_price_for(out)
            if (kml is not None) and (price is not None):
                try:
                    out["fuel_cost_60k_mxn"] = round((60000.0 / float(kml)) * float(price))
                except Exception:
                    pass
        return out

    # --- Equipment proxies (row‑level) ---
    def _to01(v: Any) -> int:
        try:
            s = str(v).strip().lower()
        except Exception:
            s = ""
        if s in {"true","1","si","sí","estandar","estándar","incluido","standard","std","present","x","y"}:
            return 1
        try:
            return 1 if float(s) > 0 else 0
        except Exception:
            return 0

    def ensure_equip_score(row: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(row)
        val = to_num(out.get("equip_score"))
        if val is not None and val > 0:
            return out
        # Simple proxy basado en presencia de features comunes
        keys = [
            "android_auto","apple_carplay","tiene_pantalla_tactil","camara_360",
            "sensor_punto_ciego","alerta_colision","abs","control_estabilidad",
            "llave_inteligente","aire_acondicionado","apertura_remota_maletero",
            "cierre_automatico_maletero","ventanas_electricas","seguros_electricos",
        ]
        have = 0
        present = 0
        for k in keys:
            valk = out.get(k)
            if valk is None or str(valk).strip() == "":
                continue
            present += 1
            if _to01(valk):
                have += 1
        if present == 0:
            out["equip_score"] = 50.0
        else:
            try:
                out["equip_score"] = round((have/float(present))*100.0, 1)
            except Exception:
                out["equip_score"] = 50.0
        return out

    def ensure_pillars(row: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(row)
        # Build proxies 0..100 para cada pilar solo si faltan o <=0
        def _maybe(col: str, val: float) -> None:
            cur = to_num(out.get(col))
            if cur is None or cur <= 0:
                out[col] = round(max(0.0, min(100.0, val)), 1)
        # ADAS
        adas = sum(_to01(out.get(k)) for k in ("alerta_colision","sensor_punto_ciego","camara_360","asistente_estac_frontal","asistente_estac_trasero"))
        _maybe("equip_p_adas", (adas/5.0)*100.0)
        # Seguridad
        safety = sum(_to01(out.get(k)) for k in ("abs","control_estabilidad","bolsas_cortina_todas_filas","bolsas_aire_delanteras_conductor","bolsas_aire_delanteras_pasajero"))
        _maybe("equip_p_safety", (safety/5.0)*100.0)
        # Confort
        comfort = sum(_to01(out.get(k)) for k in ("llave_inteligente","aire_acondicionado","apertura_remota_maletero","cierre_automatico_maletero","ventanas_electricas","seguros_electricos"))
        _maybe("equip_p_comfort", (comfort/6.0)*100.0)
        # Info
        info = sum(_to01(out.get(k)) for k in ("tiene_pantalla_tactil","android_auto","apple_carplay","bocinas"))
        _maybe("equip_p_infotainment", (info/4.0)*100.0)
        # Tracción (control de tracción o 4x4/AWD)
        try:
            dw = str(out.get("driven_wheels") or out.get("traccion_original") or "").lower()
        except Exception:
            dw = ""
        trac = _to01(out.get("control_electrico_de_traccion")) or (1 if ("4x4" in dw or "awd" in dw or "4wd" in dw) else 0)
        _maybe("equip_p_traction", trac*100.0)
        # Utilidad
        util = sum(_to01(out.get(k)) for k in ("rieles_techo","enchufe_12v","preparacion_remolque","enganche_remolque","tercera_fila"))
        _maybe("equip_p_utility", (util/5.0)*100.0)
        return out

    # Enrich: try to fill common boolean features for a row from the main catalog
    def _ensure_features_from_catalog(row: Dict[str, Any]) -> None:
        """Try to populate common boolean features for the given row from the catalog.

        Strategy:
          1) Filter by make+model and same MY (if available).
          2) Prefer exact version match (case-insensitive). If not found, pick the row with
             highest feature coverage among candidates (max number of non-empty values
             in the features list).
          3) For each feature missing in `row`, copy the value from the picked candidate when non-empty.
        """
        try:
            df = _load_catalog().copy()
            for c in ("make", "model", "version"):
                if c in df.columns:
                    df[c] = df[c].astype(str)
            mk = str(row.get("make") or "").strip().upper()
            md = str(row.get("model") or "").strip().upper()
            vr = str(row.get("version") or "").strip().upper()
            try:
                yr = int(row.get("ano")) if row.get("ano") is not None else None
            except Exception:
                yr = None
            sub = df[(df.get("make").astype(str).str.upper() == mk) & (df.get("model").astype(str).str.upper() == md)]
            if yr is not None and "ano" in sub.columns:
                try:
                    sub = sub[pd.to_numeric(sub["ano"], errors="coerce") == int(yr)]
                except Exception:
                    pass
            if sub.empty:
                return
            # Candidate preference: exact version match first
            if vr and "version" in sub.columns:
                cand = sub[sub["version"].astype(str).str.upper() == vr]
                if not cand.empty:
                    sub = cand
            # List of features we care about
            feat_cols = [
                "alerta_colision","sensor_punto_ciego","tiene_camara_punto_ciego","camara_360",
                "asistente_estac_frontal","asistente_estac_trasero","control_frenado_curvas","llave_inteligente",
                "tiene_pantalla_tactil","android_auto","apple_carplay","techo_corredizo","apertura_remota_maletero",
                "cierre_automatico_maletero","limpiaparabrisas_lluvia","rieles_techo","tercera_fila",
                "enganche_remolque","preparacion_remolque","asientos_calefaccion_conductor","asientos_calefaccion_pasajero",
                "asientos_ventilacion_conductor","asientos_ventilacion_pasajero",
                # básicos eléctricos
                "ventanas_electricas","seguros_electricos","control_electrico_de_traccion",
            ]
            # Pick best-covered row (max non-empty features) if multiple remain
            try:
                def _nz_count(sr):
                    cnt = 0
                    for k in feat_cols:
                        if k in sr.index:
                            v = sr[k]
                            if v is None:
                                continue
                            s = str(v).strip()
                            if s != "" and s.lower() not in {"nan","none","null"}:
                                cnt += 1
                    return cnt
                if len(sub) > 1:
                    sub = sub.assign(__cov=sub.apply(_nz_count, axis=1)).sort_values(by=["__cov"], ascending=False)
            except Exception:
                pass
            s0 = sub.iloc[0].to_dict()
            for c in feat_cols:
                if row.get(c) is None:
                    v = s0.get(c)
                    if v is None:
                        continue
                    s = str(v).strip() if v is not None else ""
                    if s == "":
                        continue
                    row[c] = v
        except Exception:
            pass

    # Optional overlay: force/patch features by (make, model, year, version)
    _FEATURES_OVERLAY_CACHE = {"df": None, "mtime": None}
    def _apply_features_overlay(row: Dict[str, Any]) -> None:
        try:
            p = ROOT / "data" / "overrides" / "features_overlay.csv"
            if not p.exists():
                return
            mt = p.stat().st_mtime
            df = _FEATURES_OVERLAY_CACHE.get("df")
            if df is None or _FEATURES_OVERLAY_CACHE.get("mtime") != mt:
                import pandas as _pd
                t = _pd.read_csv(p, low_memory=False)
                t.columns = [str(c).strip().lower() for c in t.columns]
                for c in ("make","model","version"):
                    if c in t.columns:
                        t[c] = t[c].astype(str)
                _FEATURES_OVERLAY_CACHE["df"] = t
                _FEATURES_OVERLAY_CACHE["mtime"] = mt
                df = t
            if df is None or len(df) == 0:
                return
            import pandas as _pd
            mk = str(row.get("make") or "").strip().upper()
            md = str(row.get("model") or "").strip().upper()
            vr = str(row.get("version") or "").strip().upper()
            try:
                yr = int(row.get("ano")) if row.get("ano") is not None else None
            except Exception:
                yr = None
            dd = df.copy()
            if "make" in dd.columns:
                dd = dd[dd["make"].astype(str).str.upper() == mk]
            if "model" in dd.columns:
                dd = dd[dd["model"].astype(str).str.upper() == md]
            if dd.empty:
                return
            # pick best match
            cand = None
            if yr is not None and "ano" in dd.columns:
                try:
                    cyr = dd[_pd.to_numeric(dd["ano"], errors="coerce") == int(yr)]
                    if not cyr.empty:
                        dd = cyr
                except Exception:
                    pass
            if vr and "version" in dd.columns:
                cvr = dd[dd["version"].astype(str).str.upper() == vr]
                if not cvr.empty:
                    dd = cvr
            if dd.empty:
                return
            cand = dd.iloc[0].to_dict()
            # Apply overlay values (non-empty) to row
            for k, v in cand.items():
                if k in {"make","model","version","ano"}:
                    continue
                if v is None:
                    continue
                s = str(v).strip()
                if s == "":
                    continue
                row[k] = v
        except Exception:
            pass

    # Optional: model-level YTD units from precomputed monthly file (sum of all versions)
    def _build_model_ytd_lookup(year: int) -> Dict[tuple, tuple[int, Optional[int]]]:
        """Return {(MAKE,MODEL,YEAR): (ytd_units, last_month_with_data)}"""
        out: Dict[tuple, tuple[int, Optional[int]]] = {}
        try:
            path = ROOT / "data" / "enriched" / f"sales_ytd_{year}.csv"
            if not path.exists() and year != 2025:
                path = ROOT / "data" / "enriched" / "sales_ytd_2025.csv"
            if not path.exists():
                return out
            import pandas as _pd  # lazy import
            s = _pd.read_csv(path, low_memory=False)
            s.columns = [str(c).strip().lower() for c in s.columns]
            def up(v): return str(v or "").strip().upper()
            s["__mk"] = s.get("make", _pd.Series(dtype=str)).map(up)
            s["__md"] = s.get("model", _pd.Series(dtype=str)).map(up)
            s["__yr"] = _pd.to_numeric(s.get("ano"), errors="coerce").astype("Int64")
            # sumar columnas mensuales ventas_{year}_MM si existen
            months = [c for c in s.columns if str(c).startswith(f"ventas_{year}_")]
            if not months:
                return out
            s["__ytd"] = s[months].apply(lambda r: _pd.to_numeric(r, errors="coerce").fillna(0).sum(), axis=1)
            # último mes con datos
            def _last_m(row):
                for m in range(12, 0, -1):
                    col = f"ventas_{year}_{m:02d}"
                    try:
                        v = float(row.get(col))
                        if v and v > 0:
                            return m
                    except Exception:
                        pass
                return None
            s["__lm"] = s.apply(_last_m, axis=1)
            for _, row in s.iterrows():
                key = (row["__mk"], row["__md"], int(row["__yr"]) if not _pd.isna(row["__yr"]) else year)
                ytd = int(float(row.get("__ytd") or 0))
                lm = (int(row.get("__lm")) if row.get("__lm") == row.get("__lm") else None)
                out[key] = (ytd, lm)
        except Exception:
            return out
        return out

    def _build_segment_totals(year: int) -> tuple[Dict[str, int], Dict[tuple, str]]:
        """Return (segment_ytd_totals, seg_map[(MK,MD)] = seg).

        Preferir equipo_veh_limpio_procesado.csv (columna body_style/body_type) como fuente de segmento por modelo.
        Fallback: data/enriched/vehiculos_todos_flat.csv.
        """
        totals: Dict[str, int] = {}
        seg_map: Dict[tuple, str] = {}
        try:
            import pandas as _pd
            def _norm_seg(sv: str) -> str:
                s0 = (sv or "").strip().lower()
                if any(x in s0 for x in ("pick","cab","chasis","camioneta")): return "Pickup"
                if any(x in s0 for x in ("todo terreno","suv","crossover","sport utility")): return "SUV'S"
                if "van" in s0: return "Van"
                if any(x in s0 for x in ("hatch","hb")): return "Hatchback"
                if any(x in s0 for x in ("sedan","sedán","saloon")): return "Sedán"
                return sv

            built = False
            # 1) equipo_veh_limpio_procesado.csv
            proc = ROOT / "data" / "equipo_veh_limpio_procesado.csv"
            if proc.exists():
                f = _pd.read_csv(proc, low_memory=False)
                f.columns = [str(c).strip().lower() for c in f.columns]
                col_seg = None
                for c in ("body_type", "body_style"):
                    if c in f.columns:
                        col_seg = c; break
                if col_seg and {"make","model"}.issubset(f.columns):
                    ff = f[["make","model", col_seg]].dropna(how="any")
                    ff["seg"] = ff[col_seg].astype(str).map(_norm_seg)
                    grp = ff.groupby([ff["make"].astype(str).str.upper(), ff["model"].astype(str).str.upper()])["seg"].agg(lambda x: x.value_counts().idxmax())
                    seg_map = {k: v for k, v in grp.to_dict().items()}
                    built = True

            # 2) Fallback: vehiculos_todos_flat.csv
            if not built:
                flat = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
                if flat.exists():
                    f = _pd.read_csv(flat, low_memory=False)
                    f.columns = [str(c).strip().lower() for c in f.columns]
                    if {"make","model"}.issubset(f.columns):
                        ff = f[["make","model","segmento_ventas","body_style"]].dropna(how="all")
                        ff["seg"] = ff["segmento_ventas"].fillna(ff["body_style"]).astype(str).map(_norm_seg)
                        grp = ff.groupby([ff["make"].astype(str).str.upper(), ff["model"].astype(str).str.upper()])["seg"].agg(lambda x: x.value_counts().idxmax())
                        seg_map = {k: v for k, v in grp.to_dict().items()}

            # 3) ventas YTD por segmento
            path = ROOT / "data" / "enriched" / f"sales_ytd_{year}.csv"
            if not path.exists():
                path = ROOT / "data" / "enriched" / "sales_ytd_2025.csv"
            if not path.exists():
                return totals, seg_map
            s = _pd.read_csv(path, low_memory=False)
            s.columns = [str(c).strip().lower() for c in s.columns]
            def up(v): return str(v or "").strip().upper()
            s["__mk"], s["__md"] = s.get("make"," ").map(up), s.get("model"," ").map(up)
            s["seg"] = s.apply(lambda r: seg_map.get((r["__mk"], r["__md"])) or "(sin segmento)", axis=1)
            months = [c for c in s.columns if str(c).startswith(f"ventas_{year}_")]
            if not months:
                return totals, seg_map
            s["__ytd"] = s[months].apply(lambda r: _pd.to_numeric(r, errors="coerce").fillna(0).sum(), axis=1)
            by = s.groupby("seg")["__ytd"].sum()
            totals = {str(k): int(v) for k, v in by.to_dict().items()}
        except Exception:
            return totals, seg_map
        return totals, seg_map

    try:
        yr_pref = int(own.get("ano")) if own.get("ano") else 2025
    except Exception:
        yr_pref = 2025
    _MODEL_YTD = _build_model_ytd_lookup(yr_pref)
    _SEG_TOTALS, _SEG_MAP = _build_segment_totals(yr_pref)
    # Precompute 2025 totals for fallback shares
    _SEG_TOTALS_2025, _SEG_MAP_2025 = _build_segment_totals(2025)

    # Attach monthly sales (ventas_2025_MM) to a row when available in catalog; fall back to 2025 by (make,model)
    def _attach_monthlies(row: Dict[str, Any]) -> Dict[str, Any]:
        """Attach ventas_2025_MM from sales_ytd_2025.csv (preferred) or from catalog if present."""
        mk = _canon_make(row.get("make")) or ""
        md = _canon_model(mk, row.get("model")) or ""
        try:
            # Prefer sales_ytd_2025.csv
            path = ROOT / "data" / "enriched" / "sales_ytd_2025.csv"
            if path.exists() and pd is not None:
                s = pd.read_csv(path, low_memory=False)
                s.columns = [str(c).strip().lower() for c in s.columns]
                def up(v): return str(v or "").strip().upper()
                s["__mk"], s["__md"] = s.get("make"," ").map(up), s.get("model"," ").map(up)
                pick = None
                ss = s[(s["__mk"] == mk) & (s["__md"] == md)]
                if not ss.empty:
                    pick = ss.iloc[0]
                if pick is None:
                    # model-only match
                    ss2 = s[s["__md"] == md]
                    if not ss2.empty:
                        pick = ss2.sort_values(by=list(ss2.columns)).iloc[0]
                if pick is not None:
                    for m in range(1,13):
                        col = f"ventas_2025_{m:02d}"
                        if col in s.columns and row.get(col) is None:
                            try:
                                row[col] = int(float(pick.get(col) or 0))
                            except Exception:
                                pass
                    if row.get("ventas_ytd_2025") is None and "ventas_ytd_2025" in s.columns:
                        try: row["ventas_ytd_2025"] = int(float(pick.get("ventas_ytd_2025") or 0))
                        except Exception: pass
        except Exception:
            pass
        # Fallback: catalog (por si tuviera campos mensuales)
        try:
            dfc = _load_catalog().copy()
            sub = dfc[(dfc.get("make").astype(str) == mk) & (dfc.get("model").astype(str) == md)]
            if not sub.empty:
                p = sub.iloc[0]
                for m in range(1,13):
                    col = f"ventas_2025_{m:02d}"
                    if col in dfc.columns and row.get(col) is None:
                        v = p.get(col)
                        if v is not None:
                            row[col] = v
                if row.get("ventas_ytd_2025") is None and "ventas_ytd_2025" in dfc.columns:
                    row["ventas_ytd_2025"] = p.get("ventas_ytd_2025")
        except Exception:
            pass
        return row

    def _model_ytd(mk: str, md: str, yr: int) -> tuple[Optional[int], Optional[int], Optional[int]]:
        try:
            key = (mk, md, yr)
            if key in _MODEL_YTD:
                ytd, lm = _MODEL_YTD[key]
                return ytd, lm, yr
            # fallback: try 2025, then any year for that (mk,md)
            if (mk, md, 2025) in _MODEL_YTD:
                ytd, lm = _MODEL_YTD[(mk, md, 2025)]
                return ytd, lm, 2025
            # fallback 2: any year for that (mk,md)
            for (mk2, md2, y), val in _MODEL_YTD.items():
                if mk2 == mk and md2 == md:
                    ytd, lm = val
                    return ytd, lm, int(y)
            # fallback 3: match by model only (brand name variations)
            cands: list[tuple[int, Optional[int]]] = []
            for (mk2, md2, y), val in _MODEL_YTD.items():
                if md2 == md:
                    cands.append(val)
            if cands:
                # pick the one with max YTD
                ytd, lm = sorted(cands, key=lambda t: (t[0] or 0), reverse=True)[0]
                # año desconocido; asume 2025 si el archivo existe (regla de negocio)
                return ytd, lm, 2025
            # Ultimate fallback: load 2025 lookup and match by (make,model) or model-only
            try:
                y2025 = _build_model_ytd_lookup(2025)
                if (mk, md, 2025) in y2025:
                    ytd, lm = y2025[(mk, md, 2025)]
                    return ytd, lm, 2025
                # model-only within 2025 map
                cands_25: list[tuple[int, Optional[int]]] = []
                for (mk2, md2, y), val in y2025.items():
                    if y == 2025 and md2 == md:
                        cands_25.append(val)
                if cands_25:
                    ytd, lm = sorted(cands_25, key=lambda t: (t[0] or 0), reverse=True)[0]
                    return ytd, lm, 2025
            except Exception:
                pass
        except Exception:
            pass
        return None, None, None

    # Fallback simple: si falta algún dato clave, tomarlo de otro año del mismo modelo
    def _fill_from_model(row: Dict[str, Any], col: str) -> None:
        try:
            v = to_num(row.get(col))
            mk = str(row.get("make") or "").strip().upper()
            md = str(row.get("model") or "").strip().upper()
            if v is None and mk and md and pd is not None:
                t = _load_catalog().copy()
                t = t[(t.get("make").astype(str).str.upper()==mk) & (t.get("model").astype(str).str.upper()==md)]
                if col in t.columns:
                    cand = pd.to_numeric(t[col], errors="coerce").dropna()
                    if len(cand):
                        row[col] = float(cand.iloc[0])
        except Exception:
            pass
    def _fill_from_model_any(row: Dict[str, Any], col: str) -> None:
        """Fill string-like metadata (e.g., fuel type) from any year of same (make, model)."""
        try:
            val = row.get(col)
            mk = str(row.get("make") or "").strip().upper()
            md = str(row.get("model") or "").strip().upper()
            if (val in (None, "", float('nan'))) and mk and md and pd is not None:
                t = _load_catalog().copy()
                t = t[(t.get("make").astype(str).str.upper()==mk) & (t.get("model").astype(str).str.upper()==md)]
                if col in t.columns:
                    ser = t[col].dropna().astype(str)
                    if len(ser):
                        row[col] = ser.iloc[0]
        except Exception:
            pass

    # Fallback directo desde JSON curado (match por make, model, version, year)
    def _fill_from_json(row: Dict[str, Any]) -> None:
        try:
            mk = _canon_make(row.get("make")) or str(row.get("make") or "").strip().upper()
            md = _canon_model(mk, row.get("model")) or str(row.get("model") or "").strip().upper()
            vr = str(row.get("version") or "").strip().upper()
            yr = str(row.get("ano") or "").strip()
            if not (mk and md and vr and yr):
                return
            pjson = ROOT / "data" / "vehiculos-todos.json"
            if not pjson.exists():
                pjson = ROOT / "data" / "vehiculos-todos1.json"
            if not pjson.exists():
                return
            import json as _json, re as _re
            obj = _json.loads(pjson.read_text(encoding="utf-8"))
            items = obj.get("vehicles") if isinstance(obj, dict) else (obj if isinstance(obj, list) else [])
            def up(s):
                return str(s or "").strip().upper()
            def _to_kml_text(v):
                try:
                    s = str(v or "").strip().lower()
                    if not s or s in {"nan","none","null","-"}: return None
                    m = _re.search(r"(\d+[\.,]?\d*)\s*mpg", s)
                    if m: return float(m.group(1).replace(',', '.'))  # tratar mpg como km/l (bug JSON)
                    m = _re.search(r"(\d+[\.,]?\d*)\s*l\s*/\s*100\s*km", s)
                    if m:
                        l100 = float(m.group(1).replace(',', '.'))
                        return 100.0/l100 if l100>0 else None
                    m = _re.search(r"(\d+[\.,]?\d*)\s*(km/?l|kml)", s)
                    if m: return float(m.group(1).replace(',', '.'))
                    m = _re.search(r"(\d+[\.,]?\d*)", s)
                    if m: return float(m.group(1).replace(',', '.'))
                except Exception:
                    return None
                return None
            hit = None
            for v in items or []:
                try:
                    mk2 = up(((v.get("make") or {}).get("name") if isinstance(v.get("make"), dict) else None) or ((v.get("manufacturer") or {}).get("name") if isinstance(v.get("manufacturer"), dict) else ""))
                    md2 = up((v.get("model") or {}).get("name") if isinstance(v.get("model"), dict) else "")
                    ver2 = up((v.get("version") or {}).get("name") if isinstance(v.get("version"), dict) else "")
                    yr2 = str((v.get("version") or {}).get("year") if isinstance(v.get("version"), dict) else "")
                    if mk2 == mk and md2 == md and ver2 == vr and yr2 == yr:
                        hit = v
                        break
                except Exception:
                    continue
            if not hit:
                return
            # FE
            fe = (hit.get("fuelEconomy") or {}) if isinstance(hit.get("fuelEconomy"), dict) else {}
            ck = _to_kml_text(fe.get("combined"))
            if ck is not None:
                row["combinado_kml"] = ck
            ci = _to_kml_text(fe.get("city"))
            if ci is not None:
                row["ciudad_kml"] = ci
            ca = _to_kml_text(fe.get("highway"))
            if ca is not None:
                row["carretera_kml"] = ca
            # Version details
            ver = hit.get("version") or {}
            if isinstance(ver, dict):
                # Tomar SIEMPRE del JSON (excepto precios/servicio) para garantizar consistencia
                if ver.get("transmission") is not None:
                    row["transmision"] = ver.get("transmission")
                if ver.get("drivetrain") is not None:
                    row["traccion"] = ver.get("drivetrain")
                    row["driven_wheels"] = str(ver.get("drivetrain")).strip().lower()
                if ver.get("bodyStyle") is not None:
                    row["body_style"] = ver.get("bodyStyle")
                if ver.get("doors") is not None:
                    try:
                        row["doors"] = int(ver.get("doors"))
                    except Exception:
                        row["doors"] = ver.get("doors")
            # Image
            imgs = hit.get("images") or {}
            if isinstance(imgs, dict) and imgs.get("default"):
                row["images_default"] = imgs.get("default")
        except Exception:
            pass
    # Nota: no aplicar fallback de 1 MXN; si no hay dato, dejarlo en None.
    def _ensure_service(row: Dict[str, Any]) -> None:
        return

    def _ensure_service_from_catalog(row: Dict[str, Any]) -> None:
        """If service is missing, try to copy a known value from the catalog for the same (make, model),
        preferring 2025 and then any year with a non‑zero service_cost_60k_mxn.
        """
        try:
            v = to_num(row.get("service_cost_60k_mxn"))
            # Tratar 1.0 como sentinela (permitir sobreescritura)
            if v is not None and v > 1:
                return
            dfc = _load_catalog().copy()
            mk = _canon_make(row.get("make"))
            md = _canon_model(mk, row.get("model"))
            if mk is None or md is None:
                return
            sub = dfc[(dfc.get("make").astype(str) == mk) & (dfc.get("model").astype(str) == md)]
            pick_val = None
            if "service_cost_60k_mxn" in sub.columns:
                try:
                    ss25 = sub[pd.to_numeric(sub.get("ano"), errors="coerce") == 2025]
                    # Acepta 0 (incluido) y valores >1; ignora sólo el sentinela 1
                    sv = pd.to_numeric(ss25["service_cost_60k_mxn"], errors="coerce")
                    nn = ss25[(sv == 0) | (sv > 1)]
                    if not nn.empty:
                        pick_val = float(nn.iloc[0]["service_cost_60k_mxn"])
                except Exception:
                    pass
                if pick_val is None:
                    sv = pd.to_numeric(sub["service_cost_60k_mxn"], errors="coerce")
                    nn = sub[(sv == 0) | (sv > 1)]
                    if not nn.empty:
                        pick_val = float(nn.iloc[0]["service_cost_60k_mxn"])
            if pick_val is not None:
                row["service_cost_60k_mxn"] = pick_val
        except Exception:
            pass

    def _ensure_service_from_csv(row: Dict[str, Any]) -> None:
        """Lookup service_cost_60k_mxn directly from data/costos_mantenimiento.csv using
        flexible matching and prefer values > 1 (ignora sentinela 1).
        Orden de preferencia: (mk, md, yr, vr) -> (mk, md, yr) -> (mk, md, 2025) -> (mk, md, any).
        """
        try:
            vcur = to_num(row.get("service_cost_60k_mxn"))
            if vcur is not None and vcur > 1:
                return
            import csv as _csv
            # Leer principal y fallback enriquecido
            paths = [ROOT / "data" / "costos_mantenimiento.csv", ROOT / "data" / "enriched" / "costos_mantenimiento_enriched.csv"]
            recs = []
            for p in paths:
                if not p.exists():
                    continue
                with p.open("r", encoding="utf-8", newline="") as f:
                    rd = _csv.DictReader(f)
                    for r in rd:
                        mk = str(r.get("MAKE") or r.get("Make") or r.get("make") or "").strip().upper()
                        md = str(r.get("Model") or r.get("MODEL") or r.get("model") or "").strip().upper()
                        vr = str(r.get("Version") or r.get("VERSION") or r.get("version") or "").strip().upper()
                        try:
                            yr = int(str(r.get("Año") or r.get("ano") or r.get("AÑO") or "").strip())
                        except Exception:
                            yr = None
                        try:
                            raw = str(r.get("service_cost_60k_mxn") or "").replace(",", "").replace("$", "").strip()
                            val = float(raw)
                        except Exception:
                            val = None
                        # Acepta 0 (incluido) y >1; ignora sólo 1 (sentinela) o negativos/NaN
                        if val is None or (val == 1) or (val < 0):
                            continue
                        recs.append({"mk": mk, "md": md, "vr": vr, "yr": yr, "val": val})
            if not recs:
                return
            mk0 = _canon_make(row.get("make")) or str(row.get("make") or "").strip().upper()
            md0 = _canon_model(mk0, row.get("model")) or str(row.get("model") or "").strip().upper()
            vr0 = str(row.get("version") or "").strip().upper()
            yr0 = None
            try:
                yr0 = int(row.get("ano")) if row.get("ano") is not None else None
            except Exception:
                yr0 = None
            def pick(filter_fn):
                cand = [r for r in recs if filter_fn(r)]
                return cand[0]["val"] if cand else None
            # Exact (mk, md, yr, vr)
            val = pick(lambda r: r["mk"]==mk0 and r["md"]==md0 and r["yr"]==yr0 and r["vr"]==vr0)
            if val is None and yr0 is not None:
                val = pick(lambda r: r["mk"]==mk0 and r["md"]==md0 and r["yr"]==yr0)
            if val is None:
                val = pick(lambda r: r["mk"]==mk0 and r["md"]==md0 and r["yr"]==2025)
            if val is None:
                val = pick(lambda r: r["mk"]==mk0 and r["md"]==md0)
            if val is not None:
                row["service_cost_60k_mxn"] = float(val)
        except Exception:
            pass
    for _c in ("caballos_fuerza","longitud_mm","combinado_kml","ciudad_kml","carretera_kml"):
        _fill_from_model(own, _c)
    for _s in ("categoria_combustible_final","tipo_de_combustible_original","body_style","transmision","traccion","driven_wheels","doors","images_default"):
        _fill_from_model_any(own, _s)
    # Fallback directo desde JSON para corregir FE (mpg->kml) y tren motriz si faltan
    _fill_from_json(own)
    # Enriquecer features booleanos desde catálogo si faltan
    _ensure_features_from_catalog(own)
    # Usar catálogo/overlays/CSV; no setear sentinela 1 MXN
    _ensure_service_from_catalog(own)
    _ensure_service_from_csv(own)
    # No aplicar overlay a la base para no ocultar "ellos sí (nosotros no)" cuando falten datos reales

    # TX fallback: si falta o <=0, usa MSRP
    try:
        tx = to_num(own.get("precio_transaccion"))
        if (tx is None) or (tx <= 0):
            p = to_num(own.get("msrp"))
            if p is not None:
                own["precio_transaccion"] = p
    except Exception:
        pass
    # Fuel 60k fallback
    own = ensure_fuel_60(own)
    own = ensure_equip_score(own)
    own = ensure_pillars(own)
    own = _attach_monthlies(own)

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
    # derive display segment
    seg_disp = _seg_display(own)
    if seg_disp:
        own["segmento_display"] = seg_disp
    else:
        try:
            mk = str(own.get("make") or "").strip().upper()
            md = str(own.get("model") or "").strip().upper()
            segk = _SEG_MAP.get((mk, md))
            if segk:
                own["segmento_display"] = segk
            else:
                # Fallback: infer from any catalog row for this model (any year)
                dfc = _load_catalog().copy()
                sub = dfc[(dfc.get("make").astype(str).str.upper()==mk) & (dfc.get("model").astype(str).str.upper()==md)]
                cand = None
                if "segmento_ventas" in sub.columns:
                    cand = sub["segmento_ventas"].dropna().astype(str).tolist()
                if (not cand) and "body_style" in sub.columns:
                    cand = sub["body_style"].dropna().astype(str).tolist()
                if cand:
                    s0 = str(cand[0])
                    own["segmento_display"] = _seg_display({"segmento_ventas": s0, "body_style": s0}) or s0
        except Exception:
            pass
    # normalized version for own
    vd = _ver_display(own)
    if vd:
        # No mostrar etiqueta de versión en la gráfica para el vehículo base
        own["version_display"] = ""
    # attach model-level YTD for own
    try:
        mk = str(own.get("make") or "").strip().upper()
        md = str(own.get("model") or "").strip().upper()
        yr = int(own.get("ano")) if own.get("ano") else yr_pref
        ytd, lm, year_used = _model_ytd(mk, md, yr)  # type: ignore
        if ytd is not None:
            own["ventas_model_ytd"] = int(ytd)
            if lm is not None:
                own["ventas_model_ytd_month"] = int(lm)
        # compute segment share from totals
        segk = _SEG_MAP.get((mk, md)) or seg_disp
        if segk and ytd is not None:
            totals = _SEG_TOTALS_2025 if year_used == 2025 else _SEG_TOTALS
            tot = totals.get(segk)
            if tot:
                own["ventas_model_seg_share_pct"] = round((int(ytd) / float(tot)) * 100.0, 1)
    except Exception:
        pass
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
    # Equipment over/under vs base (percentage). Positive => competitor has MORE equipment; negative => LESS
    def equip_over_under_pct_with_source(base_row: Dict[str, Any], comp_row: Dict[str, Any]) -> tuple[Optional[float], Optional[str], Optional[list]]:
        try:
            b_keys = [k for k in base_row.keys() if str(k).startswith("equip_p_")]
            c_keys = [k for k in comp_row.keys() if str(k).startswith("equip_p_")]
            keys = sorted(set(b_keys) & set(c_keys))
            diffs: list[float] = []
            brk: list[dict] = []
            def _label(col: str) -> str:
                m = {
                    "equip_p_adas": "ADAS",
                    "equip_p_safety": "Seguridad",
                    "equip_p_comfort": "Confort",
                    "equip_p_infotainment": "Info",
                    "equip_p_traction": "Tracción",
                    "equip_p_utility": "Utilidad",
                    "equip_p_performance": "Performance",
                    "equip_p_efficiency": "Eficiencia",
                    "equip_p_electrification": "Electrificación",
                }
                return m.get(col, col)
            for k in keys:
                b = to_num(base_row.get(k))
                c = to_num(comp_row.get(k))
                if b is None or c is None:
                    continue
                try:
                    bf = float(b)
                    cf = float(c)
                except Exception:
                    continue
                if bf <= 0.0 or cf <= 0.0:
                    continue
                # Δ en puntos (0..100) evita inflar porcentajes cuando la base es pequeña
                d = cf - bf
                # clamp a [-100, 100] por seguridad
                if d > 100.0: d = 100.0
                if d < -100.0: d = -100.0
                diffs.append(d)
                brk.append({"key": k, "label": _label(k), "delta_pct": round(d, 1)})
            if diffs:
                return round(sum(diffs) / float(len(diffs)), 1), "pillars", brk
            # Fallback to equip_score: if base>0 use ratio; if base==0 use diferencia en puntos (0..100)
            bs = to_num(base_row.get("equip_score"))
            cs = to_num(comp_row.get("equip_score"))
            try:
                bf = float(bs) if bs is not None else None
                cf = float(cs) if cs is not None else None
            except Exception:
                bf = cf = None  # type: ignore
            if bf is not None and cf is not None:
                # Usar diferencia en puntos (−100..+100) para evitar inflar valores
                val = round((cf - (bf or 0.0)), 1)
                return val, "score", [{"key": "equip_score", "label": "Score", "delta_pct": val}]
            return None, None, None
        except Exception:
            return None, None, None
    comps = []
    # Helper truthy
    def _truthy(v: Any) -> bool:
        s = str(v).strip().lower()
        return s in {"true","1","si","sí","estandar","estándar","incluido","standard","std","present","x","y"}

    for c in competitors:
        # numeric fallback for comps
        for _c in ("caballos_fuerza","longitud_mm","combinado_kml"):
            _fill_from_model(c, _c)
        for _s in ("categoria_combustible_final","tipo_de_combustible_original"):
            _fill_from_model_any(c, _s)
        _ensure_service(c)
        _ensure_service_from_catalog(c)
        _ensure_service_from_csv(c)
        _ensure_features_from_catalog(c)
        _apply_features_overlay(c)
        # TX fallback for comps
        try:
            tx = to_num(c.get("precio_transaccion"))
            if (tx is None) or (tx <= 0):
                p = to_num(c.get("msrp"))
                if p is not None:
                    c["precio_transaccion"] = p
        except Exception:
            pass
        # Fuel 60k fallback
        c = ensure_fuel_60(c)
        c = ensure_equip_score(c)
        c = ensure_pillars(c)
        c = _attach_monthlies(c)
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
        # display segment for competitor
        segd = _seg_display(c)
        if segd:
            c["segmento_display"] = segd
        else:
            try:
                mk = str(c.get("make") or "").strip().upper()
                md = str(c.get("model") or "").strip().upper()
                segk = _SEG_MAP.get((mk, md))
                if segk:
                    c["segmento_display"] = segk
            except Exception:
                pass
        # normalized version for competitor
        vdc = _ver_display(c)
        if vdc:
            c["version_display"] = vdc
        # attach model-level YTD for competitor
        try:
            mk = str(c.get("make") or "").strip().upper()
            md = str(c.get("model") or "").strip().upper()
            yr = int(c.get("ano")) if c.get("ano") else yr_pref
            ytd, lm, year_used = _model_ytd(mk, md, yr)  # type: ignore
            if ytd is not None:
                c["ventas_model_ytd"] = int(ytd)
                if lm is not None:
                    c["ventas_model_ytd_month"] = int(lm)
            segk = _SEG_MAP.get((mk, md)) or segd
            if segk and ytd is not None:
                totals = _SEG_TOTALS_2025 if year_used == 2025 else _SEG_TOTALS
                tot = totals.get(segk)
                if tot:
                    c["ventas_model_seg_share_pct"] = round((int(ytd) / float(tot)) * 100.0, 1)
        except Exception:
            pass
        # include equipment match pct
        match = equip_match_pct(own, c)
        if match is not None:
            c["equip_match_pct"] = match
        overu, src, brk = equip_over_under_pct_with_source(own, c)
        if overu is not None:
            c["equip_over_under_pct"] = overu
        if src:
            c["equip_over_under_source"] = src
        if brk:
            c["equip_over_under_breakdown"] = brk
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


# ------------------------------ Insights (OpenAI) -------------------------
@app.post("/insights")
def post_insights(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Genera insights con IA a partir del JSON enriquecido de /compare.

    Body:
      - own, competitors: mismos campos que /compare (versiones crudas) y se enriquecerán internamente
        o bien
      - compare: objeto devuelto por /compare { own, competitors: [{item, deltas, diffs}, ...] }
    """
    # 1) Obtener JSON enriquecido (usando el propio /compare para mantener una sola lógica)
    try:
        comp_json: Dict[str, Any]
        if payload.get("own") is not None or payload.get("competitors") is not None:
            comp_json = post_compare({
                "own": payload.get("own") or {},
                "competitors": payload.get("competitors") or [],
            })
        else:
            comp_json = payload.get("compare") or {}
        own = comp_json.get("own") or {}
        comps = comp_json.get("competitors") or []
        # achicar a top 4 para el prompt
        comps_short = []
        for c in comps[:4]:
            try:
                item = c.get("item") if isinstance(c, dict) else None
                comps_short.append({
                    "item": item or c,
                    "deltas": c.get("deltas") if isinstance(c, dict) else None,
                    "diffs": c.get("diffs") if isinstance(c, dict) else None,
                })
            except Exception:
                pass
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"payload inválido para insights: {e}")

    # 2) Preparar prompt (insights estratégicos que NO repiten gráficas)
    # Permitir prompts externos por idioma (public/data/*.txt) con fallback a prompt incorporado en ES.
    system_prompt_override = None
    user_template_override = None
    lang_req = str(payload.get("prompt_lang") or "").strip().lower()
    if lang_req in {"es","en","zh"}:
        sys_txt, usr_txt = _load_prompts_for_lang(lang_req)
        system_prompt_override = sys_txt or None
        user_template_override = usr_txt or None

    system = system_prompt_override or (
        "Eres un analista automotriz senior. Tu salida debe ser clara, breve y accionable en español."
        " Prohibido describir o 'leer' gráficas; NO uses frases como 'la gráfica muestra', 'en el gráfico', etc."
        " Entrega hallazgos no obvios, palancas y acciones priorizadas a partir de los datos y señales proporcionadas."
        " Cuantifica SIEMPRE cada punto con cifras concretas (MXN, %, HP, kml) y nombra explícitamente rivales al comparar."
        " Evita frases genéricas como 'es competitivo' sin números o evidencia; cada bullet debe tener un dato duro."
        " Responde SIEMPRE en JSON válido (UTF-8, sin Markdown) con dos bloques: \n"
        "  (a) 'insights' con la estructura estratégica siguiente, y\n"
        "  (b) 'struct' con claves canónicas + argumentos mínimos para traducción/render sin volver a llamarte.\n"
        "Esquema de 'insights': {\n"
        "  \"hallazgos_clave\": string[5..7],\n"
        "  \"oportunidades\": string[3..5],\n"
        "  \"riesgos_y_contramedidas\": string[3..5],\n"
        "  \"acciones_priorizadas\": string[4..6],\n"
        "  \"preguntas_para_el_equipo\": string[3..4],\n"
        "  \"supuestos_y_datos_faltantes\": string[2..5]\n"
        "}\n"
        "Esquema de 'struct': { sections: [ { id: string, items: [ { key: string, args?: object } ] } ] }\n"
        "Secciones/keys esperadas: hallazgos_clave→hallazgo{text,evidencia?}, oportunidades→oportunidad{palanca,accion,impacto?,urgencia?},"
        " riesgos_y_contramedidas→riesgo{text,mitigacion?}, acciones_priorizadas→(accion_p1|accion_p2){text,owner?,cuando?,kpi?},"
        " preguntas_para_el_equipo→pregunta{text}, supuestos_y_datos_faltantes→supuesto{text}."
        " Si faltan datos, indica 'N/D' y sugiere cómo obtenerlos. Sin párrafos largos; bullets cortos y accionables."
    )
    # Derivar señales básicas no-obvias para el modelo
    def _to_f(v):
        try:
            return float(v)
        except Exception:
            return None
    try:
        own_price = _to_f(own.get("precio_transaccion") or own.get("msrp"))
        own_hp = _to_f(own.get("caballos_fuerza"))
        own_cph = _to_f(own.get("cost_per_hp_mxn")) or (_to_f(own_price)/_to_f(own_hp) if (own_price and own_hp and own_hp>0) else None)
        prices = []
        cphs = []
        tcos = []
        deltas_tx = []
        for c in comps_short:
            it = c.get("item") or {}
            p = _to_f(it.get("precio_transaccion") or it.get("msrp"))
            h = _to_f(it.get("caballos_fuerza"))
            tco = _to_f(it.get("tco_total_60k_mxn") or it.get("tco_60k_mxn"))
            if p is not None:
                prices.append(p)
                if own_price is not None:
                    deltas_tx.append(p - own_price)
            if p is not None and h is not None and h>0:
                cphs.append(p/h)
            if tco is not None:
                tcos.append(tco)
        def _median(arr):
            try:
                a = sorted([x for x in arr if x is not None])
                n = len(a)
                if n==0: return None
                m = n//2
                return a[m] if n%2==1 else (a[m-1]+a[m])/2.0
            except Exception:
                return None
        cph_med = _median(cphs)
        tco_med = _median(tcos)
        near_tx = None
        if own_price is not None and prices:
            near_tx = min(prices, key=lambda v: abs(v-own_price))
        signals = {
            "own_cph": own_cph,
            "cph_median": cph_med,
            "tco_median": tco_med,
            "nearest_tx": near_tx,
            "delta_tx_nearest": (near_tx - own_price) if (near_tx is not None and own_price is not None) else None,
        }
    except Exception:
        signals = {}

    # Resúmenes determinísticos de explicación de precio (top 3 rivales)
    explainers = []
    try:
        for c in comps_short[:3]:
            it = c.get("item") or {}
            try:
                ex = post_price_explain({"own": own, "comp": it, "use_heuristics": True, "use_regression": True})
            except Exception:
                ex = None
            name = f"{str(it.get('make') or '').strip()} {str(it.get('model') or '').strip()}".strip()
            if it.get("version"):
                name += f" – {it.get('version')}"
            try:
                decomp = ex.get("decomposition") if isinstance(ex, dict) else None
                # top driver (excluye componente 'no explicada')
                top_drv = None
                if isinstance(decomp, list):
                    filtered = [d for d in decomp if isinstance(d, dict) and str(d.get("componente",""))[:3].lower() != "dif"]
                    if filtered:
                        top_drv = sorted(filtered, key=lambda d: abs(float(d.get("monto") or 0)), reverse=True)[0]
                explainers.append({
                    "name": name,
                    "apples": (ex.get("apples_to_apples") if isinstance(ex, dict) else None),
                    "bonus": (ex.get("recommended_bonus") if isinstance(ex, dict) else None),
                    "top_driver": top_drv,
                })
            except Exception:
                explainers.append({"name": name, "error": True})
    except Exception:
        explainers = []

    # Construir mensaje de usuario
    user = {
        "instrucciones": (
            "Genera hallazgos no-obvios y acciones priorizadas. Prohibido describir gráficas."
        ),
        "base": own,
        "competidores": comps_short,
        "signals": signals,
        "price_explain": explainers,
    }
    user_message_override = None
    if user_template_override:
        try:
            import json as _json2
            data_blob = {"base": own, "competidores": comps_short, "signals": signals, "price_explain": explainers}
            user_message_override = user_template_override.replace("<DATA_JSON>", _json2.dumps(data_blob, ensure_ascii=False, indent=2))
        except Exception:
            user_message_override = None

    # 3) Caché por hash del payload (para ahorrar tokens)
    import os, json as _json
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    # Construir clave estable del análisis
    try:
        import hashlib as _hash
        cache_key = _hash.sha1(_json.dumps({"own": own, "comps": comps_short}, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    except Exception:
        cache_key = None
    if not hasattr(post_insights, "_cache"):
        post_insights._cache = {}  # type: ignore[attr-defined]
    cache = getattr(post_insights, "_cache", {})
    if cache_key and cache_key in cache:
        ent = cache.get(cache_key) or {}
        # Solo reutilizar cache si fue una respuesta válida (ok=True).
        if ent.get("ok") is True:
            res = dict(ent)
            res["compare"] = comp_json
            return res

    # Deterministic fallback (sin IA) para no dejar el bloque vacío
    def _deterministic_struct() -> Dict[str, Any]:
        secs: list[dict] = []
        # Hallazgos clave (precio y drivers)
        items_h: list[dict] = []
        try:
            for ex in (explainers or [])[:3]:
                name = ex.get("name") or "Competidor"
                td = ex.get("top_driver") or {}
                comp = str(td.get("componente") or "ΔPrecio")
                monto = float(td.get("monto") or 0)
                items_h.append({"key": "hallazgo", "args": {"text": f"{name}: driver principal {comp} por $ {int(round(monto)):,}"}})
        except Exception:
            pass
        if not items_h:
            items_h = [{"key": "hallazgo", "args": {"text": "Sin IA: comparación realizada; ΔTX y drivers disponibles en el bloque de explicación de precio."}}]
        secs.append({"id": "hallazgos_clave", "items": items_h})
        # Oportunidades (bono / posicionamiento)
        items_o: list[dict] = []
        try:
            for ex in (explainers or [])[:2]:
                name = ex.get("name") or "Competidor"
                b = (ex.get("bonus") or {}).get("mxn")
                if isinstance(b, (int,float)) and b>0:
                    items_o.append({"key": "oportunidad", "args": {"palanca": f"Bono vs {name}", "accion": f"Evaluar bono ~$ {int(round(b)):,}", "impacto": "Cerrar ΔTX", "urgencia": "Alta"}})
        except Exception:
            pass
        if not items_o:
            items_o = [{"key": "oportunidad", "args": {"palanca": "Financiamiento/bono táctico", "accion": "A/B por plaza", "impacto": "Conversión", "urgencia": "Media"}}]
        secs.append({"id": "oportunidades", "items": items_o})
        # Riesgos
        items_r = [{"key": "riesgo", "args": {"text": "ΔPrecio no explicado alto; riesgo de percepción de sobreprecio", "mitigacion": "Bono/tasa + paquete de valor"}}]
        secs.append({"id": "riesgos_y_contramedidas", "items": items_r})
        # Acciones priorizadas
        items_a = [
            {"key": "accion_p1", "args": {"text": "Definir bono/tasa por dealer en función del residual ΔTX", "owner": "Comercial", "cuando": "Inmediato", "kpi": "Uplift en cierre"}},
            {"key": "accion_p2", "args": {"text": "Mensajes: $/HP y 4x4 + 7 plazas", "owner": "Marketing", "cuando": "Semanas 1–2", "kpi": "CTR/Leads"}},
        ]
        secs.append({"id": "acciones_priorizadas", "items": items_a})
        # Preguntas / Supuestos
        secs.append({"id": "preguntas_para_el_equipo", "items": [{"key": "pregunta", "args": {"text": "¿Objetivo de share y precio por región?"}}]})
        secs.append({"id": "supuestos_y_datos_faltantes", "items": [{"key": "supuesto", "args": {"text": "Pilares/equipo incompletos en algunos rivales; revisar fuente"}}]})
        return {"sections": secs}

    # 4) Llamar a OpenAI si hay API key; si no, devolver fallback
    if not api_key:
        return {
            "ok": True,
            "model": None,
            "insights": "",
            "insights_json": None,
            "insights_struct": _deterministic_struct(),
            "compare": comp_json,
        }
    try:
        import requests  # type: ignore
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": (user_message_override or _json.dumps(user, ensure_ascii=False))},
        ]
        data = {"model": model, "messages": messages, "temperature": 0.3}
        # Allow overriding timeouts via env; default to a more forgiving value
        try:
            timeout_read = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "60"))
        except Exception:
            timeout_read = 60.0
        timeout_connect = 10.0
        # Simple one‑retry on timeout to reduce flakiness
        try:
            resp = requests.post(url, headers=headers, json=data, timeout=(timeout_connect, timeout_read))
        except (requests.Timeout, requests.ReadTimeout):  # type: ignore[attr-defined]
            try:
                resp = requests.post(url, headers=headers, json=data, timeout=(timeout_connect, max(timeout_read, 90.0)))
            except Exception as e2:
                return {"ok": False, "error": str(e2), "compare": comp_json}
        if resp.status_code != 200:
            return {"ok": True, "model": model, "insights": "", "insights_json": None, "insights_struct": _deterministic_struct(), "compare": comp_json}
        out = resp.json()
        text = out.get("choices", [{}])[0].get("message", {}).get("content", "")
        # Intenta parsear el JSON eliminando code fences y otros adornos
        def _parse_any(s: str):
            try:
                import json as _json2
                return _json2.loads(s)
            except Exception:
                pass
            # Buscar bloque ```json { ... } ```
            try:
                import re as _re
                m = _re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", s, flags=_re.IGNORECASE)
                if m:
                    import json as _json2
                    return _json2.loads(m.group(1))
            except Exception:
                pass
            # Heurística: del primer '{' al último '}'
            try:
                i = s.find('{'); j = s.rfind('}')
                if i != -1 and j != -1 and j > i:
                    import json as _json2
                    return _json2.loads(s[i:j+1])
            except Exception:
                pass
            return None
        parsed = _parse_any(text)
        res = {
            "ok": True,
            "model": model,
            "insights": text,
            "insights_json": (parsed.get("insights") if isinstance(parsed, dict) and parsed.get("insights") is not None else parsed),
            "insights_struct": (parsed.get("struct") if isinstance(parsed, dict) else None),
            "compare": comp_json,
        }
        # cachear
        if cache_key:
            cache[cache_key] = {k: v for k, v in res.items() if k != "compare"}
        return res
    except Exception:
        # Fallback en caso de error de red/parseo
        return {"ok": True, "model": model, "insights": "", "insights_json": None, "insights_struct": _deterministic_struct(), "compare": comp_json}


# ------------------------------ Price Explain -----------------------------
@app.post("/price_explain")
def post_price_explain(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Explica el delta de precio entre A (own) y B (comp) con una descomposición
    determinística y heurística/regresión local cuando hay suficientes comparables.

    Body:
      - { own, comp, use_heuristics?: bool, use_regression?: bool }
        o
      - { compare }  (objeto devuelto por /compare)

    Salida (JSON, ya formateado por secciones):
      - apples_to_apples: { ok: bool, motivos_no: string[] }
      - decomposition: [{ componente, monto, explicacion }..., { residual, ... }]
      - recommended_bonus: { mxn, rango_sugerido, guardrails_margen }
      - equipment_suggestions: [{ feature, impacto_estimado_mxn, prioridad }]
      - messaging: string[]
      - notas: string[]
    """
    # ---- helpers ----
    def to_num(x: Any) -> Optional[float]:
        try:
            return float(x)
        except Exception:
            return None

    def _fuel_bucket(row: Dict[str, Any]) -> str:
        s = str((row.get("categoria_combustible_final") or row.get("tipo_de_combustible_original") or row.get("fuel_type") or "")).lower()
        if not s:
            return "ICE"
        if "phev" in s or "enchuf" in s:
            return "PHEV"
        if "hev" in s or "híbrido" in s or "hibrido" in s:
            return "HEV"
        if "elect" in s:
            return "BEV"
        return "ICE"

    def _drivetrain(row: Dict[str, Any]) -> str:
        try:
            s = str(row.get("driven_wheels") or row.get("traccion_original") or row.get("traccion") or "").strip().lower()
        except Exception:
            s = ""
        if any(k in s for k in ("awd","4x4","4wd")):
            return "AWD"
        if "rwd" in s or "tras" in s:
            return "RWD"
        if "fwd" in s or "del" in s:
            return "FWD"
        return s.upper() or ""

    def _is_awd(row: Dict[str, Any]) -> int:
        return 1 if _drivetrain(row) == "AWD" or ("4x4" in str(row.get("traccion_original") or "").lower()) else 0

    def _seg_display(row: Dict[str, Any]) -> Optional[str]:
        try:
            s = str(row.get("segmento_display") or row.get("segmento_ventas") or row.get("body_style") or "").strip().lower()
        except Exception:
            s = ""
        if not s:
            return None
        if any(x in s for x in ("pick","cab","chasis","camioneta")):
            return "Pickup"
        if any(x in s for x in ("todo terreno","suv","suvs","crossover","sport utility")):
            return "SUV'S"
        if "van" in s:
            return "Van"
        if any(x in s for x in ("hatch","hb")):
            return "Hatchback"
        if any(x in s for x in ("sedan","sedán","saloon")):
            return "Sedán"
        return str(row.get("segmento_display") or row.get("segmento_ventas") or row.get("body_style") or "").strip()

    # Reusar utilidades de /compare para asegurar datos mínimos
    def _prep_row(r: Dict[str, Any]) -> Dict[str, Any]:
        out = dict(r)
        # TX fallback
        try:
            tx = to_num(out.get("precio_transaccion"))
            if (tx is None) or (tx <= 0):
                p = to_num(out.get("msrp"))
                if p is not None:
                    out["precio_transaccion"] = p
        except Exception:
            pass
        # Energía 60k y equipo
        out = ensure_fuel_60(out)
        out = ensure_equip_score(out)
        out = ensure_pillars(out)
        # Bono válido
        def _bonus(row: Dict[str, Any]) -> Optional[float]:
            p = to_num(row.get("msrp"))
            tx = to_num(row.get("precio_transaccion"))
            if p is None or tx is None or tx <= 0 or not (tx < p):
                return None
            return float(p - tx)
        b = _bonus(out)
        if b is not None:
            out["bono"] = b
        else:
            try:
                if "bono" in out: del out["bono"]
                if "bono_mxn" in out: del out["bono_mxn"]
            except Exception:
                pass
        # TCO 60k si falta
        if out.get("tco_60k_mxn") is None:
            p = to_num(out.get("precio_transaccion") or out.get("msrp")) or 0.0
            sv = to_num(out.get("service_cost_60k_mxn")) or 0.0
            out["tco_60k_mxn"] = float(p + sv)
        if out.get("cost_per_hp_mxn") is None:
            pr = to_num(out.get("precio_transaccion") or out.get("msrp"))
            hp = to_num(out.get("caballos_fuerza"))
            if (pr is not None) and (hp is not None) and hp != 0:
                out["cost_per_hp_mxn"] = float(pr / hp)
        # Segmento display normalizado
        sd = _seg_display(out)
        if sd:
            out["segmento_display"] = sd
        return out

    # ---- parse input ----
    try:
        if payload.get("compare") is not None:
            comp_json = payload.get("compare")
            own = comp_json.get("own") or {}
            comps = comp_json.get("competitors") or []
            comp_row = None
            if comps:
                c0 = comps[0]
                comp_row = c0.get("item") if isinstance(c0, dict) else c0
            comp = comp_row or {}
        else:
            own = payload.get("own") or {}
            comp = payload.get("comp") or {}
    except Exception:
        raise HTTPException(status_code=400, detail="payload inválido")
    use_heur = True if payload.get("use_heuristics", True) else False
    use_reg = True if payload.get("use_regression", True) else False

    own = _prep_row(own)
    comp = _prep_row(comp)

    # ---- apples-to-apples ----
    motivos: list[str] = []
    ok = True
    seg_a = _seg_display(own) or ""
    seg_b = _seg_display(comp) or ""
    if seg_a and seg_b and (seg_a != seg_b):
        ok = False; motivos.append(f"Segmento distinto: {seg_a} vs {seg_b}")
    try:
        ya = int(own.get("ano") or own.get("year") or 0)
        yb = int(comp.get("ano") or comp.get("year") or 0)
        if ya and yb and abs(ya - yb) > 1:
            ok = False; motivos.append(f"Años separados >1: {ya} vs {yb}")
    except Exception:
        pass
    # Robustly derive propulsion bucket for base (avoid 'None' string)
    _fb_param = payload.get("fuel_bucket_base")
    if _fb_param is None or str(_fb_param).strip().lower() in {"", "none", "null"}:
        fb_a = _fuel_bucket(own)
    else:
        fb_a = str(_fb_param)
    fb_b = _fuel_bucket(comp)
    if fb_a != fb_b:
        ok = False; motivos.append(f"Propulsión distinta: {fb_a} vs {fb_b}")
    hp_a = to_num(own.get("caballos_fuerza")) or 0.0
    hp_b = to_num(comp.get("caballos_fuerza")) or 0.0
    if hp_a and hp_b:
        if abs(hp_b - hp_a) / hp_a > 0.10:
            ok = False; motivos.append("Δ HP > 10%")
    else:
        motivos.append("HP faltante en alguno")
    dt_a = _drivetrain(own) or ""
    dt_b = _drivetrain(comp) or ""
    if dt_a and dt_b and (dt_a != dt_b):
        motivos.append(f"Tracción distinta: {dt_a} vs {dt_b}")
    def _avg_abs_delta_pillars(a: Dict[str, Any], b: Dict[str, Any]) -> Optional[float]:
        keys = ["equip_p_adas","equip_p_safety","equip_p_infotainment","equip_p_comfort","equip_p_traction","equip_p_utility"]
        vals: list[float] = []
        for k in keys:
            va, vb = to_num(a.get(k)), to_num(b.get(k))
            if (va is not None and va > 0) and (vb is not None and vb > 0):
                vals.append(abs(float(vb - va)))
        if len(vals) >= 2:
            return float(sum(vals) / len(vals))
        return None
    avg_p = _avg_abs_delta_pillars(own, comp)
    if avg_p is not None and avg_p > 10.0:
        ok = False; motivos.append("Δ pilares promedio > 10 pts")
    L_a = to_num(own.get("longitud_mm"))
    L_b = to_num(comp.get("longitud_mm"))
    if L_a and L_b:
        if abs(L_b - L_a) / L_a > 0.05:
            motivos.append("Δ largo > 5% (opcional)")
    apples = {"ok": ok, "motivos_no": ([] if ok else motivos)}

    # ---- estimación de coeficientes (β) ----
    def _cph_ref() -> Optional[float]:
        try:
            df = _load_catalog().copy()
            if "segmento_ventas" in df.columns or "body_style" in df.columns:
                cand = df.get("segmento_ventas") if "segmento_ventas" in df.columns else df.get("body_style")
                mask = cand.astype(str).fillna("").str.lower().apply(lambda s: _seg_display({"segmento_ventas": s})==seg_a)
                df = df[mask]
            ya = int(own.get("ano") or 0) if own.get("ano") else None
            if ya is not None and "ano" in df.columns:
                import pandas as _pd
                yr = _pd.to_numeric(df["ano"], errors="coerce")
                df = df[(yr >= (ya-1)) & (yr <= (ya+1))]
            import pandas as _pd
            hp = _pd.to_numeric(df.get("caballos_fuerza"), errors="coerce")
            pr = _pd.to_numeric(df.get("precio_transaccion").fillna(df.get("msrp")), errors="coerce")
            cph = (pr / hp)
            cph = cph.dropna()
            cph = cph[cph>0]
            if cph.empty:
                return None
            q10, q90 = cph.quantile(0.10), cph.quantile(0.90)
            trimmed = cph[(cph>=q10) & (cph<=q90)]
            return float(trimmed.mean()) if not trimmed.empty else float(cph.mean())
        except Exception:
            return None
    CPH = _cph_ref()
    seg = seg_a or ""
    if seg in {"Pickup","SUV'S"}:
        B_AWD = 18000.0
    elif seg in {"Sedán","Hatchback"}:
        B_AWD = 12000.0
    else:
        B_AWD = 15000.0
    B_PROP = {"HEV": 30000.0, "PHEV": 70000.0, "BEV": 90000.0}
    B_PIL_PT = {
        "equip_p_adas": 8000.0/20.0,
        "equip_p_safety": 6000.0/20.0,
        "equip_p_infotainment": 5000.0/20.0,
        "equip_p_comfort": 5000.0/20.0,
        "equip_p_traction": 4000.0/20.0,
        "equip_p_utility": 3000.0/20.0,
    }
    beta_len_perc = 0.007

    used_regression = False
    if use_reg:
        try:
            import pandas as _pd
            import numpy as _np  # local
            df = _load_catalog().copy()
            if "segmento_ventas" in df.columns or "body_style" in df.columns:
                cand = df.get("segmento_ventas") if "segmento_ventas" in df.columns else df.get("body_style")
                mask = cand.astype(str).fillna("").str.lower().apply(lambda s: _seg_display({"segmento_ventas": s})==seg_a)
                df = df[mask]
            ya = int(own.get("ano") or 0) if own.get("ano") else None
            if ya is not None and "ano" in df.columns:
                yr = _pd.to_numeric(df["ano"], errors="coerce")
                df = df[(yr >= (ya-1)) & (yr <= (ya+1))]
            df["__bucket"] = df[["categoria_combustible_final","tipo_de_combustible_original","fuel_type"]].astype(str).agg(" ", axis=1)
            df = df[df["__bucket"].astype(str).str.lower().apply(lambda s: (_fuel_bucket({"categoria_combustible_final": s})==fb_a))]
            df = df.copy()
            df["price"] = _pd.to_numeric(df.get("precio_transaccion").fillna(df.get("msrp")), errors="coerce")
            df["hp"] = _pd.to_numeric(df.get("caballos_fuerza"), errors="coerce")
            df["awd"] = df[["driven_wheels","traccion_original","traccion"]].astype(str).agg(" ", axis=1).str.lower().apply(lambda s: 1 if any(k in s for k in ("awd","4x4","4wd")) else 0)
            for k in B_PIL_PT.keys():
                df[k] = _pd.to_numeric(df.get(k), errors="coerce")
            df["longitud_mm"] = _pd.to_numeric(df.get("longitud_mm"), errors="coerce")
            base_len = to_num(own.get("longitud_mm")) or _pd.to_numeric(df["longitud_mm"], errors="coerce").median()
            df["len_pct"] = (df["longitud_mm"] - float(base_len)) / float(base_len)
            use = df[["price","hp","awd","len_pct", *list(B_PIL_PT.keys())]].dropna()
            use = use[(use["price"]>0) & (use["hp"]>0)]
            if len(use) >= 30:
                Xcols = ["hp","awd","len_pct", *list(B_PIL_PT.keys())]
                X = use[Xcols].copy()
                X = (X - X.mean())/X.std(ddof=0)
                X.insert(0, "intercept", 1.0)
                y = use["price"].values.reshape(-1,1)
                beta = _np.linalg.pinv(X.values) @ y
                coeffs = dict(zip(["intercept", *Xcols], [float(v) for v in beta.flatten().tolist()]))
                used_regression = True
                try:
                    sigma_hp = float(use["hp"].std())
                    c_hp = coeffs.get("hp") or 0.0
                    if sigma_hp > 0:
                        CPH = max(0.0, c_hp / sigma_hp)
                except Exception:
                    pass
                try:
                    c_awd = coeffs.get("awd") or 0.0
                    B_AWD = max(0.0, c_awd)
                except Exception:
                    pass
                try:
                    c_len = coeffs.get("len_pct") or 0.0
                    beta_len_perc = max(0.0, (c_len / float(use["price"].mean())) * 0.10)
                except Exception:
                    pass
                for k in B_PIL_PT.keys():
                    try:
                        c = coeffs.get(k) or 0.0
                        sigma = float(use[k].std()) or 20.0
                        B_PIL_PT[k] = max(B_PIL_PT[k], c * (20.0/max(1e-6, sigma)))
                    except Exception:
                        pass
        except Exception:
            pass

    # Si la regresión no fue viable y el usuario desactiva heurísticos, anula coeficientes
    if (not used_regression) and (not use_heur):
        CPH = 0.0
        B_AWD = 0.0
        B_PROP = {"HEV": 0.0, "PHEV": 0.0, "BEV": 0.0}
        for k in list(B_PIL_PT.keys()):
            B_PIL_PT[k] = 0.0
        beta_len_perc = 0.0

    # ---- descomposición ----
    price_a = to_num(own.get("precio_transaccion") or own.get("msrp")) or 0.0
    price_b = to_num(comp.get("precio_transaccion") or comp.get("msrp")) or 0.0
    delta_price = float(price_b - price_a)
    d_hp = float((to_num(comp.get("caballos_fuerza")) or 0.0) - (to_num(own.get("caballos_fuerza")) or 0.0))
    d_awd = int(_is_awd(comp) - _is_awd(own))
    bucket_a, bucket_b = fb_a, fb_b
    eff_hp = (CPH or (to_num(own.get("cost_per_hp_mxn")) or 0.0)) * d_hp
    eff_awd = (B_AWD or 0.0) * d_awd
    B_PROP = B_PROP  # noqa: F811 (satisfy linter)
    def _prop_effect(a: str, b: str) -> float:
        if a == b:
            return 0.0
        return float({"HEV": 30000.0, "PHEV": 70000.0, "BEV": 90000.0}.get(b, 0.0) - {"HEV": 30000.0, "PHEV": 70000.0, "BEV": 90000.0}.get(a, 0.0))
    eff_prop = _prop_effect(bucket_a, bucket_b)
    def _pillar_delta_sum(a: Dict[str, Any], b: Dict[str, Any]) -> tuple[float, list]:
        total = 0.0; brk: list[dict] = []
        label = {"equip_p_adas":"ADAS","equip_p_safety":"Seguridad","equip_p_infotainment":"Info","equip_p_comfort":"Confort","equip_p_traction":"Tracción","equip_p_utility":"Utilidad"}
        for k, beta_pt in B_PIL_PT.items():
            va, vb = to_num(a.get(k)), to_num(b.get(k))
            if (va is None) or (vb is None) or (va<=0) or (vb<=0):
                continue
            dpt = float(vb - va)
            contrib = float(beta_pt * dpt)
            total += contrib
            brk.append({"pilar": label.get(k,k), "delta_pts": round(dpt,1), "contrib_mxn": round(contrib,0)})
        return total, brk
    eff_pil, pil_brk = _pillar_delta_sum(own, comp)
    L_a = to_num(own.get("longitud_mm")); L_b = to_num(comp.get("longitud_mm"))
    eff_len = 0.0
    if L_a and L_b and price_a>0:
        dL_pct = float((L_b - L_a) / L_a)
        eff_len = float(price_a * (beta_len_perc/1.0) * (dL_pct/0.10))
    explained = float((eff_hp or 0.0) + (eff_awd or 0.0) + (eff_prop or 0.0) + (eff_pil or 0.0) + (eff_len or 0.0))
    residual = float(delta_price - explained)
    # Reorientar efectos al punto de vista del vehículo propio (positivo = a favor del propio)
    d_hp_own = -d_hp
    eff_hp_own = -eff_hp
    eff_awd_own = -eff_awd
    eff_prop_own = -eff_prop
    eff_len_own = -eff_len
    eff_pil_own = -eff_pil
    residual_own = -residual
    decomposition: list[Dict[str, Any]] = []
    decomposition.append({
        "componente":"HP",
        "monto": round(eff_hp_own,0),
        "explicacion": f"(ΔHP propio−comp={int(d_hp_own)}) × CPH_ref={int(round((CPH or 0.0),0)) if (CPH or 0)>0 else int(to_num(own.get('cost_per_hp_mxn') or 0) or 0)}"
    })
    decomposition.append({
        "componente":"Tracción",
        "monto": round(eff_awd_own,0),
        "explicacion": f"β_AWD≈{int(B_AWD)} × (AWD_A−AWD_B)={-d_awd}"
    })
    decomposition.append({
        "componente":"Propulsión",
        "monto": round(eff_prop_own,0),
        "explicacion": f"β_prop[{bucket_a}] − β_prop[{bucket_b}]"
    })
    decomposition.append({
        "componente":"Equipamiento",
        "monto": round(eff_pil_own,0),
        "explicacion": f"Σ β_k × Δpilar_k (propio−comp)",
        "detalle": pil_brk
    })
    if L_a and L_b:
        decomposition.append({
            "componente":"Dimensiones",
            "monto": round(eff_len_own,0),
            "explicacion": f"β_len≈{int(beta_len_perc*1000)/10}% por 10% de largo (propio−comp)"
        })
    decomposition.append({
        "componente":"Diferencia no explicada",
        "monto": round(residual_own,0),
        "explicacion": "(Precio propio−comp) − suma de efectos (propio)"
    })

    # ---- bono sugerido (con guardrails) ----
    def _env_flag(name: str, default: str = "1") -> bool:
        return str(os.getenv(name, default)).strip().lower() in {"1","true","yes","y"}
    def _env_float(name: str, default: float) -> float:
        try:
            return float(os.getenv(name, str(default)))
        except Exception:
            return float(default)
    require_apples = _env_flag("BONUS_REQUIRE_APPLES", "1")
    max_pct = _env_float("BONUS_MAX_PCT", 0.08)   # 8% del precio base
    max_x_delta = _env_float("BONUS_MAX_X_DELTA", 3.0)  # ≤ 3× |ΔTX|
    raw_bono = float(residual) if residual>0 else 0.0
    # Guardrails
    capped = float(max(0.0, raw_bono))
    if (require_apples and not apples.get("ok")):
        capped = 0.0
        try:
            notas.append("A2A=✕: bono limitado a 0 por guardrail")
        except Exception:
            pass
    # Tope por % del precio base
    if price_a and max_pct>0:
        capped = min(capped, float(price_a) * max_pct)
    # Tope por múltiplo del ΔTX observado
    if max_x_delta>0:
        capped = min(capped, abs(delta_price) * max_x_delta)
    bono_sug = capped
    rango = [int(round(bono_sug*0.9)), int(round(bono_sug*1.1))] if bono_sug>0 else None
    recommended_bonus = {"mxn": int(round(bono_sug)), "rango_sugerido": rango, "guardrails_margen": payload.get("guardrails_margen")}

    # ---- sugerencias de equipo ----
    pillar_features = {
        "ADAS": ["Frenado de emergencia","Punto ciego","Cámara 360"],
        "Seguridad": ["Control de estabilidad","Bolsas cortina"],
        "Info": ["Android Auto","Apple CarPlay","Pantalla táctil"],
        "Confort": ["Llave inteligente","Portón eléctrico"],
        "Tracción": ["Control de tracción"],
        "Utilidad": ["Rieles de techo","Enganche remolque"],
    }
    label_by_key = {"equip_p_adas":"ADAS","equip_p_safety":"Seguridad","equip_p_infotainment":"Info","equip_p_comfort":"Confort","equip_p_traction":"Tracción","equip_p_utility":"Utilidad"}
    gaps: list[tuple[str, float, float]] = []
    for k, lbl in label_by_key.items():
        va, vb = to_num(own.get(k)), to_num(comp.get(k))
        if (va is None) or (vb is None) or (va<=0) or (vb<=0):
            continue
        dpt = float(vb - va)
        if dpt > 0:
            beta_pt = B_PIL_PT.get(k, 0.0)
            impact = dpt * beta_pt
            gaps.append((lbl, dpt, impact))
    gaps.sort(key=lambda x: x[2], reverse=True)
    equipment_suggestions = []
    for lbl, dpt, imp in gaps[:3]:
        feats = pillar_features.get(lbl, [])
        equipment_suggestions.append({"feature": f"{lbl}: añadir {', '.join(feats[:2])}", "impacto_estimado_mxn": int(round(imp)), "prioridad": lbl})

    def _fmt_money(x: float) -> str:
        try:
            return f"$ {int(round(x,0)):,}".replace(",", ",")
        except Exception:
            return str(round(x,0))
    bullets: list[str] = []
    bullets.append(f"Precio TX: propio {_fmt_money(price_a)} vs comp {_fmt_money(price_b)} (Δ comp−prop {_fmt_money(delta_price)})")
    bullets.append(f"Efectos a favor del propio — HP {_fmt_money(eff_hp_own)}, AWD {_fmt_money(eff_awd_own)}, prop {_fmt_money(eff_prop_own)}, equip {_fmt_money(eff_pil_own)}{(' y tamaño '+_fmt_money(eff_len_own)) if (L_a and L_b) else ''}")
    if residual_own < 0:
        bullets.append(f"Gap no explicado a favor del comp: {_fmt_money(-residual_own)}")
    else:
        bullets.append(f"Gap no explicado a favor del propio: {_fmt_money(residual_own)}")

    notas: list[str] = []
    if CPH is None:
        notas.append("CPH_ref con pocos comparables o datos faltantes; usando heurístico")
    if (to_num(own.get("caballos_fuerza")) or 0)==0 or (to_num(comp.get("caballos_fuerza")) or 0)==0:
        notas.append("HP faltante; efecto HP puede ser inexacto")
    if avg_p is None:
        notas.append("Pilares insuficientes; equipamiento aproximado por score/heurísticos")
    if not (L_a and L_b):
        notas.append("Longitud faltante; tamaño omitido")

    try:
        audit("resp", "/price_explain", body={"ok": True})
    except Exception:
        pass
    return {
        "apples_to_apples": apples,
        "decomposition": decomposition,
        "recommended_bonus": recommended_bonus,
        "equipment_suggestions": equipment_suggestions,
        "messaging": bullets,
        "notas": notas,
    }

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

    # optional: filter by same segment/body style (robust mapping)
    def _norm_segment(s: str) -> Optional[str]:
        s = str(s or "").strip().lower()
        if not s or s in {"nan","none","null","na","n/a","-"}:
            return None
        if any(x in s for x in ("pick","cab","chasis","camioneta")):
            return "Pickup"
        if any(x in s for x in ("todo terreno","suv","suvs","crossover","sport utility")):
            return "SUV'S"
        if "van" in s:
            return "Van"
        if any(x in s for x in ("hatch","hb")):
            return "Hatchback"
        if any(x in s for x in ("sedan","sedán","saloon")):
            return "Sedán"
        return s.title()

    base_seg_fixed: Optional[str] = None
    if same_segment and md:
        try:
            # Determine base segment using available columns (prefer normalized sales segment)
            # Build compact model keys to handle variants like "BT-50" vs "BT 50"
            import re as _re
            def _compact(s: str) -> str:
                return _re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
            df0_loc = df0.copy()
            if "model" in df0_loc.columns:
                df0_loc["__mdc"] = df0_loc["model"].astype(str).map(_compact)
            base_rows = df0_loc[(df0_loc["model"].str.upper() == md) | (df0_loc.get("__mdc") == _compact(md))]
            if yr is not None and "ano" in df0_loc.columns:
                base_rows = base_rows[base_rows["ano"] == yr] if not base_rows.empty else df0_loc[(df0_loc.get("__mdc") == _compact(md))]
            base_seg: Optional[str] = None
            if not base_rows.empty:
                # try any non-null across potential duplicates
                try:
                    cand = base_rows["segmento_ventas"].dropna().astype(str).tolist() if "segmento_ventas" in base_rows.columns else []
                except Exception:
                    cand = []
                if not cand and "body_style" in base_rows.columns:
                    try:
                        cand = base_rows["body_style"].dropna().astype(str).tolist()
                    except Exception:
                        cand = []
                for v in cand:
                    base_seg = _norm_segment(v)
                    if base_seg:
                        break
            # If still unknown, try to infer from any year for the same model
            if not base_seg:
                any0 = df0.copy()
                if "model" in any0.columns:
                    any0["__mdc"] = any0["model"].astype(str).map(_compact)
                any_model = any0[(any0["model"].str.upper() == md) | (any0.get("__mdc") == _compact(md))]
                if not any_model.empty:
                    if "segmento_ventas" in any_model.columns:
                        for v in any_model["segmento_ventas"].astype(str).tolist():
                            base_seg = _norm_segment(v)
                            if base_seg:
                                break
                    if (not base_seg) and "body_style" in any_model.columns:
                        for v in any_model["body_style"].astype(str).tolist():
                            base_seg = _norm_segment(v)
                            if base_seg:
                                break
            # Apply filter if we could resolve a segment
            if base_seg:
                # Build candidate segment column from available sources
                cand_seg = None
                if "segmento_ventas" in df.columns:
                    cand_seg = df["segmento_ventas"].astype(str).map(_norm_segment)
                if cand_seg is None and "segmento_ventas" in df.columns:
                    # ensure cand_seg initialized; map handles but keep for safety
                    cand_seg = df["segmento_ventas"].astype(str).map(_norm_segment)
                if (cand_seg is None) and "body_style" in df.columns:
                    cand_seg = df["body_style"].astype(str).map(_norm_segment)
                if cand_seg is not None:
                    # Compare as text ignoring case; drop rows without segment
                    m = cand_seg.fillna("").str.upper()
                    df = df[(m != "") & (m == str(base_seg).upper())]
                    base_seg_fixed = str(base_seg)
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
    # Final safeguard: enforce same-segment after ranking (in case of missing seg in some rows earlier)
    if same_segment and base_seg_fixed:
        try:
            def _seg_series(frame):
                if "segmento_ventas" in frame.columns:
                    return frame["segmento_ventas"].astype(str).map(_norm_segment)
                if "body_style" in frame.columns:
                    return frame["body_style"].astype(str).map(_norm_segment)
                return None
            cand = _seg_series(out)
            if cand is not None:
                out = out[cand.fillna("").str.upper() == str(base_seg_fixed).upper()]
        except Exception:
            pass
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
    # Report filters used back to client
    used_filters = {
        "k": k,
        "same_segment": same_segment,
        "same_propulsion": same_propulsion,
        "include_same_brand": include_same_brand,
        "include_different_years": include_different_years,
        "max_length_pct": max_len_pct,
        "max_length_mm": max_len_mm,
        "score_diff_pct": score_diff_pct,
        "min_match_pct": min_match_pct,
        "base_segment": base_seg_fixed,
        "base_model": md,
        "base_year": yr,
    }
    try:
        dbg = {"same_segment": same_segment, "same_propulsion": same_propulsion, "base_model": md, "base_year": yr}
        # quick glance of segments in candidates after filters
        if "segmento_ventas" in out.columns or "body_style" in out.columns:
            try:
                seg_series = out.get("segmento_ventas") if "segmento_ventas" in out.columns else out.get("body_style")
                vals = seg_series.astype(str).fillna("").tolist() if seg_series is not None else []
                from collections import Counter as _Counter
                cnt = _Counter([_norm_segment(v) or "(vacío)" for v in vals])
                dbg["segments"] = dict(cnt)
            except Exception:
                pass
        audit("resp", "/auto_competitors", body={"returned": len(rows)}, debug=dbg)
    except Exception:
        audit("resp", "/auto_competitors", body={"returned": len(rows)})
    return {"items": rows, "count": len(rows), "used_filters": used_filters}


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
def dashboard(segment: Optional[str] = Query(None)) -> Dict[str, Any]:
    """Basic inventory stats for a lightweight dashboard.

    Counts are computed for allowed years (2024+) when possible.
    """
    df = _load_catalog().copy()
    try:
        if "ano" in df.columns:
            df = df[df["ano"].isin(list(ALLOWED_YEARS))]
    except Exception:
        pass
    # Optional: filter by segment if provided (robust bucketization)
    try:
        if segment and "segmento_ventas" in df.columns:
            def _seg_norm(v: str) -> str:
                s0 = str(v or "").strip().lower()
                if any(x in s0 for x in ("pick","cab","chasis","camioneta")): return "Pickup"
                if any(x in s0 for x in ("todo terreno","suv","suvs","crossover","sport utility")): return "SUV'S"
                if "van" in s0: return "Van"
                if any(x in s0 for x in ("hatch","hb")): return "Hatchback"
                if any(x in s0 for x in ("sedan","sedán","saloon")): return "Sedán"
                return str(v or "").strip()
            seg_filter = _seg_norm(segment)
            df = df[df["segmento_ventas"].astype(str).map(_seg_norm).str.upper() == str(seg_filter).upper()]
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
    versions_by_year: Dict[int, int] = {}
    try:
        if pd is not None and {"make","model","version","ano"}.issubset(df.columns):
            tmp = df[["make","model","version","ano"]].copy()
            for c in ("make","model","version"):
                tmp[c] = tmp[c].astype(str).str.strip().str.upper()
            tmp["ano"] = pd.to_numeric(tmp["ano"], errors="coerce").astype("Int64")
            tmp = tmp.dropna(subset=["make","model","version","ano"])  # type: ignore[arg-type]
            tmp = tmp.drop_duplicates(subset=["make","model","version","ano"])  # unique version-year
            versions = int(tmp.shape[0])
            try:
                by = tmp.groupby(tmp["ano"].astype(int)).size()
                versions_by_year = {int(k): int(v) for k, v in by.to_dict().items()}
            except Exception:
                versions_by_year = {}
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
        "versions_by_year": versions_by_year,
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
                # Normaliza el argumento para que coincida con el mismo criterio usado al construir 'seg'
                def _norm_arg(v: Optional[str]) -> Optional[str]:
                    if v is None: return None
                    v0 = str(v or "").strip().lower()
                    if any(x in v0 for x in ("pick","cab","chasis")): return "Pickup"
                    if any(x in v0 for x in ("todo terreno","suv","crossover","sport utility")): return "SUV'S"
                    if "van" in v0: return "Van"
                    if any(x in v0 for x in ("hatch","hb")): return "Hatchback"
                    if any(x in v0 for x in ("sedan","sedán","saloon")): return "Sedán"
                    return v
                seg_arg = _norm_arg(segment)
                s = s[s["seg"].str.upper() == str(seg_arg or segment).upper()]
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
                def _norm_seg_arg(v: Optional[str]) -> Optional[str]:
                    if v is None: return None
                    s0 = str(v or "").strip().lower()
                    return "SUV'S" if "todo terreno" in s0 else (v if s0 else None)
                seg_filter = _norm_seg_arg(segment) if segment else None
                aggr: Dict[str, Dict[int,int]] = {}
                for _, row in df.iterrows():
                    seg0 = str(row.get("segmento_ventas") or "").strip()
                    seg = ("SUV'S" if "todo terreno" in seg0.lower() else seg0) or "(sin segmento)"
                    if seg_filter and seg.upper() != str(seg_filter).upper():
                        continue
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
# ------------------------------- Debug: options sources ---------------------
@app.get("/debug/options-sources")
def debug_options_sources() -> Dict[str, Any]:
    out: Dict[str, Any] = {"catalog": {}, "flat": {}, "processed": {}, "json": {}}
    # 1) Catalog (current.csv)
    try:
        df = _load_catalog().copy()
        if pd is not None and "make" in df.columns:
            brands = sorted(map(str, df["make"].astype(str).str.upper().dropna().unique().tolist()))
            out["catalog"] = {"count": len(brands), "sample": brands[:20]}
    except Exception as e:
        out["catalog"] = {"error": str(e)}
    # 2) Flat enriched
    try:
        flat = ROOT / "data" / "enriched" / "vehiculos_todos_flat.csv"
        if flat.exists():
            t = pd.read_csv(flat, low_memory=False)
            col = next((c for c in t.columns if str(c).strip().lower() in {"make","marca"}), None)
            if col:
                brands = sorted(map(str, t[col].astype(str).str.upper().dropna().unique().tolist()))
                out["flat"] = {"count": len(brands), "sample": brands[:20]}
            else:
                out["flat"] = {"error": "no make/marca column"}
        else:
            out["flat"] = {"error": "file not found"}
    except Exception as e:
        out["flat"] = {"error": str(e)}
    # 3) Processed base catalog
    try:
        proc = ROOT / "data" / "equipo_veh_limpio_procesado.csv"
        if proc.exists():
            t = pd.read_csv(proc, low_memory=False)
            col = next((c for c in t.columns if str(c).strip().lower() in {"make","marca"}), None)
            if col:
                brands = sorted(map(str, t[col].astype(str).str.upper().dropna().unique().tolist()))
                out["processed"] = {"count": len(brands), "sample": brands[:20]}
            else:
                out["processed"] = {"error": "no make/marca column"}
        else:
            out["processed"] = {"error": "file not found"}
    except Exception as e:
        out["processed"] = {"error": str(e)}
    # 4) JSON curated
    try:
        import json as _json
        js = ROOT / "data" / "vehiculos-todos.json"
        if not js.exists():
            js = ROOT / "data" / "vehiculos-todos1.json"
        if js.exists():
            data = _json.loads(js.read_text(encoding="utf-8"))
            items = data.get("vehicles") if isinstance(data, dict) else (data if isinstance(data, list) else [])
            brands = set()
            for v in items or []:
                mk = (v.get("manufacturer",{}) or {}).get("name") or (v.get("make",{}) or {}).get("name")
                if mk:
                    brands.add(str(mk).strip().upper())
            out["json"] = {"count": len(brands), "sample": sorted(list(brands))[:20]}
        else:
            out["json"] = {"error": "json not found"}
    except Exception as e:
        out["json"] = {"error": str(e)}
    return out


# ------------------------------- Debug: coverage ----------------------------
@app.get("/debug/coverage")
def debug_coverage(years: str = "2024,2025,2026") -> Dict[str, Any]:
    """Return coverage stats for key fields in the catalog for selected years."""
    try:
        df = _load_catalog().copy()
        if pd is None:
            return {"error": "pandas not available"}
        try:
            ys = [int(y) for y in str(years).split(',') if str(y).strip()]
            if "ano" in df.columns:
                df = df[pd.to_numeric(df["ano"], errors="coerce").isin(ys)]
        except Exception:
            pass
        total = int(len(df))
        def cov(col: str) -> Dict[str, int | float]:
            if col not in df.columns:
                return {"present": 0, "pct": 0.0}
            s = df[col]
            present = int(s.notna().sum())
            return {"present": present, "pct": round((present/total*100.0) if total else 0.0, 1)}
        fields = [
            "equip_score","equip_p_adas","equip_p_safety","equip_p_comfort","equip_p_infotainment","equip_p_traction","equip_p_utility",
            "combinado_kml","categoria_combustible_final","segmento_ventas","body_style","precio_transaccion","msrp"
        ]
        stats = {f: cov(f) for f in fields}
        return {"total": total, "years": years, "coverage": stats}
    except Exception as e:
        return {"error": str(e)}
