#!/usr/bin/env python3
"""Build 1-degree GLDAS v2.1 soil moisture tiles, index, and 10 regional DJF series."""

from __future__ import annotations

import calendar
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.trend.regions import BOXES, REGIONS, build_regions  # noqa: E402
from backend.trend.seasons import aggregate_djf  # noqa: E402
from backend.trend.stats import sen_slope_per_decade, trend_block  # noqa: E402
from backend.trend.var_sm import (  # noqa: E402
    COVERAGE_DECIMALS,
    COVERAGE_OFFSET,
    COVERAGE_SCALE,
    DECIMALS,
    DISPLAY_UNITS,
    FILL_INT16,
    LAND_ONLY,
    OFFSET,
    REGRID_NOTE,
    SCALE,
    SEASONS,
    SLOPE_DECIMALS,
    SLOPE_OFFSET,
    SLOPE_SCALE,
    SLOPE_UNITS,
    SOURCE,
    SPLICE_NOTE,
    VAR_SLUG,
    VARIABLE_NAME,
    YEARS,
    encode_int16,
    load_monthly,
)

ARTIFACTS_DIR = ROOT / "data" / "artifacts"


def seasonal_values(
    monthly: Dict[Tuple[int, int], np.ndarray],
    lat: np.ndarray,
    season: str,
    years: List[int],
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute day-weighted seasonal means and coverage on (150, 360) grid."""
    months = SEASONS[season][0]
    land_mask = np.isfinite(monthly[(2000, 1)])
    vals_list: List[np.ndarray] = []
    cov_list: List[np.ndarray] = []

    for year in years:
        keys = [(year - 1, 12), (year, 1), (year, 2)] if season == "DJF" else [(year, m) for m in months]
        arrays = [monthly.get(k) for k in keys]
        if any(a is None for a in arrays):
            vals_list.append(np.full((len(lat), 360), np.nan, dtype=np.float32))
            cov_list.append(np.zeros((len(lat), 360), dtype=np.float32))
            continue

        stack = np.stack([a for a in arrays if a is not None], axis=0)
        days = np.asarray([calendar.monthrange(y, m)[1] for y, m in keys], dtype=np.float32)[:, None, None]
        valid = np.isfinite(stack)
        den = np.sum(valid * days, axis=0)
        complete = valid.all(axis=0)
        val = np.divide(
            np.nansum(stack * days, axis=0),
            den,
            out=np.full((len(lat), 360), np.nan, dtype=np.float32),
            where=complete,
        )
        val[~land_mask] = np.nan
        vals_list.append(val.astype(np.float32))
        cov_list.append((den / days.sum()).astype(np.float32))

    return np.stack(vals_list, axis=0), np.stack(cov_list, axis=0), land_mask


def _cell_sen(years: List[int], values: List[float | None]) -> float | None:
    pairs = [(y, v) for y, v in zip(years, values) if v is not None and np.isfinite(v)]
    if len(pairs) < 10:
        return None
    ys = [p[0] for p in pairs]
    xs = [p[1] for p in pairs]
    return float(sen_slope_per_decade(ys, xs))


def write_tiles(
    season: str,
    years: List[int],
    vals: np.ndarray,
    coverage: np.ndarray,
    land_mask: np.ndarray,
    lat: np.ndarray,
    lon: np.ndarray,
) -> List[str]:
    """Write 10x10 degree JSON tiles for one season under grid/sm/<season>/."""
    out_dir = ARTIFACTS_DIR / "grid" / VAR_SLUG / season
    out_dir.mkdir(parents=True, exist_ok=True)
    lat_to_row = {round(float(v), 1): i for i, v in enumerate(lat)}
    lon_to_col = {round(float(v), 1): j for j, v in enumerate(lon)}
    available: List[str] = []

    for tile_lat in range(-90, 90, 10):
        for tile_lon in range(-180, 180, 10):
            cells: Dict[str, Any] = {}
            for lat_sw in range(tile_lat, tile_lat + 10):
                lat_c = round(lat_sw + 0.5, 1)
                row = lat_to_row.get(lat_c)
                if row is None:
                    continue
                for lon_sw in range(tile_lon, tile_lon + 10):
                    lon_c = round(lon_sw + 0.5, 1)
                    col = lon_to_col.get(lon_c)
                    if col is None or not land_mask[row, col]:
                        continue
                    series = vals[:, row, col]
                    if not np.isfinite(series).any():
                        continue
                    qv = [encode_int16(float(v) if np.isfinite(v) else None, SCALE) for v in series]
                    decoded = [None if q == FILL_INT16 else round(q * SCALE, DECIMALS) for q in qv]
                    qs = encode_int16(_cell_sen(years, decoded), SLOPE_SCALE)
                    cs = [
                        int(np.clip(np.rint(float(c) * 1000.0), 0, 1000)) if q != FILL_INT16 else 0
                        for c, q in zip(coverage[:, row, col], qv)
                    ]
                    compact: Any = (
                        1000
                        if all((q == FILL_INT16 and c == 0) or (q != FILL_INT16 and c == 1000) for q, c in zip(qv, cs))
                        else cs
                    )
                    cells[f"cell_{lat_c:.1f}_{lon_c:.1f}"] = {"s": qs, "v": qv, "c": compact}
            if cells:
                key = f"{tile_lon}_{tile_lat}"
                available.append(key)
                payload = {"v_slug": VAR_SLUG, "season": season, "tile": [tile_lon, tile_lat], "cells": dict(sorted(cells.items()))}
                target = out_dir / f"{key}.json"
                target.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
                if target.stat().st_size >= 300_000:
                    raise ValueError(f"Tile exceeds 300 KB: {target}")
    return sorted(available)


def area_mean(grid: np.ndarray, area_weights: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    x = np.asarray(grid, dtype=float)
    w = np.broadcast_to(area_weights, x.shape)
    valid = np.isfinite(x) & (w > 0)
    total_w = float(np.sum(area_weights))
    den = np.sum(np.where(valid, w, 0.0), axis=(-2, -1))
    num = np.sum(np.where(valid, x * w, 0.0), axis=(-2, -1))
    mean = np.divide(num, den, out=np.full(den.shape, np.nan), where=den > 0)
    cov = den / total_w if total_w > 0 else np.zeros_like(den)
    return mean, cov


def build_grid_and_regional() -> None:
    print("Loading GLDAS v2.1 monthly soil moisture (2000-01..2026-07)...", flush=True)
    monthly, lat, lon = load_monthly()

    # 1. Grid tiles + index_sm.json + merge into grid/index.json
    var_meta: Dict[str, Any] = {
        "variable": VARIABLE_NAME,
        "units": DISPLAY_UNITS,
        "slope_units": SLOPE_UNITS,
        "scale": SCALE,
        "offset": OFFSET,
        "decimals": DECIMALS,
        "slope_scale": SLOPE_SCALE,
        "slope_offset": SLOPE_OFFSET,
        "slope_decimals": SLOPE_DECIMALS,
        "coverage_scale": COVERAGE_SCALE,
        "coverage_offset": COVERAGE_OFFSET,
        "coverage_decimals": COVERAGE_DECIMALS,
        "land_only": LAND_ONLY,
        "regrid_note": REGRID_NOTE,
        "source": SOURCE,
        "years_by_season": {},
        "available_tiles": {},
    }
    seasons_meta: Dict[str, Any] = {}
    for season, (months, label) in SEASONS.items():
        years = YEARS[season]
        vals, cov, land_mask = seasonal_values(monthly, lat, season, years)
        seasons_meta[season] = {
            "code": season,
            "year_label": label,
            "months": months,
            "aggregation": "day-weighted mean of monthly values",
        }
        var_meta["years_by_season"][season] = years
        tiles = write_tiles(season, years, vals, cov, land_mask, lat, lon)
        var_meta["available_tiles"][season] = tiles
        print(f"  [sm grid] {season}: {len(years)} years, {len(tiles)} land tiles", flush=True)

    sm_bytes = sum(p.stat().st_size for p in (ARTIFACTS_DIR / "grid" / VAR_SLUG).rglob("*.json"))
    var_meta["total_size_bytes"] = sm_bytes

    frag = {
        "format_version": 1,
        "grid_resolution_deg": 1.0,
        "tile_size_deg": 10,
        "fill_int16": FILL_INT16,
        "seasons": seasons_meta,
        "variables": {VAR_SLUG: var_meta},
    }
    (ARTIFACTS_DIR / "grid" / "index_sm.json").write_text(json.dumps(frag, separators=(",", ":")), encoding="utf-8")

    grid_idx_path = ARTIFACTS_DIR / "grid" / "index.json"
    grid_idx = json.loads(grid_idx_path.read_text(encoding="utf-8"))
    grid_idx.setdefault("variables", {})[VAR_SLUG] = var_meta
    grid_idx_path.write_text(json.dumps(grid_idx, separators=(",", ":")), encoding="utf-8")
    print(f"  [sm grid] total size: {sm_bytes / (1024 * 1024):.2f} MB", flush=True)

    # 2. Regional DJF artifacts + merge into data/artifacts/index.json
    regions = build_regions(lat, lon, region_ids=tuple(r["id"] for r in REGIONS))
    djf_years = YEARS["DJF"]
    djf_seasons = aggregate_djf(monthly, djf_years)["day_weighted"]

    new_entries: List[Dict[str, Any]] = []
    for spec in REGIONS:
        rid = spec["id"]
        reg = regions[rid]
        # Mask ocean cells if needed (area_weights over land only where values are finite)
        series_vals, series_cov = area_mean(djf_seasons, reg["area_weights"])
        aid = f"sm_{rid}_DJF"
        tblock = trend_block(djf_years, series_vals.tolist())
        mean_val = float(np.nanmean(series_vals))

        payload = {
            "id": aid,
            "variable": VARIABLE_NAME,
            "units": DISPLAY_UNITS,
            "source": SOURCE,
            "region": {
                "id": rid,
                "label": spec["label"],
                "geometry": spec.get("polygon_source", "BBOX"),
                "bbox": list(spec["bbox"]),
                "cells_used": reg["cells_used"],
                "area_km2": round(reg["area_km2"], 2),
            },
            "season": {
                "code": "DJF",
                "year_label": "January year",
                "months": [12, 1, 2],
                "aggregation": "day-weighted mean of 3 monthly values",
            },
            "years": djf_years,
            "values": [round(float(v), 4) if np.isfinite(v) else None for v in series_vals],
            "coverage": [round(float(c), 4) for c in series_cov],
            "anomaly_baseline": None,
            "geometry_file": "data/artifacts/regions.geojson",
            "template_summary": (
                f"{spec['label']} DJF topsoil moisture (0–10 cm) for {djf_years[0]}–{djf_years[-1]} "
                f"has a mean of {mean_val:.2f} {DISPLAY_UNITS} across {len(djf_years)} seasons. "
                f"{SPLICE_NOTE}"
            ),
            "trend": tblock,
            "validation": {
                "reference": "Giovanni GLDAS_NOAH10_M 2.1 box request",
                "status": "pending",
                "notes": f"Not yet independently compared against NASA Giovanni. {SPLICE_NOTE}",
            },
            "generated": datetime.now(timezone.utc).isoformat(),
            "code_version": "r4-gldas-2.1",
        }
        fname = f"{aid}.json"
        (ARTIFACTS_DIR / fname).write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        new_entries.append(
            {
                "id": aid,
                "label": spec["label"],
                "variable": VARIABLE_NAME,
                "units": DISPLAY_UNITS,
                "season": "DJF",
                "region_id": rid,
                "validation_status": "pending",
                "file": fname,
            }
        )

    idx_path = ARTIFACTS_DIR / "index.json"
    idx_data = json.loads(idx_path.read_text(encoding="utf-8"))
    by_id = {e["id"]: e for e in idx_data.get("artifacts", [])}
    for e in new_entries:
        by_id[e["id"]] = e
    idx_data["artifacts"] = sorted(by_id.values(), key=lambda x: (x["region_id"], x["variable"], x["season"]))
    idx_path.write_text(json.dumps(idx_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"  [sm regional] wrote 10 regional series; index.json now has {len(idx_data['artifacts'])} entries.", flush=True)


if __name__ == "__main__":
    build_grid_and_regional()
