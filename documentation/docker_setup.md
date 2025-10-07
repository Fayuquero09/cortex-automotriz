# Docker Desktop – Cortex Automotriz

## Prerrequisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y en ejecución.
- Archivo `.env` en la raíz del repositorio con las variables que usa el backend (por ejemplo credenciales de Supabase, tokens, etc.). El `docker-compose.yml` lo carga automáticamente.
- Primer uso del frontend: deja que el contenedor ejecute `npm install` en el directorio `cortex_frontend` (los módulos quedarán cacheados en tu máquina).

## Arranque rápido
1. Desde la raíz del repositorio ejecuta:
   ```bash
   docker compose up --build
   ```
   Esto construye la imagen del backend (`docker/Dockerfile.backend`) e inicia dos servicios:
   - `backend`: FastAPI + Uvicorn en `http://localhost:8000`.
   - `frontend`: Next.js en modo dev en `http://localhost:3000`.

2. Abre Docker Desktop → pestaña *Containers*. Verás el stack `cortex-automotriz` con ambos servicios. Puedes iniciar/detener cada uno desde la UI.

3. Cada servicio monta tu código local:
   - Cualquier cambio en `backend/`, `scripts/`, `data/`, etc. se refleja en el contenedor del backend gracias al `--reload` de Uvicorn.
   - Cualquier cambio en `cortex_frontend/` se refleja en el contenedor del frontend (Next.js hot reload). La primera ejecución instala dependencias dentro de `cortex_frontend/node_modules`.

## Comandos útiles
- Detener y limpiar contenedores:
  ```bash
  docker compose down
  ```
- Reconstruir solo después de cambios en dependencias:
  ```bash
  docker compose build backend
  docker compose build frontend
  ```

## Notas
- Si necesitas exponer otros puertos o variables, edita `docker-compose.yml`.
- Los datos de `data/` se montan directamente; asegúrate de tener los CSV/JSON necesarios antes de iniciar.
- Para entorno productivo cambia los comandos (`uvicorn` sin `--reload`, `npm run build && npm run start`) o crea un override file.
