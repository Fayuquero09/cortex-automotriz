#!/usr/bin/env bash
# Limpia artefactos y cachés que pueden causar errores (pycache, .pyc, .DS_Store, pytest cache)
# Uso: ./scripts/clean_repo.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[clean] Repo: $ROOT_DIR"

# 1) Borrar caches de Python y pytest
echo "[clean] Eliminando __pycache__, *.pyc, *.pyo, .pytest_cache…"
find . -type d -name "__pycache__" -prune -exec rm -rf {} + || true
find . -type d -name ".pytest_cache" -prune -exec rm -rf {} + || true
find . -type f \( -name "*.pyc" -o -name "*.pyo" \) -delete || true

# 2) Borrar basura de macOS
echo "[clean] Eliminando .DS_Store…"
find . -type f -name ".DS_Store" -delete || true

# 3) Remover directorios vacíos residuales (como core/ si quedó vacío)
echo "[clean] Eliminando directorios vacíos residuales…"
find ./core -type d -empty -delete 2>/dev/null || true
find ./src -type d -empty -delete 2>/dev/null || true

# 4) Eliminar carpeta src/ si solo contenía cachés/basura
if [ -d "src" ]; then
  # si solo quedan .DS_Store u ocultos tras limpieza, bórrala
  REMNANTS=$(find src -type f ! -name ".DS_Store" | wc -l | tr -d ' ')
  if [ "${REMNANTS:-0}" = "0" ]; then
    echo "[clean] Eliminando src/ (no contiene código útil)…"
    rm -rf src || true
  fi
fi

echo "[clean] Hecho."

