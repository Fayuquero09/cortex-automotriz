#!/usr/bin/env python3
from __future__ import annotations

import csv
from pathlib import Path
from typing import Dict, Any, List

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT_DIR = ROOT / "data" / "enriched"

def norm(s: str) -> str:
    return " ".join((s or "").strip().split())

def to_int(x: Any) -> int:
    try:
        s = str(x).replace(",", "").strip()
        if not s or s.lower() in {"na","n/a","null","none","-"}:
            return 0
        return int(float(s))
    except Exception:
        return 0

def process_year(year: int) -> Path:
    src = DATA / f"raiavl_venta_mensual_tr_cifra_{year}.csv"
    if not src.exists():
        raise SystemExit(f"No se encontró: {src}")
    # Columns typical: ANIO, ID_MES, MARCA, MODELO, UNI_VEH (unidades)
    with src.open("r", encoding="utf-8-sig", newline="") as f:
        r = csv.DictReader(f)
        cols = [c.strip() for c in (r.fieldnames or [])]
        def find(name_set: set[str]) -> str | None:
            return next((c for c in cols if c.strip().lower() in name_set), None)
        col_year = find({"anio","año","year"})
        col_month = find({"id_mes","mes","month"})
        col_make = find({"marca","make","brand"})
        col_model = find({"modelo","model"})
        col_units = find({"uni_veh","unidades","units"})
        if not all([col_year, col_month, col_make, col_model, col_units]):
            raise SystemExit("CSV no tiene encabezados esperados (ANIO, ID_MES, MARCA, MODELO, UNI_VEH)")
        agg: Dict[tuple, Dict[int,int]] = {}
        for row in r:
            try:
                y = int(float(str(row.get(col_year, year)).strip()))
            except Exception:
                y = year
            if y != year:
                continue
            try:
                m = int(float(str(row.get(col_month, 0)).strip()))
            except Exception:
                m = 0
            if not (1 <= m <= 12):
                continue
            mk = norm(row.get(col_make, ""))
            md = norm(row.get(col_model, ""))
            if not mk or not md:
                continue
            u = to_int(row.get(col_units, 0))
            key = (mk, md)
            months = agg.setdefault(key, {i:0 for i in range(1,13)})
            months[m] = months.get(m,0) + u
    # Write wide format
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"sales_ytd_{year}.csv"
    with out.open("w", encoding="utf-8", newline="") as f:
        fieldnames = ["make","model","ano", f"ventas_ytd_{year}"] + [f"ventas_{year}_{i:02d}" for i in range(1,13)]
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for (mk, md), months in sorted(agg.items()):
            ytd = sum(months.get(i,0) for i in range(1,13))
            row = {"make": mk, "model": md, "ano": year, f"ventas_ytd_{year}": ytd}
            for i in range(1,13):
                row[f"ventas_{year}_{i:02d}"] = months.get(i,0)
            w.writerow(row)
    print(f"Escrito: {out} ({len(agg)} modelos)")
    return out

def main():
    for y in (2023, 2024, 2025):
        try:
            process_year(y)
        except SystemExit as e:
            print(str(e))

if __name__ == '__main__':
    main()

