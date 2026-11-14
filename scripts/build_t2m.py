"""Build the MERRA-2 T2M seasonal grid tiles and the regional DJF artifacts.

Usage::

    python scripts/build_t2m.py            # grid and regional artifacts
    python scripts/build_t2m.py grid       # grid tiles only
    python scripts/build_t2m.py artifacts  # regional DJF artifacts only

Grid output: ``data/artifacts/grid/t2m/<season>/<lon>_<lat>.json`` plus the
merge fragment ``data/artifacts/grid/index_t2m.json`` for the shared
``index.json``.  Regional output: ``data/artifacts/t2m_<region>_DJF.json``.

All temperatures are degrees Celsius.  The native grid is 0.5 x 0.625 degree;
the click grid is 1 degree and uses cos(latitude) x overlap-area weights.
"""
import calendar
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.trend.regions import BOXES, REGIONS, build_regions, box_mask
from backend.trend.seasons import aggregate_djf, area_mean
from backend.trend.stats import trend_block
from backend.trend.var_t2m import (
    COVERAGE_SCALE,
    FILL,
    GRID_SHAPE,
    SERIES_SCALE,
    SLOPE_SCALE,
    SEASON_MONTHS,
    YEAR_RANGES,
    available_months,
    read_month,
    regrid_to_1deg,
    regrid_weights,
    seasonal_series,
)

SOURCE = {
    "product": "M2TMNXSLV",
    "version": "5.12.4",
    "var": "T2M",
    "doi_or_url": "https://doi.org/10.5067/AP1B0BA5PD2K",
}
SEASON_LABELS = {"ANN": "Calendar year", "DJF": "January year"}
GRID_ROOT = ROOT / "data" / "artifacts" / "grid" / "t2m"
ARTIFACT_ROOT = ROOT / "data" / "artifacts"


def needed_months():
    """Every (year, month) pair used by at least one season and year range."""
    months = set()
    for season, years in YEAR_RANGES.items():
        for year in years:
            if season == "DJF":
                months.update(((year - 1, 12), (year, 1), (year, 2)))
            else:
                months.update((year, month) for month in SEASON_MONTHS[season])
    return sorted(months)


def load_monthly_1deg():
    """Read every monthly field, convert to degC and bin it to 1 degree.

    Returns ``(monthly, coverage, weights)``.  Binning each month and then
    averaging days is the same linear operation as averaging first, so the
    seasonal means match a one-shot seasonal regrid.
    """
    wanted = needed_months()
    have = set(available_months())
    missing = [key for key in wanted if key not in have]
    if missing:
        raise FileNotFoundError(f"Missing archive months: {missing[:5]} ({len(missing)} total)")
    values, coverage, weights = {}, {}, None
    for count, (year, month) in enumerate(wanted, start=1):
        data, lat, lon, _ = read_month(year, month)
        if weights is None:
            weights = regrid_weights(lat, lon)
        grid, cover = regrid_to_1deg(data, weights)
        values[(year, month)] = grid.astype(np.float32)
        coverage[(year, month)] = cover.astype(np.float32)
        if count % 60 == 0:
            print(f"Regridded {count}/{len(wanted)} months", flush=True)
    return values, coverage, weights


def decode(quantized):
    """Decode int16 values back to physical degC (fill becomes NaN)."""
    q = np.asarray(quantized, dtype=float)
    return np.where(q == FILL, np.nan, q * SERIES_SCALE)


def sen_slope_grid(years, series, chunk=4096):
    """Sen slope per decade for a stack of per-cell series.

    ``series`` is ``(n_years, n_cells)`` and may contain NaN.  Results match
    ``backend.trend.stats.sen_slope_per_decade`` for the same valid pairs; cells
    with fewer than ten valid years are NaN.
    """
    y = np.asarray(years, dtype=float)
    x = np.asarray(series, dtype=float)
    n_years, n_cells = x.shape
    i, j = np.triu_indices(n_years, k=1)
    denominators = (y[j] - y[i])[:, None]
    out = np.full(n_cells, np.nan, dtype=float)
    for start in range(0, n_cells, chunk):
        block = x[:, start:start + chunk]
        valid = np.isfinite(block)
        enough = valid.sum(axis=0) >= 10
        columns = np.nonzero(enough)[0]
        if columns.size == 0:
            continue
        block = block[:, columns]
        valid = valid[:, columns]
        pair_valid = valid[j, :] & valid[i, :]
        slopes = np.where(pair_valid, (block[j, :] - block[i, :]) / denominators, np.nan)
        with np.errstate(all="ignore"):
            slope = np.nanmedian(slopes, axis=0) * 10.0
        out[start + columns] = slope
    return out


def quantize(values):
    """Quantize a stack to int16 with the canonical fill and clamp rules."""
    data = np.asarray(values, dtype=float)
    good = np.isfinite(data)
    quantized = np.full(data.shape, FILL, dtype=np.int16)
    scaled = np.clip(np.rint(data[good] / SERIES_SCALE), -32767, 32767)
    quantized[good] = scaled.astype(np.int16)
    return quantized


def compact_coverage(quantized, coverage):
    """Per-year coverage integers, or the single ``1000`` when fully covered."""
    cover = np.asarray(coverage, dtype=float)
    q = np.asarray(quantized)
    values = np.where(q == FILL, 0, np.clip(np.rint(cover / COVERAGE_SCALE), 0, 1000)).astype(int)
    full = bool(
        np.all(((q == FILL) & (values == 0)) | ((q != FILL) & (values == 1000)))
    )
    return 1000 if full else values.tolist()


def write_tiles(season, years, values, coverage):
    """Write all non-empty 10 x 10 degree tiles for one season."""
    out = GRID_ROOT / season
    out.mkdir(parents=True, exist_ok=True)
    quantized = quantize(values)
    decoded = decode(quantized)
    slopes = sen_slope_grid(
        years, decoded.reshape(len(years), -1)
    ).reshape(GRID_SHAPE)
    quantized_flat = quantized.reshape(len(years), -1)
    coverage_flat = coverage.reshape(len(years), -1)
    slope_flat = slopes.ravel()
    available = []
    for tile_lat in range(-90, 90, 10):
        for tile_lon in range(-180, 180, 10):
            cells = {}
            for lat_sw in range(tile_lat, tile_lat + 10):
                row = lat_sw + 90
                for lon_sw in range(tile_lon, tile_lon + 10):
                    col = lon_sw + 180
                    index = row * GRID_SHAPE[1] + col
                    qv = quantized_flat[:, index]
                    if not np.any(qv != FILL):
                        continue
                    slope = slope_flat[index]
                    qs = FILL if not np.isfinite(slope) else int(
                        np.clip(np.rint(slope / SLOPE_SCALE), -32767, 32767)
                    )
                    cell_id = f"cell_{lat_sw + 0.5:.1f}_{lon_sw + 0.5:.1f}"
                    cells[cell_id] = {
                        "s": qs,
                        "v": qv.tolist(),
                        "c": compact_coverage(qv, coverage_flat[:, index]),
                    }
            if cells:
                key = f"{tile_lon}_{tile_lat}"
                available.append(key)
                payload = {
                    "v_slug": "t2m",
                    "season": season,
                    "tile": [tile_lon, tile_lat],
                    "cells": dict(sorted(cells.items())),
                }
                target = out / f"{key}.json"
                target.write_text(
                    json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
                    encoding="utf-8",
                )
                if target.stat().st_size >= 300_000:
                    raise ValueError(f"Tile over 300 KB: {target.name}")
    return sorted(available)


def build_grid():
    """Build the five seasonal tile layers and the index merge fragment."""
    monthly, monthly_coverage, _ = load_monthly_1deg()
    fragment = {
        "format_version": 1,
        "grid_resolution_deg": 1.0,
        "tile_size_deg": 10,
        "fill_int16": FILL,
        "seasons": {},
        "variables": {
            "t2m": {
                "variable": "temperature",
                "units": "degC",
                "slope_units": "degC/decade",
                "scale": SERIES_SCALE,
                "offset": 0.0,
                "decimals": 2,
                "slope_scale": SLOPE_SCALE,
                "slope_offset": 0.0,
                "slope_decimals": 3,
                "coverage_scale": COVERAGE_SCALE,
                "coverage_offset": 0.0,
                "coverage_decimals": 3,
                "land_only": False,
                "regrid_note": "MERRA-2 0.5 x 0.625 deg averaged to 1.0 deg with cos(latitude) x overlap-area weights",
                "source": SOURCE,
                "years_by_season": {},
                "available_tiles": {},
            }
        },
    }
    for season, years in YEAR_RANGES.items():
        years = list(years)
        vals, _ = seasonal_series(monthly, season, years)
        stack_cov = np.zeros_like(vals)
        for index, year in enumerate(years):
            keys = _used_keys(season, year)
            days = np.asarray(
                [calendar.monthrange(y, m)[1] for y, m in keys], dtype=np.float32
            )[:, None, None]
            cover = np.stack([monthly_coverage[key] for key in keys])
            complete = np.all(
                np.stack([np.isfinite(monthly[key]) for key in keys]), axis=0
            )
            stack_cov[index] = np.where(
                complete, np.sum(cover * days, axis=0) / days.sum(), 0.0
            )
        # A season that is incomplete anywhere is stored as missing with zero coverage.
        stack_cov = np.where(np.isfinite(vals), stack_cov, 0.0)
        tiles = write_tiles(season, years, vals, stack_cov)
        fragment["seasons"][season] = {
            "code": season,
            "year_label": SEASON_LABELS.get(season, "Calendar year"),
            "months": list(SEASON_MONTHS[season]),
            "aggregation": f"day-weighted mean of {len(SEASON_MONTHS[season])} monthly values",
        }
        fragment["variables"]["t2m"]["years_by_season"][season] = years
        fragment["variables"]["t2m"]["available_tiles"][season] = tiles
        print(f"Built {season}: {len(years)} years, {len(tiles)} tiles", flush=True)
    total = sum(path.stat().st_size for path in GRID_ROOT.rglob("*.json"))
    fragment["variables"]["t2m"]["total_size_bytes"] = total
    target = ROOT / "data" / "artifacts" / "grid" / "index_t2m.json"
    target.write_text(json.dumps(fragment, indent=2) + "\n", encoding="utf-8")
    print(f"t2m grid JSON bytes: {total} ({total / 1e6:.1f} MB)")
    if total > 150_000_000:
        raise RuntimeError(f"t2m grid exceeds 150 MB ({total} bytes)")
    return total


def _used_keys(season, year):
    if season == "DJF":
        return ((year - 1, 12), (year, 1), (year, 2))
    return tuple((year, month) for month in SEASON_MONTHS[season])


def build_artifacts():
    """Write the ten featured-region DJF artifacts on the native grid."""
    years = list(YEAR_RANGES["DJF"])
    keys = sorted({key for year in years for key in _used_keys("DJF", year)})
    monthly = {}
    lat = lon = None
    for index, key in enumerate(keys, start=1):
        monthly[key], lat, lon, _ = read_month(*key)
        if index % 40 == 0:
            print(f"Read {index}/{len(keys)} DJF months", flush=True)
    regions = build_regions(lat, lon, region_ids=tuple(r["id"] for r in REGIONS))
    seasons = aggregate_djf(monthly, years)
    for rid, region in regions.items():
        region["equal"], region["coverage"] = area_mean(seasons["equal"], region["area_weights"])
        region["day_weighted"], _ = area_mean(seasons["day_weighted"], region["area_weights"])
        box_fraction, box_area = box_mask(lat, lon, BOXES[rid])
        region["box_equal"], _ = area_mean(seasons["equal"], box_fraction * box_area)
        region["box_day_weighted"], _ = area_mean(seasons["day_weighted"], box_fraction * box_area)

    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    for spec in REGIONS:
        rid = spec["id"]
        region = regions[rid]
        values = [round(float(value), 6) for value in region["day_weighted"]]
        trend = trend_block(seasons["years"], values)
        mean = float(np.mean(values))
        slope = trend["sen_slope_per_decade"]
        slope_text = (
            f"Sen slope {slope:+.3f} degC/decade" if slope is not None else "Sen slope unavailable"
        )
        payload = {
            "id": f"t2m_{rid}_DJF",
            "variable": "temperature",
            "units": "degC",
            "source": SOURCE,
            "region": {
                "id": rid,
                "label": spec["label"],
                "geometry": "Natural Earth Admin 0 polygon" if rid == "indonesia"
                else ("Natural Earth Peru polygon clipped to box" if rid == "coastal_peru" else "BBOX"),
                "bbox": list(spec["bbox"]),
                "cells_used": region["cells_used"],
                "area_km2": round(region["area_km2"], 2),
            },
            "season": {
                "code": "DJF",
                "year_label": "January year",
                "months": [12, 1, 2],
                "aggregation": "day-weighted mean of 3 monthly values",
            },
            "years": seasons["years"],
            "values": values,
            "coverage": [round(float(value), 6) for value in region["coverage"]],
            "anomaly_baseline": None,
            "geometry_file": "data/artifacts/regions.geojson",
            "template_summary": (
                f"{spec['label']} DJF 2 m air temperature for {seasons['years'][0]}-"
                f"{seasons['years'][-1]} has a mean of {mean:.2f} degC across "
                f"{len(seasons['years'])} seasons; {slope_text} "
                f"(inference: {trend['inference']['status']})."
            ),
            "trend": trend,
            "validation": {
                "reference": "Giovanni MERRA-2 M2TMNXSLV 5.12.4 box request",
                "status": "pending",
                "notes": "Giovanni comparison not supplied; nothing is marked passed.",
            },
            "generated": datetime.now(timezone.utc).isoformat(),
            "code_version": "w8-t2m",
        }
        target = ARTIFACT_ROOT / f"t2m_{rid}_DJF.json"
        target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {target.name}", flush=True)
    write_validation_doc(regions, seasons)
    return regions


def write_validation_doc(regions, seasons):
    """Write docs/VALIDATION_T2M.md with the Giovanni request and box series."""
    first, last = seasons["years"][0], seasons["years"][-1]
    lines = [
        "# T2M validation record (MERRA-2 2 m air temperature)",
        "",
        "Status: **pending**. No comparison with Giovanni has been supplied, so nothing",
        "is marked passed and the app must keep this variable not ready.",
        "",
        "## Giovanni request settings",
        "",
        "Product: MERRA-2 Monthly Mean 2D Single-Level Diagnostics (M2TMNXSLV), "
        "version 5.12.4.",
        "Variable: `T2M` (2-meter air temperature), not `TS` (surface skin temperature). "
        "The files are in Kelvin, so subtract 273.15 from the downloaded values to compare "
        "with our degrees Celsius series.",
        f"Time range: December {first - 1} through February {last}; season DJF labelled by the "
        f"January year, years {first}-{last}.",
        "Request: monthly area-averaged time series for a lat/lon box, then download the CSV.",
        "Every box is written in west, south, east, north order.",
        "",
        "| Region | West | South | East | North | Mask in our series |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for spec in REGIONS:
        west, south, east, north = spec["bbox"]
        mask = {
            "indonesia": "Natural Earth Admin 0 Indonesia polygon",
            "coastal_peru": "Natural Earth Peru polygon clipped to the box",
        }.get(spec["id"], "Box")
        lines.append(
            f"| {spec['label']} | {west} | {south} | {east} | {north} | {mask} |"
        )

    lines += [
        "",
        "## Like-for-like rule",
        "",
        "Our featured-region numbers use the native MERRA-2 grid (0.5 x 0.625 degree), a",
        "fractional cell mask weighted by spherical cell area, and a day-weighted DJF mean.",
        "Apply the same order to Giovanni: first take its monthly area-averaged values, then",
        "weight December by 31 days, January by 31 days and February by 28 or 29 days.",
        "The equal-month column is a sensitivity check and is not the product series.",
        "",
        "## Proposed pass rule (not applied)",
        "",
        "For the lead and science reviewer to confirm before any comparison: mean bias and",
        "mean absolute error each at most 0.25 degC, largest single-year difference at most",
        "0.5 degC, and Sen slopes within 0.05 degC/decade. No region passes until a Giovanni",
        "CSV is supplied and these checks run.",
        "",
        "## Mask diagnostics and comparison series",
        "",
        "The comparison series below are box-mask means on the native grid, in degrees",
        "Celsius. Indonesia and Coastal Peru are shipped with polygon masks, so the box series",
        "is a like-for-like comparison with Giovanni rather than the exact app series.",
        "",
    ]
    for spec in REGIONS:
        region = regions[spec["id"]]
        lines += [
            f"### {spec['label']}",
            "",
            f"Polygon or box mask: {region['cells_used']} native cells; area "
            f"{region['area_km2']:.2f} km2.",
            f"Box versus app mask maximum absolute difference, equal-month: "
            f"{max(abs(region['box_equal'] - region['equal'])):.6f} degC.",
            "",
            "Box mask comparison series by January year (degC):",
            "",
            "| Year | Day-weighted | Equal-month |",
            "|---:|---:|---:|",
        ]
        lines += [
            f"| {year} | {day:.6f} | {equal:.6f} |"
            for year, day, equal in zip(
                seasons["years"], region["box_day_weighted"], region["box_equal"]
            )
        ]
        lines.append("")
    target = ROOT / "docs" / "VALIDATION_T2M.md"
    target.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {target.name}", flush=True)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    choice = argv[0] if argv else "all"
    if choice in ("all", "grid"):
        build_grid()
    if choice in ("all", "artifacts"):
        build_artifacts()


if __name__ == "__main__":
    main()
