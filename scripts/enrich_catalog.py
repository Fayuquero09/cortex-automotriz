#!/usr/bin/env python3
from __future__ import annotations

import os
from pathlib import Path
from datetime import datetime, timezone
import csv
import json
import math
import re
from typing import Any, Dict, List, Tuple, Optional

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OEM_DIR = DATA / "oem_specs_processed"
ENRICHED_DIR = DATA / "enriched"
OVERRIDES_DIR = DATA / "overrides"
ALIASES_DIR = DATA / "aliases"
ALIASES_FILE = ALIASES_DIR / "alias_names.csv"
STRAPI_NORMALIZED_PATH = ROOT.parent / "Strapi" / "data" / "autoradar" / "normalized.json"
OVERLAY_JSON_PATH = DATA / "vehiculos-todos-augmented.normalized.enriched.scored.json"


ACRONYMS = {"BMW","VW","GMC","RAM","BYD","GWM","MG","JAC","BAIC","MINI","DS"}
UPPER_TOKENS = {"CX-5","CX-3","CX-30","ID.4","RAV4","RAV-4","X-Trail","Q5","Q3","GLA","GLC"}
FUEL_OVERRIDES = {
    "8459173": "diesel",
    "845917320250604": "diesel",
}


def to_bool(val) -> Optional[bool]:
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, (int, float)):
        try:
            if pd.isna(val):
                return None
        except Exception:
            pass
        return bool(val)
    try:
        s = str(val).strip().lower()
    except Exception:
        return None
    if not s:
        return None
    true_tokens = {"1","true","yes","si","sí","y","on","available","present","standard","serie","incluido","included"}
    false_tokens = {"0","false","no","n","off","none","null","na","n/a","sin","-"}
    if s in true_tokens:
        return True
    if s in false_tokens:
        return False
    return None


def to_float(val) -> Optional[float]:
    if val is None:
        return None
    if isinstance(val, (int, float)):
        try:
            if pd.isna(val):
                return None
        except Exception:
            pass
        return float(val)
    try:
        s = str(val).strip()
    except Exception:
        return None
    if not s or s in {"nan","null","none","-"}:
        return None
    try:
        return float(s)
    except Exception:
        return None


def to_int(val) -> Optional[int]:
    f = to_float(val)
    if f is None:
        return None
    try:
        return int(round(f))
    except Exception:
        return None


def parse_number_like(value: Any) -> Optional[float]:
    """Convert strings such as '5,280 mm' or '5 280' to floats."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            if pd.isna(value):
                return None
        except Exception:
            pass
        return float(value)
    try:
        s = str(value).strip()
    except Exception:
        return None
    if not s:
        return None
    import re as _re
    s = _re.sub(r"[^0-9,\.-]", "", s)
    if not s:
        return None
    if s.count(",") > 1 and s.count(".") == 0:
        s = s.replace(",", "")
    elif s.count(",") == 1 and s.count(".") == 0:
        s = s.replace(",", ".")
    elif s.count(",") >= 1 and s.count(".") >= 1:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    try:
        return float(s)
    except Exception:
        return None


def load_strapi_catalog() -> pd.DataFrame:
    path_env = os.getenv("STRAPI_NORMALIZED_PATH")
    path = Path(path_env) if path_env else STRAPI_NORMALIZED_PATH
    if not path.exists():
        raise SystemExit(f"Strapi catalog not found: {path}")
    payload = json.loads(path.read_text())
    vehicles = payload.get("vehicles") or []

    meta = payload.get("metadata") or {}
    fuel_prices = meta.get("fuelPrices") or {}
    if fuel_prices:
        os.environ.setdefault("PRECIO_GASOLINA_MAGNA_LITRO", str(fuel_prices.get("regular", "23.57")))
        os.environ.setdefault("PRECIO_GASOLINA_PREMIUM_LITRO", str(fuel_prices.get("premium", "25.00")))
        os.environ.setdefault("PRECIO_DIESEL_LITRO", str(fuel_prices.get("diesel", "25.33")))

    rows: list[dict[str, Any]] = []
    def _string_from(obj: Any, *keys: str) -> str:
        """Return first truthy key from dict (case-insensitive) or str(obj)."""
        if isinstance(obj, dict):
            for key in keys:
                if key in obj and obj[key]:
                    return str(obj[key])
        if obj is None:
            return ""
        return str(obj)

    def _json_or_none(obj: Any) -> str | None:
        try:
            return json.dumps(obj, ensure_ascii=False) if obj is not None else None
        except Exception:
            return None

    for veh in vehicles:
        vid = veh.get("vehicle_id") or veh.get("vehicleId") or veh.get("uid")
        if not vid:
            # skip entries without an identifier; keep pipeline tidy
            continue
        # Mantener IDs como string para evitar pérdidas por cast a float en pandas
        vid_str = str(vid).strip()
        if not vid_str:
            continue

        row: Dict[str, Any] = {}
        row["vehicle_id"] = vid_str
        row["uid_strapi"] = str(veh.get("uid") or vid_str)
        make_obj = veh.get("make")
        model_obj = veh.get("model")
        version_obj = veh.get("version")

        row["make"] = _string_from(make_obj, "name", "label")
        row["make_json"] = _json_or_none(make_obj)

        row["model"] = _string_from(model_obj, "name", "label")
        row["model_json"] = _json_or_none(model_obj)

        row["version"] = _string_from(version_obj, "name", "label") or _string_from(veh.get("trim"),)
        row["version_json"] = _json_or_none(version_obj)

        row["trim"] = _string_from(veh.get("trim"), "name")
        year_val = veh.get("year")
        if not year_val and isinstance(version_obj, dict):
            year_val = version_obj.get("year") or version_obj.get("modelYear")
        row["ano"] = year_val
        row["year"] = year_val
        row["region"] = veh.get("region")
        body_obj = veh.get("body_style")
        if not body_obj and isinstance(version_obj, dict):
            body_obj = version_obj.get("bodyStyle") or version_obj.get("bodyStyleName")
        row["body_style"] = _string_from(body_obj, "name", "label")
        seg_obj = veh.get("segmento_ventas") or veh.get("segment")
        if not seg_obj and isinstance(version_obj, dict):
            seg_obj = version_obj.get("bodyStyle") or version_obj.get("bodyStyleName")
        row["segmento_ventas"] = _string_from(seg_obj, "name", "label")

        # Extract dimensional metrics from features -> Dimensiones
        feat_obj = veh.get("features") if isinstance(veh.get("features"), dict) else {}
        dimensiones = None
        for key in ("Dimensiones", "Dimensiones y pesos", "Dimensiones/Pesos"):
            if isinstance(feat_obj.get(key), list) and feat_obj.get(key):
                dimensiones = feat_obj.get(key)
                break
        if isinstance(dimensiones, list):
            DIM_KEYS = {
                "longitud": "longitud_mm",
                "altura": "altura_mm",
                "anchura": "anchura_mm",
                "ancho": "anchura_mm",
                "distancia entre ejes": "wheelbase_mm",
                "peso en vacío": "peso_kg",
                "peso en orden de marcha": "peso_kg",
                "peso bruto": "peso_bruto_kg",
                "capacidad de carga (l)": "capacidad_carga_l",
                "capacidad de carga": "capacidad_de_carga",
                "capacidad carga": "capacidad_de_carga",
            }
            for item in dimensiones:
                label = str(item.get("feature") or item.get("name") or '').strip().lower()
                content = item.get("content") or item.get("value")
                if not label or content in (None, ''):
                    continue
                for key, target in DIM_KEYS.items():
                    if key in label and not row.get(target):
                        num = parse_number_like(content)
                        if num is not None:
                            row[target] = num
        row["make_slug"] = veh.get("make_slug")
        row["model_slug"] = veh.get("model_slug")
        row["version_slug"] = veh.get("version_slug") if "version_slug" in veh else None

        drivetrain = veh.get("drivetrain")
        if drivetrain:
            row["traccion_original"] = drivetrain
            row["driven_wheels"] = str(drivetrain).strip().lower()
        transmission = veh.get("transmission")
        if transmission:
            row["transmision"] = transmission

        pricing = veh.get("pricing") if isinstance(veh.get("pricing"), dict) else {}
        row["msrp"] = (
            to_float(veh.get("price_msrp"))
            or to_float(veh.get("msrp"))
            or to_float((pricing or {}).get("msrp"))
        )
        row["precio_transaccion"] = (
            to_float(veh.get("price_transaction"))
            or to_float(veh.get("precio_transaccion"))
            or to_float((pricing or {}).get("precio_transaccion"))
        )
        row["bono"] = (
            to_float(veh.get("bono"))
            or to_float((pricing or {}).get("bono"))
        )
        row["precio_factura"] = to_float(veh.get("price_invoice"))
        row["precio_delivery"] = to_float(veh.get("price_delivery"))
        row["price_currency"] = veh.get("price_currency")
        if row.get("bono") is None:
            try:
                tx_val = float(row.get("precio_transaccion") or 0)
                msrp_val = float(row.get("msrp") or 0)
                if tx_val > 0 and msrp_val > 0 and tx_val < msrp_val:
                    row["bono"] = round(msrp_val - tx_val, 2)
            except Exception:
                pass

        fuel_obj = veh.get("fuelEconomy") if isinstance(veh.get("fuelEconomy"), dict) else {}
        row["combinado_kml"] = (
            to_float(veh.get("fuel_combined_kml"))
            or to_float(veh.get("combinado_kml"))
            or to_float(fuel_obj.get("combined"))
        )
        row["ciudad_kml"] = (
            to_float(veh.get("fuel_city_kml"))
            or to_float(fuel_obj.get("city"))
        )
        row["fuel_combined_l_100km"] = (
            to_float(veh.get("fuel_combined_l_100km"))
            or to_float(veh.get("combinado_l_100km"))
            or to_float(fuel_obj.get("combinedLitresPer100Km"))
        )
        if row["combinado_kml"] is None and row["fuel_combined_l_100km"]:
            try:
                val = float(row["fuel_combined_l_100km"])
                if val > 0:
                    row["combinado_kml"] = round(100.0 / val, 2)
            except Exception:
                pass
        if row["fuel_combined_l_100km"] is None and row["combinado_kml"]:
            try:
                val = float(row["combinado_kml"])
                if val > 0:
                    row["fuel_combined_l_100km"] = round(100.0 / val, 2)
            except Exception:
                pass
        row["fuel_tank_l"] = to_float(veh.get("fuel_tank_l"))
        row["fuel_cost_60k_mxn"] = to_float(veh.get("fuel_cost_60k_mxn"))
        row["service_cost_60k_mxn"] = to_float(veh.get("service_cost_60k_mxn"))
        row["tco_60k_mxn"] = to_float(veh.get("tco_60k_mxn"))

        fuel_type = str(veh.get("fuel_type") or "").strip()
        fuel_detail = str(veh.get("fuel_type_detail") or "").strip()
        induction = str(veh.get("engine_induction") or "").strip()
        phev_flag = to_bool(veh.get("phev_plug_in"))
        row["phev_plug_in"] = phev_flag

        cat = fuel_detail or fuel_type or induction
        cat_norm = cat.lower()
        if "electric" in cat_norm or "bev" in cat_norm:
            categoria = "bev"
        elif phev_flag:
            categoria = "phev"
        elif "hybrid" in cat_norm or "hev" in cat_norm:
            categoria = "hev"
        elif "diesel" in cat_norm:
            categoria = "diesel"
        else:
            categoria = cat

        # Fallback: infer from equipment block when top-level fields are empty
        if not categoria or categoria.strip().lower() in {"", "no disponible", "no_disponible", "none", "null", "otro", "other"}:
            try:
                equip = veh.get("equipment") or {}
                fuel_sections = []
                for key in ("Combustible", "consumo de combustible", "Motor", "motor"):
                    sec = equip.get(key)
                    if isinstance(sec, list):
                        fuel_sections.extend(sec)
                tokens: list[str] = []
                for item in fuel_sections:
                    if not isinstance(item, dict):
                        continue
                    for val in (item.get("value"), item.get("name")):
                        if val:
                            tokens.append(str(val))
                    for attr in item.get("attributes", []) or []:
                        tokens.append(str(attr.get("value") or ""))
                joined = " ".join(tokens).lower()
                if any(tok in joined for tok in ("diesel", "diésel", "dsl")):
                    categoria = "diesel"
                elif any(tok in joined for tok in ("híbrido", "hibrido", "hev")):
                    categoria = "hev"
                elif any(tok in joined for tok in ("phev", "enchuf")):
                    categoria = "phev"
                elif any(tok in joined for tok in ("eléctrico", "electrico", "bev")):
                    categoria = "bev"
            except Exception:
                pass

        invalid_tokens = {"", "no disponible", "no_disponible", "none", "null", "otro", "other"}
        search_tokens: list[str] = []
        for key in ("version", "trim", "marketing_name", "description", "model_display", "catalog_name"):
            val = veh.get(key)
            if val:
                search_tokens.append(str(val))
        for key in ("labels", "tags"):
            val = veh.get(key)
            if isinstance(val, (list, tuple)):
                for item in val:
                    if item:
                        search_tokens.append(str(item))
        composite = " ".join(search_tokens).lower()
        inferred_from_name = None
        if "diesel" in composite:
            inferred_from_name = "diesel"
        elif any(tok in composite for tok in ("plug-in", "plug in", "phev", "híbrido enchuf", "hibrido enchuf")):
            inferred_from_name = "phev"
        elif any(tok in composite for tok in ("mhev", "mild hybrid", "mild-hybrid")):
            inferred_from_name = "mhev"
        elif any(tok in composite for tok in ("híbrido", "hibrido", "hev")):
            inferred_from_name = "hev"
        elif any(tok in composite for tok in ("eléctrico", "electrico", "bev", "battery electric")):
            inferred_from_name = "bev"
        elif any(tok in composite for tok in ("gasolina", "petrol", "nafta")):
            inferred_from_name = "gasolina"

        composite = " ".join(search_tokens).lower()
        if not categoria or str(categoria).strip().lower() in invalid_tokens:
            categoria = inferred_from_name or categoria
        elif inferred_from_name:
            current = str(categoria).strip().lower()
            # Corrige inconsistencias obvias, p.ej. versión dice Diesel pero fuel_type=gasoline
            mismatch = (
                (inferred_from_name == "diesel" and "diesel" not in current) or
                (inferred_from_name == "phev" and "phev" not in current) or
                (inferred_from_name in {"hev", "mhev"} and not any(tok in current for tok in ("hev", "híbrid", "hibrid"))) or
                (inferred_from_name == "bev" and "elect" not in current)
            )
            if mismatch:
                categoria = inferred_from_name if inferred_from_name != "mhev" else "hev"

        # Manual overrides for casos donde JATO/Strapi entrega fuel_type incorrecto
        override_candidates = [
            veh.get("uid"),
            veh.get("uid_strapi"),
            veh.get("vehicle_id"),
            veh.get("vehicleId"),
            row.get("uid_strapi"),
            row.get("vehicle_id"),
        ]
        for candidate in override_candidates:
            if candidate is None:
                continue
            key_str = str(candidate)
            if key_str in FUEL_OVERRIDES:
                categoria = FUEL_OVERRIDES[key_str]
                break
            if isinstance(candidate, int) and candidate in FUEL_OVERRIDES:
                categoria = FUEL_OVERRIDES[candidate]
                break

        # Normalizar gasolina para distinguir Magna vs Premium
        categoria_norm = str(categoria or "").strip().lower()
        if "gasolina premium" in composite or categoria_norm in {"premium", "gasolina premium"}:
            categoria = "gasolina premium"
        elif "gasolina magna" in composite or categoria_norm in {"magna", "gasolina magna"}:
            categoria = "gasolina magna"
        elif categoria_norm in {"gasoline", "gasolina", "", "no disponible", "no_disponible", "na", "n/a", "serie"}:
            categoria = "gasolina magna"

        row["tipo_de_combustible_original"] = fuel_type or fuel_detail or induction or categoria
        row["categoria_combustible_final"] = categoria

        # Basic dimensions
        row["longitud_mm"] = to_float(veh.get("length_mm"))
        row["anchura_mm"] = to_float(veh.get("width_mm"))
        row["altura_mm"] = to_float(veh.get("height_mm"))
        row["wheelbase_mm"] = to_float(veh.get("wheelbase_mm"))
        row["peso_kg"] = to_float(veh.get("curb_weight_kg"))

        # Warranty mapping
        row["warranty_full_months"] = to_float(veh.get("warranty_basic_months"))
        row["warranty_full_km"] = to_float(veh.get("warranty_basic_km"))
        row["warranty_powertrain_months"] = to_float(veh.get("warranty_powertrain_months"))
        row["warranty_powertrain_km"] = to_float(veh.get("warranty_powertrain_km"))
        row["warranty_roadside_months"] = to_float(veh.get("warranty_roadside_months"))
        row["warranty_corrosion_months"] = to_float(veh.get("warranty_corrosion_months"))
        elec_months = veh.get("warranty_electrical_months") or veh.get("warranty_battery_months")
        row["warranty_electric_months"] = to_float(elec_months)

        # Scores from Strapi direct
        for dst, src in (
            ("infotainment_score", "infotainment_score"),
            ("convenience_score", "convenience_score"),
            ("hvac_score", "hvac_score"),
            ("adas_score", "adas_score"),
            ("safety_score", "safety_score"),
        ):
            if src in veh:
                row[dst] = to_float(veh.get(src))

        # Feature booleans
        bool_pairs = (
            ("tiene_pantalla_tactil", "infotainment_touchscreen"),
            ("android_auto", "infotainment_android_auto"),
            ("android_auto_wireless", "infotainment_android_auto_wireless"),
            ("apple_carplay", "infotainment_carplay"),
            ("carplay_wireless", "infotainment_carplay_wireless"),
            ("wireless_charging", "comfort_wireless_charging"),
            ("hud", "infotainment_hud"),
            ("ambient_lighting", "comfort_ambient_lighting"),
            ("asistente_estac_frontal", "adas_parking_sensors_front"),
            ("asistente_estac_trasero", "adas_parking_sensors_rear"),
            ("sensor_punto_ciego", "adas_blind_spot_warning"),
            ("camara_360", "adas_surround_view"),
            ("alerta_colision", "adas_forward_collision_warning"),
            ("control_frenado_curvas", "adas_emergency_braking"),
            ("control_estabilidad", "safety_esc"),
            ("control_electrico_de_traccion", "safety_traction_control"),
            ("abs", "safety_abs"),
            ("limpiaparabrisas_lluvia", "comfort_rain_sensor"),
            ("apertura_remota_maletero", "comfort_power_tailgate"),
            ("cierre_automatico_maletero", "comfort_auto_door_close"),
            ("memoria_asientos", "comfort_memory_settings"),
        )
        for dst, src in bool_pairs:
            val = to_bool(veh.get(src))
            if val is not None:
                row[dst] = val

        seat_heat = to_bool(veh.get("comfort_front_seat_heating"))
        seat_vent = to_bool(veh.get("comfort_front_seat_ventilation"))
        if seat_heat is not None:
            row["asientos_calefaccion_conductor"] = seat_heat
            row["asientos_calefaccion_pasajero"] = seat_heat
        if seat_vent is not None:
            row["asientos_ventilacion_conductor"] = seat_vent
            row["asientos_ventilacion_pasajero"] = seat_vent
        rear_heat = to_bool(veh.get("comfort_rear_seat_heating"))
        if rear_heat:
            row["asientos_calefaccion_fila2"] = True
        rear_vent = to_bool(veh.get("comfort_rear_seat_ventilation"))
        if rear_vent:
            row["asientos_ventilacion_fila2"] = True

        zones = to_int(veh.get("hvac_zones"))
        if zones is not None:
            row["zonas_clima"] = zones
        if to_bool(veh.get("hvac_rear_controls")):
            row["clima_controles_traseros"] = True
        if to_bool(veh.get("hvac_filter_active_carbon")) or to_bool(veh.get("hvac_filter_pollen")):
            row["clima_filtro"] = True
        if to_bool(veh.get("hvac_ionizer")):
            row["clima_ionizador"] = True
        if veh.get("hvac_type"):
            row["aire_acondicionado"] = True

        speakers = to_int(veh.get("infotainment_audio_speakers"))
        if speakers is not None:
            row["speakers_count"] = speakers
            row["bocinas"] = speakers
        if to_bool(veh.get("infotainment_audio_subwoofer")):
            row["subwoofer"] = True
        if to_bool(veh.get("infotainment_audio_surround")):
            row["audio_surround"] = True
        screen_main = to_float(veh.get("infotainment_screen_main_in"))
        if screen_main is not None:
            row["screen_main_in"] = screen_main
        # USB presence is boolean in Strapi; approximate counts when available
        if to_bool(veh.get("infotainment_usb_front")):
            row["usb_a_count"] = max(row.get("usb_a_count") or 0, 2)
        if to_bool(veh.get("infotainment_usb_rear")):
            row["usb_a_count"] = max(row.get("usb_a_count") or 0, 4)

        if to_bool(veh.get("comfort_parking_assist_auto")):
            row["asistente_estacionamiento_automatico"] = True

        airbags_map = (
            ("bolsas_aire_delanteras_conductor", "airbags_front_driver"),
            ("bolsas_aire_delanteras_pasajero", "airbags_front_passenger"),
            ("bolsas_aire_laterales_adelante", "airbags_side_front"),
            ("bolsas_aire_laterales_atras", "airbags_side_rear"),
            ("bolsas_rodillas_conductor", "airbags_knee_driver"),
            ("bolsas_rodillas_pasajero", "airbags_knee_passenger"),
        )
        for dst, src in airbags_map:
            val = to_bool(veh.get(src))
            if val:
                row[dst] = True
        curtain_vals = [to_bool(veh.get(k)) for k in ("airbags_curtain_row1","airbags_curtain_row2","airbags_curtain_row3")]
        if any(v is True for v in curtain_vals):
            row["bolsas_cortina_todas_filas"] = True

        # Lighting / exterior helpers
        if to_bool(veh.get("lighting_fog_front")) or to_bool(veh.get("lighting_fog_rear")):
            row["luces_antiniebla"] = True
        if to_bool(veh.get("lighting_auto_headlights")):
            row["luces_auto"] = True
        head_desc = veh.get("lighting_headlight_type") or ""
        if head_desc:
            row["tipo_faros"] = head_desc

        # Cruise description for heuristics
        if to_bool(veh.get("adas_adaptive_cruise")):
            row["control_crucero_original"] = "Control crucero adaptativo"
        elif to_bool(veh.get("adas_cruise_control")):
            row["control_crucero_original"] = "Control crucero"

        # Header description seed with make/model/version for text heuristics
        header_parts = [veh.get("make"), veh.get("model"), veh.get("version"), veh.get("trim"), head_desc]
        row["header_description"] = " ".join(str(p) for p in header_parts if p)

        # Include any remaining raw keys from the normalized payload so we leverage
        # the complete Strapi schema (without overwriting mapped fields).
        for raw_key, raw_value in veh.items():
            key = str(raw_key).strip()
            if not key:
                continue
            key_lower = key.lower()
            if key_lower not in row:
                row[key_lower] = raw_value

        rows.append(row)

    if not rows:
        return pd.DataFrame(columns=["make","model","version","ano"])

    df = pd.DataFrame(rows)
    df.columns = [str(c).lower() for c in df.columns]
    if "vehicle_id" in df.columns:
        df = df.drop_duplicates(subset=["vehicle_id"], keep="last")
    return df


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
    if bs is None:
        s = ""
    elif isinstance(bs, float):
        if math.isnan(bs):
            s = ""
        else:
            s = str(bs)
    else:
        s = str(bs)
    s = s.strip().lower()
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
        direct = _num(row.get('adas_score'))
        if direct is not None and direct > 0:
            return round(min(100.0, direct), 1)
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
        direct = _num(row.get('safety_score'))
        if direct is not None and direct > 0:
            return round(min(100.0, direct), 1)
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
        conv = _num(row.get('convenience_score'))
        hv = _num(row.get('hvac_score'))
        if conv is not None and conv > 0:
            if hv is not None and hv > 0:
                val = min(100.0, (conv + hv) / 2.0)
            else:
                val = conv
            return round(min(100.0, val), 1)
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
        direct = _num(row.get('infotainment_score'))
        if direct is not None and direct > 0:
            return round(min(100.0, direct), 1)
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


def load_overlay_extras() -> Optional[pd.DataFrame]:
    if not OVERLAY_JSON_PATH.exists():
        return None
    try:
        payload = json.loads(OVERLAY_JSON_PATH.read_text())
    except Exception as exc:
        print(f"[catalog][WARN] No se pudo leer overlay JSON ({exc})")
        return None
    vehicles = payload.get("vehicles") if isinstance(payload, dict) else payload
    if not isinstance(vehicles, list):
        return None
    rows: list[dict[str, Any]] = []
    for veh in vehicles:
        if not isinstance(veh, dict):
            continue
        vid = veh.get("vehicleId") or veh.get("vehicle_id") or veh.get("uid")
        if not vid:
            continue
        vid_str = str(vid).strip()
        if not vid_str:
            continue
        pricing = veh.get("pricing") if isinstance(veh.get("pricing"), dict) else {}
        row = {
            "vehicle_id": vid_str,
            "precio_transaccion_overlay": to_float(veh.get("precio_transaccion") or pricing.get("precio_transaccion")),
            "msrp_overlay": to_float(veh.get("msrp") or pricing.get("msrp")),
            "bono_overlay": to_float(veh.get("bono")),
            "longitud_mm_overlay": to_float(veh.get("length_mm")),
            "anchura_mm_overlay": to_float(veh.get("width_mm")),
            "altura_mm_overlay": to_float(veh.get("height_mm")),
            "wheelbase_mm_overlay": to_float(veh.get("wheelbase_mm")),
            "peso_kg_overlay": to_float(veh.get("curb_weight_kg")),
            "body_style_overlay": (veh.get("version") or {}).get("bodyStyle") or veh.get("body_style"),
            "segmento_ventas_overlay": veh.get("segmento_ventas"),
            "categoria_combustible_overlay": veh.get("categoria_combustible_final"),
            "equip_score_overlay": to_float(veh.get("equip_score")),
            "equip_p_safety_overlay": to_float(veh.get("equip_p_safety")),
            "equip_p_adas_overlay": to_float(veh.get("equip_p_adas")),
            "equip_p_comfort_overlay": to_float(veh.get("equip_p_comfort")),
        }
        rows.append(row)
    if not rows:
        return None
    return pd.DataFrame(rows)


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
    output_csv = DATA / "equipo_veh_limpio_procesado.csv"
    use_strapi = os.getenv("USE_STRAPI_CATALOG", "1").lower() not in {"0","false"}
    strapi_ids: set[str] = set()
    if use_strapi:
        print(f"[catalog] Loading Strapi normalized catalog: {os.getenv('STRAPI_NORMALIZED_PATH', STRAPI_NORMALIZED_PATH)}")
        base = load_strapi_catalog()
        try:
            strapi_ids = {str(x) for x in base.get("vehicle_id", []) if str(x).strip()}
        except Exception:
            strapi_ids = set()
    else:
        if not output_csv.exists():
            raise SystemExit(f"Base catalog not found: {output_csv}")
        base = pd.read_csv(output_csv, low_memory=False)
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
            num_protect = {"msrp","precio_transaccion","caballos_fuerza","longitud_mm","bono"}
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
    if strapi_ids:
        base = base[base["vehicle_id"].astype(str).isin(strapi_ids)].copy()

    overlay_df = load_overlay_extras()
    if overlay_df is not None and not overlay_df.empty:
        overlay_df["vehicle_id"] = overlay_df["vehicle_id"].astype(str)
        if strapi_ids:
            overlay_df = overlay_df[overlay_df["vehicle_id"].isin(strapi_ids)]
        if not overlay_df.empty:
            base = base.merge(overlay_df, on="vehicle_id", how="left")
            for field in ("precio_transaccion", "msrp", "bono", "longitud_mm", "anchura_mm", "altura_mm", "wheelbase_mm", "peso_kg"):
                col_overlay = f"{field}_overlay"
                if col_overlay in base.columns:
                    base[col_overlay] = pd.to_numeric(base[col_overlay], errors="coerce")
                    if field in base.columns:
                        base[field] = pd.to_numeric(base[field], errors="coerce")
                        mask = base[field].isna()
                        if field in {"precio_transaccion", "bono"}:
                            mask = mask | base[field].eq(0)
                        if field == "precio_transaccion" and "msrp" in base.columns:
                            msrp_series = pd.to_numeric(base["msrp"], errors="coerce")
                            mask = mask | ((base[col_overlay].notna()) & (msrp_series.notna()) & (base[col_overlay] < msrp_series))
                        if mask.any():
                            base.loc[mask, field] = base.loc[mask, col_overlay]
                    else:
                        base[field] = base[col_overlay]
                    base.drop(columns=[col_overlay], inplace=True, errors=True)
            for field in ("body_style", "segmento_ventas", "categoria_combustible_final"):
                col_overlay = f"{field}_overlay"
                if col_overlay in base.columns:
                    if field in base.columns:
                        mask = base[field].isna() | (base[field].astype(str).str.strip()=="")
                        if mask.any():
                            base.loc[mask, field] = base.loc[mask, col_overlay]
                    else:
                        base[field] = base[col_overlay]
                    base.drop(columns=[col_overlay], inplace=True, errors=True)
            for field in ("equip_score", "equip_p_safety", "equip_p_adas", "equip_p_comfort"):
                col_overlay = f"{field}_overlay"
                if col_overlay in base.columns:
                    val_overlay = pd.to_numeric(base[col_overlay], errors="coerce")
                    if field in base.columns:
                        existing = pd.to_numeric(base[field], errors="coerce")
                        mask = existing.isna()
                        if mask.any():
                            base.loc[mask, field] = val_overlay[mask]
                    else:
                        base[field] = val_overlay
                    base.drop(columns=[col_overlay], inplace=True, errors=True)

    base = compute_scores(base)
    base = fuel_costs(base)

    # Cobertura de pilares: porcentaje de versiones con score > 0
    pillar_cols = [
        "equip_p_adas",
        "equip_p_safety",
        "equip_p_comfort",
        "equip_p_infotainment",
        "equip_p_traction",
        "equip_p_utility",
    ]
    coverage_summary: list[str] = []
    low_coverage: list[str] = []
    for col in pillar_cols:
        if col in base.columns:
            series = pd.to_numeric(base[col], errors="coerce").fillna(0)
            pct = float((series > 0).sum()) / float(len(series)) * 100.0 if len(series) else 0.0
            coverage_summary.append(f"{col}: {pct:.1f}%")
            if pct < 60.0:
                low_coverage.append(f"{col} ({pct:.1f}%)")
    if coverage_summary:
        print("[catalog] Cobertura pilares:", ", ".join(coverage_summary))
    if low_coverage:
        print("[catalog][WARN] Cobertura baja en:", ", ".join(low_coverage))

    # Persist processed catalog for backend consumption
    base.to_csv(output_csv, index=False)
    print(f"[catalog] Actualizado {output_csv}")

    # Metadata
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
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
