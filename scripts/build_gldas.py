"""Build 1-degree GLDAS soil moisture and SWE seasonal tiles, trend maps and regional artifacts."""
import calendar
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.trend.var_gldas import (
    load_monthly,
    get_land_mask,
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
    SOIL_SOURCE,
    SWE_SOURCE,
    SOIL_VAR,
    SWE_VAR,
    encode_int16,
    COASTAL_WARNING,
    ANOMALY_NOTE,
)
from backend.trend.stats import inference_block, sen_slope, trend_block
from backend.trend.regions import REGIONS, BOXES, build_regions, box_mask
from backend.trend.seasons import aggregate_djf
from backend.trend.series import build_series


def seasonal_values(monthly, lat, lon, season, years, variable=SOIL_VAR):
    """Compute seasonal values and coverage for given years and variable.

    For land-only: ocean cells are fill (excluded from tiles).

    Returns:
        vals: (n_years, 150, 360) float32 array
        coverage: (n_years, 150, 360) float32 array
        land_mask: (150, 360) bool
    """
    months = SEASONS[season][0]
    values, cover = [], []
    land_mask = get_land_mask(lat, lon)

    for year in years:
        if season == "DJF":
            keys = [(year - 1, 12), (year, 1), (year, 2)]
        else:
            keys = [(year, m) for m in months]

        arrays = []
        for key in keys:
            if key in monthly:
                arrays.append(monthly[key][variable])
            else:
                arrays.append(None)

        if any(a is None for a in arrays):
            values.append(np.full((150, 360), np.nan, np.float32))
            cover.append(np.zeros((150, 360), np.float32))
            continue

        stack = np.stack(arrays)
        days = np.asarray([calendar.monthrange(y, m)[1] for y, m in keys], dtype=np.float32)[:, None, None]
        valid = np.isfinite(stack)
        den = np.sum(valid * days, axis=0)
        complete = valid.all(axis=0)
        val = np.divide(np.nansum(stack * days, axis=0), den, out=np.full((150, 360), np.nan), where=complete)
        # Mask ocean cells
        val[~land_mask] = np.nan
        values.append(val.astype(np.float32))
        cover.append((den / days.sum()).astype(np.float32))

    return np.stack(values), np.stack(cover), land_mask


def cell_sen(years, vals):
    """Compute Sen slope for a single cell's time series."""
    good = np.isfinite(vals)
    if int(good.sum()) < 10:
        return None
    y, x = np.asarray(years)[good], np.asarray(vals)[good]
    return float(sen_slope(y.tolist(), x.tolist()))


def write_tiles(season, years, vals, coverage, land_mask, out_root, variable=SOIL_VAR):
    """Write 10x10 degree tiles for a season (land-only)."""
    out = out_root / "grid" / VAR_SLUG / season
    out.mkdir(parents=True, exist_ok=True)
    available = []

    # GLDAS grid: lat -59.5 to 89.5 (150 rows), lon -179.5 to 179.5 (360 cols)
    # Row 0 = lat 89.5, Row 149 = lat -59.5
    # Col 0 = lon -179.5, Col 359 = lon 179.5
    # Tile coordinates: tile_lon in [-180, -170, ..., 170], tile_lat in [-90, -80, ..., 80]
    # But GLDAS only has data down to -60 (actually -59.5), so tiles south of -60 are empty

    for tile_lat in range(-90, 90, 10):
        for tile_lon in range(-180, 180, 10):
            cells = {}
            for lat_sw in range(tile_lat, tile_lat + 10):
                # lat_sw is SW corner of 1-degree cell
                # GLDAS cell centers are at half-degrees: -59.5, -58.5, ..., 89.5
                # Cell with SW corner lat_sw has center at lat_sw + 0.5
                # Row index: lat_center = 89.5 - row => row = 89.5 - lat_center
                # lat_center = lat_sw + 0.5
                # row = 89.5 - (lat_sw + 0.5) = 89 - lat_sw
                row = 89 - lat_sw
                if row < 0 or row >= 150:
                    continue  # Outside GLDAS lat range (-59.5 to 89.5)

                for lon_sw in range(tile_lon, tile_lon + 10):
                    col = lon_sw + 180
                    if col < 0 or col >= 360:
                        continue

                    # Skip ocean cells
                    if not land_mask[row, col]:
                        continue

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


def build_regional_artifacts(monthly, lat, lon, out_root):
    """Build featured regional artifacts for DJF season (soil moisture and SWE)."""
    regions = build_regions(lat, lon, region_ids=tuple(r["id"] for r in REGIONS))

    djf_years = YEARS["DJF"]
    djf_seasons_soil = aggregate_djf({k: v[SOIL_VAR] for k, v in monthly.items()}, djf_years)
    djf_seasons_swe = aggregate_djf({k: v[SWE_VAR] for k, v in monthly.items()}, djf_years)

    for rid, reg in regions.items():
        reg["soil_day_weighted"], reg["soil_coverage"] = area_mean(djf_seasons_soil["day_weighted"], reg["area_weights"])
        reg["swe_day_weighted"], reg["swe_coverage"] = area_mean(djf_seasons_swe["day_weighted"], reg["area_weights"])
        bf, bw = box_mask(lat, lon, BOXES[rid])
        reg["soil_box_day_weighted"], _ = area_mean(djf_seasons_soil["day_weighted"], bf * bw)
        reg["swe_box_day_weighted"], _ = area_mean(djf_seasons_swe["day_weighted"], bf * bw)

    # Write regions.geojson
    from shapely.geometry import mapping
    features = [{"type": "Feature", "properties": {"id": rid}, "geometry": mapping(reg["geometry"].simplify(0.05, preserve_topology=True))} for rid, reg in regions.items()]
    (out_root / "regions.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")), encoding="utf-8")

    specs = {r["id"]: (f"soil_{r['id']}_DJF", r["label"], list(r["bbox"])) for r in REGIONS}
    artifact_index = []

    for rid, (aid, label, bbox) in specs.items():
        reg = regions[rid]

        # Soil moisture artifact
        soil_vals = reg["soil_day_weighted"]
        soil_inf = inference_block(djf_years, soil_vals.tolist())
        soil_trend = trend_block(djf_years, soil_vals.tolist())

        soil_payload = {
            "id": aid,
            "variable": VARIABLE_NAME,
            "units": DISPLAY_UNITS,
            "source": SOIL_SOURCE,
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
            "values": [round(float(v), 6) if np.isfinite(v) else None for v in soil_vals],
            "coverage": [round(float(v), 6) for v in reg["soil_coverage"]],
            "anomaly_baseline": None,
            "geometry_file": "data/artifacts/regions.geojson",
            "template_summary": f"{label} DJF soil moisture for {djf_years[0]}-{djf_years[-1]} has a mean of {float(np.nanmean(soil_vals)):.1f} kg/m² across {len(djf_years)} seasons. {COASTAL_WARNING} {ANOMALY_NOTE}",
            "trend": soil_trend,
            "validation": {"reference": "Giovanni GLDAS_NOAH10_M 2.1 box request", "status": "pending", "notes": "Giovanni comparison not supplied; inference unavailable."},
            "generated": datetime.now(timezone.utc).isoformat(),
            "code_version": "w9-aod-gldas",
        }

        soil_filename = f"soil_{rid}_DJF.json"
        (out_root / soil_filename).write_text(json.dumps(soil_payload, indent=2) + "\n", encoding="utf-8")

        # SWE artifact (only where meaningful - i.e., regions with non-trivial SWE)
        swe_vals = reg["swe_day_weighted"]
        swe_mean = float(np.nanmean(swe_vals))
        swe_inf = inference_block(djf_years, swe_vals.tolist())
        swe_trend = trend_block(djf_years, swe_vals.tolist())

        swe_payload = {
            "id": aid.replace("soil_", "swe_"),
            "variable": "snow_water_equivalent",
            "units": DISPLAY_UNITS,
            "source": SWE_SOURCE,
            "region": soil_payload["region"],
            "season": soil_payload["season"],
            "years": djf_years,
            "values": [round(float(v), 6) if np.isfinite(v) else None for v in swe_vals],
            "coverage": [round(float(v), 6) for v in reg["swe_coverage"]],
            "anomaly_baseline": None,
            "geometry_file": "data/artifacts/regions.geojson",
            "template_summary": f"{label} DJF snow water equivalent for {djf_years[0]}-{djf_years[-1]} has a mean of {swe_mean:.1f} kg/m² across {len(djf_years)} seasons. {COASTAL_WARNING} SWE is near-zero in tropical regions. {ANOMALY_NOTE}",
            "trend": swe_trend,
            "validation": {"reference": "Giovanni GLDAS_NOAH10_M 2.1 box request", "status": "pending", "notes": "Giovanni comparison not supplied; inference unavailable."},
            "generated": datetime.now(timezone.utc).isoformat(),
            "code_version": "w9-aod-gldas",
        }

        swe_filename = f"swe_{rid}_DJF.json"
        (out_root / swe_filename).write_text(json.dumps(swe_payload, indent=2) + "\n", encoding="utf-8")

        if soil_payload["validation"]["status"] == "passed":
            artifact_index.append({"id": aid, "label": label, "variable": VARIABLE_NAME, "season": "DJF", "region_id": rid})
        if swe_payload["validation"]["status"] == "passed":
            artifact_index.append({"id": swe_payload["id"], "label": label, "variable": "snow_water_equivalent", "season": "DJF", "region_id": rid})

    (out_root / "index.json").write_text(json.dumps({"artifacts": artifact_index}, indent=2) + "\n", encoding="utf-8")


def area_mean(grid, area_weights):
    """Area-weighted mean with coverage fraction."""
    x = np.asarray(grid, dtype=float)
    valid = np.isfinite(x) & (area_weights > 0)
    denom = np.sum(np.where(valid, area_weights, 0), axis=(-2, -1))
    numer = np.sum(np.where(valid, x * area_weights, 0), axis=(-2, -1))
    return numer / denom, denom / np.sum(area_weights)


def build_grid():
    """Build global 1-degree grid tiles and index.json for soil moisture."""
    print("Loading monthly GLDAS data...", flush=True)
    monthly, lat, lon = load_monthly()

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
                "source": SOIL_SOURCE,
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
        vals, coverage, land_mask = seasonal_values(monthly, lat, lon, season, years)

        meta["seasons"][season] = {
            "code": season,
            "year_label": label,
            "months": months,
            "aggregation": "day-weighted mean of monthly values",
        }
        meta["variables"][VAR_SLUG]["years_by_season"][season] = years
        meta["variables"][VAR_SLUG]["available_tiles"][season] = write_tiles(season, years, vals, coverage, land_mask, out_root)
        print(f"  Wrote {len(meta['variables'][VAR_SLUG]['available_tiles'][season])} tiles", flush=True)

    # Write index.json
    idx_path = out_root / "grid" / "index.json"
    idx_path.parent.mkdir(parents=True, exist_ok=True)

    # Load existing index if present to preserve other variables
    if idx_path.exists():
        existing = json.loads(idx_path.read_text())
        existing["variables"][VAR_SLUG] = meta["variables"][VAR_SLUG]
        for s in SEASONS:
            existing["seasons"][s] = meta["seasons"][s]
        meta = existing

    idx_path.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")

    # Report size
    variable_bytes = sum(f.stat().st_size for f in (out_root / "grid" / VAR_SLUG).rglob("*.json"))
    meta["variables"][VAR_SLUG]["total_size_bytes"] = variable_bytes
    idx_path.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")

    print(f"Soil grid JSON bytes: {variable_bytes} ({variable_bytes / 1e6:.1f} MB)", flush=True)
    if variable_bytes > 150_000_000:
        raise RuntimeError(f"Soil grid exceeds 150 MB ({variable_bytes} bytes)")

    return variable_bytes


def build_regional():
    """Build regional artifacts for featured regions."""
    print("Loading monthly GLDAS data for regional artifacts...", flush=True)
    monthly, lat, lon = load_monthly()

    out_root = ROOT / "data" / "artifacts"
    out_root.mkdir(parents=True, exist_ok=True)
    build_regional_artifacts(monthly, lat, lon, out_root)
    print("Regional artifacts built.", flush=True)


def build_all():
    """Build both grid and regional artifacts."""
    grid_bytes = build_grid()
    build_regional()
    print(f"Done. Soil grid size: {grid_bytes / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    build_all()