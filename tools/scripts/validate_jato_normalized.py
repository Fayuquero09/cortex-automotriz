#!/usr/bin/env python3
"""
Validate normalized JATO data files and constraints.

Usage:
  python3 tools/scripts/validate_jato_normalized.py [make] [model] [trim] [year]
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any, Dict, Optional

CATALOG_PATH = Path("Strapi/data/autoradar/normalized.jato.json")


def to_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        s = str(v).strip().replace(",", ".")
        if not s:
            return None
        return float(s)
    except Exception:
        return None


def main() -> int:
    if not CATALOG_PATH.exists():
        print(f"ERROR: {CATALOG_PATH} not found. Place your dump there.")
        return 2

    try:
        obj = json.loads(CATALOG_PATH.read_text())
    except Exception as e:
        print(f"ERROR: cannot parse JSON: {e}")
        return 2

    meta = obj.get("metadata")
    vehicles = obj.get("vehicles")
    if not isinstance(meta, dict) or not isinstance(vehicles, list):
        print("ERROR: catalog must be an object with 'metadata' and 'vehicles' array")
        return 2

    make = (sys.argv[1] if len(sys.argv) > 1 else "Ford").lower()
    model = (sys.argv[2] if len(sys.argv) > 2 else "Territory").lower()
    trim = (sys.argv[3] if len(sys.argv) > 3 else "Ambiente").lower()
    try:
        year = int(sys.argv[4]) if len(sys.argv) > 4 else 2026
    except Exception:
        year = 2026

    row: Optional[Dict[str, Any]] = None
    for v in vehicles:
        try:
            if (
                str(v.get("make") or "").lower() == make
                and str(v.get("model") or "").lower() == model
                and str(v.get("trim") or "").lower() == trim
                and int(v.get("year") or 0) == year
            ):
                row = v
                break
        except Exception:
            continue

    if not row:
        print("ERROR: target row not found. Provide [make model trim year] if needed.")
        return 1

    print("OK: catalog structure valid. Vehicles:", len(vehicles))
    print("Target:", {
        k: row.get(k) for k in [
            "uid","vehicle_id","make","model","version","trim","year","drivetrain",
            "adas_surround_view","adas_parking_sensors_front","comfort_front_seat_ventilation",
            "fuel_city_kml","fuel_highway_kml","fuel_combined_kml","equip_score"
        ]
    })

    # 1) Flags coherency
    issues = []
    if str(row.get("drivetrain") or "").upper() == "FWD":
        for k in ("feat_4x4","feat_reductora","feat_bloqueo"):
            if str(row.get(k)).strip() in {"1","true","True"} or row.get(k) == 1:
                issues.append(f"{k} should be 0 for FWD")
    if row.get("adas_surround_view") in (None, False):
        if str(row.get("feat_camara_360")).strip() in {"1","true","True"} or row.get("feat_camara_360") == 1:
            issues.append("feat_camara_360 should be 0 (adas_surround_view=false)")
    if str(row.get("adas_parking_sensors_front")).lower() in {"false","0","none",""}:
        if bool(row.get("feature_park_sensors_front")) is True:
            issues.append("feature_park_sensors_front must be false (front sensors are false)")
    if bool(row.get("comfort_front_seat_ventilation")) is False:
        if str(row.get("feat_ventilacion")).strip() in {"1","true","True"} or row.get("feat_ventilacion") == 1:
            issues.append("feat_ventilacion should be 0 (no seat ventilation)")

    # 2) Fuel coherence
    c_kml = to_float(row.get("fuel_city_kml"))
    h_kml = to_float(row.get("fuel_highway_kml"))
    comb_kml = to_float(row.get("fuel_combined_kml"))
    fuel_notes = []
    if c_kml and h_kml:
        # If labeled as km/l but city > highway, likely L/100 km mislabeled
        if c_kml > h_kml:
            # interpret original numbers as L/100 km and convert to km/l
            c_conv = 100.0 / c_kml if c_kml else None
            h_conv = 100.0 / h_kml if h_kml else None
            fuel_notes.append(
                f"fuel_city_kml={c_kml}, fuel_highway_kml={h_kml} look like l/100km; suggest city={c_conv:.2f}, highway={h_conv:.2f} km/l"
            )
            if comb_kml is not None and (comb_kml < min(c_conv, h_conv) or comb_kml > max(c_conv, h_conv)):
                fuel_notes.append(
                    f"fuel_combined_kml={comb_kml} out of range; must be between {min(c_conv,h_conv):.2f} and {max(c_conv,h_conv):.2f}"
                )
        else:
            # km/l typical pattern (highway >= city). Combined must lie in between when present
            if comb_kml is not None and (comb_kml < min(c_kml, h_kml) or comb_kml > max(c_kml, h_kml)):
                fuel_notes.append(
                    f"fuel_combined_kml={comb_kml} out of range; must be between {min(c_kml,h_kml):.2f} and {max(c_kml,h_kml):.2f}"
                )

    # 3) equip_score
    eq = to_float(row.get("equip_score"))
    eq_note = None
    if eq is None:
        eq_note = "equip_score missing; expected ~28.33 per catalog base"
    else:
        if not (abs(eq - 28.33) <= 0.2 or abs(eq - 28.3) <= 0.2):
            eq_note = f"equip_score={eq} differs from expected 28.33 (if this is a different metric, rename to equip_match_pct)"

    # Report
    if issues:
        print("FLAG issues:")
        for i in issues:
            print(" -", i)
    else:
        print("FLAGs OK")

    if fuel_notes:
        print("FUEL notes:")
        for n in fuel_notes:
            print(" -", n)
    else:
        print("FUEL OK or insufficient data")

    if eq_note:
        print("SCORE note:")
        print(" -", eq_note)
    else:
        print("equip_score OK (~28.33)")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

