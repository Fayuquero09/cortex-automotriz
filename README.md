## Cortex Automotriz Monorepo

Estructura profesional para organizar backend, frontend, core, migraciones e instrumentos de desarrollo.

### Estructura

- `apps/`
  - `backend/` → FastAPI
  - `web/` → Next.js 14 (antes `cortex_frontend/`)
- `packages/`
  - `core/` → utilidades compartidas (antes `core/`)
  - `misc_src/` → código auxiliar (antes `src/` si existía)
- `infra/`
  - `supabase/` → migraciones y docs (antes `supabase/`)
- `tools/`
  - `scripts/` → scripts de desarrollo/ETL (antes `scripts/`)
- `archive/`
  - `frontend_legacy/` → servidor/proxy legacy (antes `frontend/`)
- `resources/`
  - `datasets/` → `csv/` y `data/`
  - `docs/` → documentación de proyecto
  - `assets/` → imágenes/logos
  - `logs/` → logs locales
  - `reports/` → PDFs y reportes generados

### Requisitos

- Python 3.10+
- Node 18/20
- Supabase CLI (opcional)

### Variables de entorno

Crea un archivo `.env` en la raíz basado en `.env.example`:

- `BACKEND_PORT` (por defecto 8000)
- `FRONT_PORT` (por defecto 3010)
- `NEXT_PUBLIC_BACKEND_URL`
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_DB_URL`
- `SUPERADMIN_API_TOKEN`
- `KPI_INDUSTRIA_DIR` (o symlink `resources/datasets/data/external/industry/current`)

### Desarrollo local

```bash
make dev          # inicia backend (uvicorn) y frontend (Next.js)
make stop         # detiene ambos

npm run dev       # equivalente a make dev
npm run stop      # equivalente a make stop
```

El frontend abrirá `http://localhost:${FRONT_PORT:-3010}/ui`.

### Migraciones Supabase

Archivos en `infra/supabase/`. Consulta `infra/supabase/README.md`.

### Notas

- La organización minimiza carpetas en la raíz y agrupa por tipo de componente.
- No se eliminaron proyectos; se reubicaron de forma coherente.
