#!/usr/bin/env python3
"""Rebuild catalog artifacts from the JATO augmented dump.

This keeps every attribute found in the original JSON while exposing flattened
columns for downstream CSV/Parquet consumers. Run from repo root:

    python dataframe_base/scripts/refresh_catalog.py

Outputs:
  - data/vehiculos-todos-augmented.json (normalized copy with fixed fields)
  - data/vehiculos-todos-augmented.jsonl (one JSON per line)
  - data/catalog_master.csv (flattened view for quick inspection)
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[2]
DF_BASE = REPO_ROOT / "dataframe_base"
SRC_JSON = REPO_ROOT / "jato" / "out" / "vehiculos-todos-augmented.json"
DST_JSON = DF_BASE / "data" / "vehiculos-todos-augmented.json"
DST_JSONL = DF_BASE / "data" / "vehiculos-todos-augmented.jsonl"
DST_CSV = DF_BASE / "data" / "catalog_master.csv"


def _as_float(value: Any) -> float | None:
    """Convert strings like '8.7 km/l' or '29.4 l/100km' to floats."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            v = float(value)
            if v != v:  # NaN guard
                return None
            return v
        except Exception:
            return None
    try:
        text = str(value).strip()
        if not text:
            return None
        match = re.search(r"[-+]?[0-9]+(?:[\.,][0-9]+)?", text)
        if not match:
            return None
        token = match.group(0).replace(",", ".")
        return float(token)
    except Exception:
        return None


def _ensure_model_year(vehicle: Dict[str, Any]) -> int | None:
    year = vehicle.get("modelYear")
    if isinstance(year, int):
        return year
    if isinstance(year, str) and year.isdigit():
        return int(year)
    version = vehicle.get("version") or {}
    ver_year = version.get("year") or version.get("modelYear")
    if isinstance(ver_year, int):
        return ver_year
    if isinstance(ver_year, str) and ver_year.isdigit():
        return int(ver_year)
    vid = vehicle.get("vehicleId") or ""
    match = re.search(r"20\d{2}", str(vid))
    if match:
        try:
            return int(match.group(0))
        except Exception:
            pass
    return None


def _ensure_consumption(vehicle: Dict[str, Any]) -> Tuple[float | None, float | None]:
    """Return (km_l, l_100km) best-effort."""
    fe = vehicle.get("fuelEconomy") or {}
    km_l: float | None = None
    l_100: float | None = None

    for key in ("combinado_kml", "combinedKmPerLitre", "combined_km_per_litre"):
        km_l = _as_float(vehicle.get(key))
        if km_l:
            break
        km_l = _as_float(fe.get(key)) if fe else None
        if km_l:
            break

    if not km_l:
        km_l = _as_float(fe.get("combined"))
        if isinstance(fe.get("combined"), str) and "l/100" in fe.get("combined", "").lower():
            km_l = None

    for key in ("combinado_l_100km", "combinedLitresPer100Km", "l_100km"):
        l_100 = _as_float(vehicle.get(key))
        if l_100:
            break
        l_100 = _as_float(fe.get(key)) if fe else None
        if l_100:
            break

    if km_l and not l_100:
        l_100 = 100.0 / km_l if km_l > 0 else None
    if l_100 and not km_l:
        km_l = 100.0 / l_100 if l_100 > 0 else None

    return km_l, l_100


def _flatten_vehicle(raw: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    manufacturer = raw.get("manufacturer") or {}
    make = raw.get("make") or {}
    model = raw.get("model") or {}
    version = raw.get("version") or {}

    out["manufacturer_name"] = manufacturer.get("name")
    out["manufacturer_url"] = manufacturer.get("urlName")
    out["make_name"] = make.get("name")
    out["make_url"] = make.get("urlName")
    out["model_name"] = model.get("name")
    out["model_url"] = model.get("urlName")
    out["version_name"] = version.get("name")
    out["version_code"] = version.get("code")
    out["version_trim"] = version.get("trimName")
    out["model_year"] = _ensure_model_year(raw)

    out["uid"] = raw.get("uid")
    out["vehicle_id"] = raw.get("vehicleId")
    out["body_style"] = raw.get("bodyStyle") or version.get("bodyStyleName")
    out["drivetrain"] = raw.get("drivetrain") or version.get("drivenWheels")
    out["transmission"] = raw.get("transmission") or version.get("transmissionType")

    km_l, l_100 = _ensure_consumption(raw)
    out["combinado_kml"] = km_l
    out["combinado_l_100km"] = l_100

    # Serialize rich blocks for later use
    for key in ("pricing", "fuelEconomy", "equipment", "features", "options", "metadata", "warranty", "standardTexts"):
        obj = raw.get(key)
        try:
            out[f"{key}_json"] = json.dumps(obj, ensure_ascii=False)
        except Exception:
            out[f"{key}_json"] = json.dumps({}, ensure_ascii=False)

    try:
        out["precio_transaccion"] = float(raw.get("precio_transaccion"))
    except Exception:
        out["precio_transaccion"] = None

    # Carry over any existing fuel_cost_60k (will be recomputed later if needed)
    try:
        out["fuel_cost_60k_mxn"] = float(raw.get("fuel_cost_60k_mxn"))
    except Exception:
        out["fuel_cost_60k_mxn"] = None

    return out


def rebuild_catalog() -> None:
    if not SRC_JSON.exists():
        raise FileNotFoundError(f"Fuente no encontrada: {SRC_JSON}")

    with SRC_JSON.open("r", encoding="utf-8") as fh:
        source_obj = json.load(fh)

    vehicles = source_obj.get("vehicles") if isinstance(source_obj, dict) else source_obj
    if not isinstance(vehicles, Iterable):
        raise ValueError("Formato inesperado en JSON de entrada")

    normalized: List[Dict[str, Any]] = []
    flattened: List[Dict[str, Any]] = []

    for raw in vehicles:
        if not isinstance(raw, dict):
            continue
        raw = dict(raw)  # copy to avoid mutating original
        raw["modelYear"] = _ensure_model_year(raw)
        km_l, l_100 = _ensure_consumption(raw)
        if km_l is not None:
            raw["combinado_kml"] = km_l
            raw.setdefault("fuelEconomy", {})["combinedKmPerLitre"] = km_l
        if l_100 is not None:
            raw["combinado_l_100km"] = l_100
            raw.setdefault("fuelEconomy", {})["combinedLitresPer100Km"] = l_100
        normalized.append(raw)
        flattened.append(_flatten_vehicle(raw))

    # Write normalized JSON
    DST_JSON.parent.mkdir(parents=True, exist_ok=True)
    with DST_JSON.open("w", encoding="utf-8") as fh:
        json.dump({"vehicles": normalized, "metadata": source_obj.get("metadata", {})}, fh, ensure_ascii=False)

    # Write JSONL for quick ingestion
    with DST_JSONL.open("w", encoding="utf-8") as fh:
        for row in normalized:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Write flattened CSV
    fieldnames = sorted(flattened[0].keys()) if flattened else []
    with DST_CSV.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(flattened)

    print(f"Regenerados {len(flattened)} vehículos")
    print(f"JSON -> {DST_JSON}")
    print(f"JSONL -> {DST_JSONL}")
    print(f"CSV -> {DST_CSV}")


if __name__ == "__main__":
    rebuild_catalog()
