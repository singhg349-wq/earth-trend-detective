"""Shared loader for 1-degree int16-quantized seasonal grid tiles (GRID_FORMAT.md)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np


def load_grid_index(grid_root: Path) -> Dict[str, Any]:
    """Load data/artifacts/grid/index.json and merge index_t2m.json / index_aod.json if needed."""
    index = json.loads((grid_root / "index.json").read_text(encoding="utf-8"))
    variables = index.setdefault("variables", {})
    for frag_name in ("index_t2m.json", "index_aod.json"):
        frag_path = grid_root / frag_name
        if frag_path.is_file():
            frag = json.loads(frag_path.read_text(encoding="utf-8"))
            for slug, meta in frag.get("variables", {}).items():
                variables.setdefault(slug, meta)
    return index


def load_seasonal_grid(
    grid_root: Path, slug: str, season: str
) -> Tuple[List[int], np.ndarray, Dict[str, Any]]:
    """Decode all 1-degree tiles for (slug, season) into (years, array[T, 180, 360], var_meta).

    Row 0 = +89.5 deg N, Row 179 = -89.5 deg S.
    Col 0 = -179.5 deg W, Col 359 = +179.5 deg E.
    Missing values are np.nan.
    """
    index = load_grid_index(grid_root)
    fill = int(index.get("fill_int16", -32768))
    var_meta = index["variables"][slug]
    scale = float(var_meta["scale"])
    offset = float(var_meta.get("offset", 0.0))
    years = [int(y) for y in var_meta["years_by_season"][season]]
    n_years = len(years)

    arr = np.full((n_years, 180, 360), np.nan, dtype=np.float32)
    season_dir = grid_root / slug / season
    tile_files = sorted(season_dir.glob("*.json"))
    if not tile_files:
        raise FileNotFoundError(f"No grid tiles found in {season_dir}")

    for tile_path in tile_files:
        tile = json.loads(tile_path.read_text(encoding="utf-8"))
        for cell_id, cell in tile.get("cells", {}).items():
            # Format: cell_<lat>_<lon> where lat is -89.5..89.5 and lon is -179.5..179.5
            _, lat_str, lon_str = cell_id.split("_")
            lat_c = float(lat_str)
            lon_c = float(lon_str)
            row = int(round(89.5 - lat_c))
            col = int(round(lon_c + 179.5))
            if not (0 <= row < 180 and 0 <= col < 360):
                continue
            qvals = np.asarray(cell["v"], dtype=np.int32)
            valid = qvals != fill
            decoded = np.full(n_years, np.nan, dtype=np.float32)
            decoded[valid] = qvals[valid].astype(np.float32) * scale + offset
            arr[:, row, col] = decoded

    return years, arr, var_meta
