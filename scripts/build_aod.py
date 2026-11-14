"""Build 1-degree MERRA-2 AOD seasonal tiles, trend maps and regional artifacts."""
import calendar
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.ndimage import zoom

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.trend.var_aod import (
    load_monthly_regridded,
    SEASONS,
    YEARS,
    SCALE,
    SLOPE_SCALE,
    FILL_INT16,
    VAR_SLUG,
    VARIABLE_NAME,
    DISPLAY_UNITS,
    SLOPE_UNITS,
    OFFSET,
    DECIMALS,
    SLOPE_OFFSET,
    SLOPE_DECIMALS,
    COVERAGE_SCALE,
    COVERAGE_OFFSET,
    COVERAGE_DECIMALS,
    LAND_ONLY,
    REGRID_NOTE,
    SOURCE_INFO,
    encode_int16,
)
from backend.trend.stats import inference_block, sen_slope, trend_block
from backend.trend.regions import REGIONS, BOXES, build_regions, box_mask
from backend.trend.seasons import aggregate_djf
from backend.trend.series import build_series


def seasonal_values(monthly, season, years):
    """Compute seasonal values and coverage for given years.

    Returns:
        vals: (n_years, 180, 360) float32 array
        coverage: (n_years, 180, 360) float32 array
    """
    months = SEASONS[season][0]
    values, cover = [], []
    for year in years:
        if season == "DJF":
            keys = [(year - 1, 12), (year, 1), (year, 2)]
        else:
            keys = [(year, m) for m in months]

        arrays = [monthly.get(key) for key in keys]
        if any(a is None for a in arrays):
            values.append(np.full((180, 360), np.nan, np.float32))
            cover.append(np.zeros((180, 360), np.float32))
            continue

        stack = np.stack(arrays)
        days = np.asarray([calendar.monthrange(y, m)[1] for y, m in keys], dtype=np.float32)[:, None, None]
        valid = np.isfinite(stack)
        den = np.sum(valid * days, axis=0)
        complete = valid.all(axis=0)
        val = np.divide(np.nansum(stack * days, axis=0), den, out=np.full((180, 360), np.nan), where=complete)
        values.append(val.astype(np.float32))
        cover.append((den / days.sum()).astype(np.float32))
    return np.stack(values), np.stack(cover)


def cell_sen(years, vals):
    """Compute Sen slope per decade for a single cell's time series."""
    good = np.isfinite(vals)
    if int(good.sum()) < 10:
        return None
    y, x = np.asarray(years)[good], np.asarray(vals)[good]
    slope, _ = sen_slope(y.tolist(), x.tolist())
    return float(slope * 10)  # Convert to per decade


def write_tiles(season, years, vals, coverage, out_root):
    """Write 10x10 degree tiles for a season."""
    out = out_root / "grid" / VAR_SLUG / season
    out.mkdir(parents=True, exist_ok=True)
    available = []

    for tile_lat in range(-90, 90, 10):
        for tile_lon in range(-180, 180, 10):
            cells = {}
            for lat_sw in range(tile_lat, tile_lat + 10):
                row = 89 - lat_sw
                for lon_sw in range(tile_lon, tile_lon + 10):
                    col = lon_sw + 180
                    series = vals[:, row, col]
                    if not np.isfinite(series).any():
                        continue
                    qv = [encode_int16(v, SCALE) for v in series]
                    decoded = [None if q == FILL_INT16 else round(q * SCALE, DECIMALS) for q in qv]
                    slope = cell_sen(years, decoded)
                    qs = encode_int16(slope, SLOPE_SCALE)
                    cs = [int(np.clip(np.rint(c * 1000), 0, 1000)) if q != FILL_INT16 else 0 for c, q in zip(coverage[:, row, col], qv)]
                    compact = 1000 if all((q == FILL_INT16 and c == 0) or (q != FILL_INT16 and c == 1000) for q, c in zip(qv, cs)) else cs
                    cell_id = f"cell_{lat_sw + 0.5:.1f}_{lon_sw + 0.5:.1f}"
                    cells[cell_id] = {"s": qs, "v": qv, "c": compact}
            if cells:
                key = f"{tile_lon}_{tile_lat}"
                available.append(key)
                payload = {"v_slug": VAR_SLUG, "season": season, "tile": [tile_lon, tile_lat], "cells": dict(sorted(cells.items()))}
                target = out / f"{key}.json"
                target.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=False), encoding="utf-8")
                if target.stat().st_size >= 300_000:
                    raise ValueError(f"Tile over 300 KB: {target.name}")
    return sorted(available)


def build_regional_artifacts(monthly, out_root):
    """Build featured regional artifacts for DJF season using 1-degree grid data."""
    from backend.trend.var_aod import read_month
    import calendar

    # Get native grid lat/lon for region building
    _, lat, lon, _ = read_month(1980, 1)
    regions = build_regions(lat, lon, region_ids=tuple(r["id"] for r in REGIONS))

    # Regrid area weights to 1-degree grid for regional means
    # Target 1-degree grid: 180 x 360, lat descending (89.5 to -89.5), lon ascending (-179.5 to 179.5)
    target_lat = np.linspace(89.5, -89.5, 180)
    target_lon = np.linspace(-179.5, 179.5, 360)

    # Build area weights on 1-degree grid for each region
    region_weights_1deg = {}
    for rid, reg in regions.items():
        # Regrid the area_weights from native (361, 576) to 1-degree (180, 360)
        # Using simple bilinear interpolation for weights
        from scipy.ndimage import zoom
        weights = reg["area_weights"]  # (361, 576)
        # Zoom factors: 180/361 ~ 0.5, 360/576 ~ 0.625
        zoom_factors = (180 / 361, 360 / 576)
        weights_1deg = zoom(weights, zoom_factors, order=1)
        region_weights_1deg[rid] = weights_1deg

    # Also regrid box masks
    box_weights_1deg = {}
    for rid in regions:
        bf, bw = box_mask(lat, lon, BOXES[rid])
        box_mask_native = bf * bw
        box_weights_1deg[rid] = zoom(box_mask_native, zoom_factors, order=1)

    # Build DJF seasons on 1-degree grid
    djf_years = YEARS["DJF"]
    djf_seasons = {"years": [], "day_weighted": [], "equal": []}
    for year in djf_years:
        keys = [(year - 1, 12), (year, 1), (year, 2)]
        if not all(k in monthly for k in keys):
            continue
        maps = [monthly[k] for k in keys]
        stack = np.stack(maps)
        djf_seasons["years"].append(year)
        djf_seasons["equal"].append(np.nanmean(stack, axis=0))
        days = np.array([calendar.monthrange(y, m)[1] for y, m in keys], dtype=float)[:, None, None]
        valid = np.isfinite(stack)
        djf_seasons["day_weighted"].append(np.nansum(stack * days, axis=0) / np.sum(valid * days, axis=0))

    djf_seasons["equal"] = np.stack(djf_seasons["equal"]) if djf_seasons["equal"] else np.empty((0,))
    djf_seasons["day_weighted"] = np.stack(djf_seasons["day_weighted"]) if djf_seasons["day_weighted"] else np.empty((0,))

    # Compute regional means on 1-degree grid
    for rid, reg in regions.items():
        reg["day_weighted"], reg["coverage"] = area_mean(djf_seasons["day_weighted"], region_weights_1deg[rid])
        reg["box_day_weighted"], _ = area_mean(djf_seasons["day_weighted"], box_weights_1deg[rid])

    # Write regions.geojson
    from shapely.geometry import mapping
    features = [{"type": "Feature", "properties": {"id": rid}, "geometry": mapping(reg["geometry"].simplify(0.05, preserve_topology=True))} for rid, reg in regions.items()]
    (out_root / "regions.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")

    # Build artifacts
    specs = {r["id"]: (f"aod_{r['id']}_DJF", r["label"], list(r["bbox"])) for r in REGIONS}
    artifact_index = []

    for rid, (aid, label, bbox) in specs.items():
        reg = regions[rid]
        vals = reg["day_weighted"]

        # Build inference block
        inf = inference_block(djf_years, vals.tolist())

        payload = {
            "id": aid,
            "variable": VARIABLE_NAME,
            "units": DISPLAY_UNITS,
            "source": SOURCE_INFO,
            "region": {
                "id": rid,
                "label": label,
                "geometry": "Natural Earth Admin 0 polygon" if rid == "indonesia" else ("Natural Earth Peru polygon clipped to box" if rid == "coastal_peru" else "BBOX"),
                "bbox": bbox,
                "cells_used": reg["cells_used"],
                "area_km2": round(reg["area_km2"], 2),
            },
            "season": {"code": "DJF", "year_label": "January year", "months": [12, 1, 2], "aggregation": "day-weighted mean of 3 monthly values"},
            "years": djf_years,
            "values": [round(float(v), 6) if np.isfinite(v) else None for v in vals],
            "coverage": [round(float(v), 6) for v in reg["coverage"]],
            "anomaly_baseline": None,
            "geometry_file": "data/artifacts/regions.geojson",
            "template_summary": f"{label} DJF AOD for {djf_years[0]}-{djf_years[-1]} has a mean of {float(np.nanmean(vals)):.3f} across {len(djf_years)} seasons.",
            "trend": trend_block(djf_years, vals.tolist()),
            "validation": {"reference": "Giovanni M2TMNXAER 5.12.4 box request", "status": "pending", "notes": "Giovanni comparison not supplied; inference unavailable."},
            "generated": datetime.now(timezone.utc).isoformat(),
            "code_version": "w9-aod-gldas",
        }

        filename = f"aod_{rid}_DJF.json"
        (out_root / filename).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

        if payload["validation"]["status"] == "passed":
            artifact_index.append({"id": aid, "label": label, "variable": VARIABLE_NAME, "season": "DJF", "region_id": rid})

    (out_root / "index.json").write_text(json.dumps({"artifacts": artifact_index}, indent=2) + "\n", encoding="utf-8")


def area_mean(grid, area_weights):
    """Area-weighted mean with coverage fraction."""
    x = np.asarray(grid, dtype=float)
    valid = np.isfinite(x) & (area_weights > 0)
    denom = np.sum(np.where(valid, area_weights, 0), axis=(-2, -1))
    numer = np.sum(np.where(valid, x * area_weights, 0), axis=(-2, -1))
    return numer / denom, denom / np.sum(area_weights)


def build_grid(monthly=None):
    """Build global 1-degree grid tiles and index.json."""
    if monthly is None:
        print("Loading monthly AOD data...", flush=True)
        monthly = load_monthly_regridded()

    meta = {
        "format_version": 1,
        "grid_resolution_deg": 1.0,
        "tile_size_deg": 10,
        "fill_int16": FILL_INT16,
        "seasons": {},
        "variables": {
            VAR_SLUG: {
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
                "source": SOURCE_INFO,
                "years_by_season": {},
                "available_tiles": {},
            }
        },
    }

    out_root = ROOT / "data" / "artifacts"
    out_root.mkdir(parents=True, exist_ok=True)

    for season, (months, label) in SEASONS.items():
        years = YEARS[season]
        print(f"Building {season} ({len(years)} years)...", flush=True)
        vals, coverage = seasonal_values(monthly, season, years)

        meta["seasons"][season] = {
            "code": season,
            "year_label": label,
            "months": months,
            "aggregation": "day-weighted mean of monthly values",
        }
        meta["variables"][VAR_SLUG]["years_by_season"][season] = years
        meta["variables"][VAR_SLUG]["available_tiles"][season] = write_tiles(season, years, vals, coverage, out_root)
        print(f"  Wrote {len(meta['variables'][VAR_SLUG]['available_tiles'][season])} tiles", flush=True)

    # Write index.json
    idx_path = out_root / "grid" / "index.json"
    idx_path.parent.mkdir(parents=True, exist_ok=True)
    idx_path.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")

    # Report size
    variable_bytes = sum(f.stat().st_size for f in (out_root / "grid" / VAR_SLUG).rglob("*.json"))
    meta["variables"][VAR_SLUG]["total_size_bytes"] = variable_bytes
    idx_path.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")

    print(f"AOD grid JSON bytes: {variable_bytes} ({variable_bytes / 1e6:.1f} MB)", flush=True)
    if variable_bytes > 150_000_000:
        raise RuntimeError(f"AOD grid exceeds 150 MB ({variable_bytes} bytes)")

    return variable_bytes


def build_regional(monthly=None):
    """Build regional artifacts for featured regions."""
    if monthly is None:
        print("Loading monthly AOD data for regional artifacts...", flush=True)
        monthly = load_monthly_regridded()

    out_root = ROOT / "data" / "artifacts"
    out_root.mkdir(parents=True, exist_ok=True)
    build_regional_artifacts(monthly, out_root)
    print("Regional artifacts built.", flush=True)


def build_all():
    """Build both grid and regional artifacts."""
    # Load monthly data once
    print("Loading monthly AOD data...", flush=True)
    monthly = load_monthly_regridded()
    print(f"Loaded {len(monthly)} months", flush=True)

    # Build grid using the loaded data
    print("Building grid...", flush=True)
    grid_bytes = build_grid(monthly)

    # Build regional using the loaded data
    print("Building regional artifacts...", flush=True)
    build_regional(monthly)

    print(f"Done. AOD grid size: {grid_bytes / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    build_all()