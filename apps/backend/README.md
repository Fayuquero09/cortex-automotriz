Este es un puntero lógico al backend FastAPI que vive en `../../backend/`.

Inicio de desarrollo:

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port ${BACKEND_PORT:-8000}
```

Se recomienda iniciar todo el entorno con:

```bash
make dev
```
