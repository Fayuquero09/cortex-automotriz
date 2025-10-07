"""Uvicorn entrypoint.

Lightweight re-export of the FastAPI app defined in `backend.app`.
Run with: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`.
"""

from .app import app  # noqa: F401
