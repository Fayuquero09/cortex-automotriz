from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


def repo_root() -> Path:
    """Return the repository root inferred from this file location."""
    # This file lives under <repo>/core/industry_io.py
    return Path(__file__).resolve().parents[1]


def get_industry_dir() -> Path:
    """Resolve the directory where industry exports (ventas, market share) live.

    Resolution order:
    - If env var KPI_INDUSTRIA_DIR is set, use it.
    - Otherwise, use the local symlink at data/external/industry/current.

    Returns a Path (may be a symlink). Raises FileNotFoundError if path not found.
    """
    env = os.getenv("KPI_INDUSTRIA_DIR")
    if env:
        p = Path(env).expanduser()
    else:
        p = repo_root() / "data" / "external" / "industry" / "current"

    if not p.exists():
        raise FileNotFoundError(
            f"Industry data directory not found: {p}. "
            "Set KPI_INDUSTRIA_DIR or create the symlink at data/external/industry/current"
        )
    return p


def latest_file(glob_pattern: str, within: Optional[Path] = None) -> Optional[Path]:
    """Return the most recently modified file matching a glob pattern within a directory.

    Example: latest_file('ventas_*.csv')
    """
    base = within or get_industry_dir()
    candidates = list(base.glob(glob_pattern))
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def load_latest_csv(glob_pattern: str = "*.csv", within: Optional[Path] = None, **read_csv_kwargs):
    """Load the latest CSV matching pattern from industry dir using pandas.

    Returns a pandas.DataFrame or None if no file matches.
    """
    try:
        import pandas as pd  # type: ignore
    except Exception as e:  # pragma: no cover
        raise RuntimeError("pandas is required to load CSV files") from e

    path = latest_file(glob_pattern, within=within)
    if path is None:
        return None
    return pd.read_csv(path, **read_csv_kwargs)

