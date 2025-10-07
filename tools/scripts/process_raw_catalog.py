#!/usr/bin/env python3
from __future__ import annotations

import sys
import os
from pathlib import Path
import unicodedata
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def slug(name: str) -> str:
    s = str(name or "").strip().lower()
    try:
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")  # strip accents
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


def main():
    raw_env = os.getenv("RAW_CSV")
    raw = Path(raw_env) if raw_env else (DATA / "equipo_veh_limpio.csv")
    out = DATA / "equipo_veh_limpio_procesado.csv"
    if not raw.exists():
        print(f"ERROR: No existe el archivo base: {raw}")
        sys.exit(1)

    print(f"Leyendo: {raw}")
    df = pd.read_csv(raw, low_memory=False)
    # rename columns to slugs
    mapping = {c: slug(c) for c in df.columns}
    df.rename(columns=mapping, inplace=True)
    # common aliases
    if "año" in df.columns and "ano" not in df.columns:
        df.rename(columns={"año": "ano"}, inplace=True)
    if "caballos_de_fuerza" in df.columns and "caballos_fuerza" not in df.columns:
        df.rename(columns={"caballos_de_fuerza": "caballos_fuerza"}, inplace=True)

    # ensure essential columns exist
    essentials = ["make", "model", "version", "ano"]
    missing = [c for c in essentials if c not in df.columns]
    if missing:
        print(f"ADVERTENCIA: Faltan columnas esenciales {missing}. Continuando con lo disponible.")

    # types
    for c in ("make", "model", "version"):
        if c in df.columns:
            df[c] = df[c].astype(str)
    if "ano" in df.columns:
        df["ano"] = pd.to_numeric(df["ano"], errors="coerce").astype('Int64')
    for c in ("msrp", "precio_transaccion", "caballos_fuerza", "longitud_mm"):
        if c in df.columns:
            df[c] = pd.to_numeric(df[c], errors="coerce")

    # backup existing
    if out.exists():
        out.replace(out.with_suffix(out.suffix + ".bak"))
    df.to_csv(out, index=False)
    print(f"Escribí: {out} ({len(df):,} filas)")
    print("Listo. Puedes ejecutar tools/scripts/enrich_catalog.py para generar resources/datasets/data/enriched/current.csv")


if __name__ == "__main__":
    main()

