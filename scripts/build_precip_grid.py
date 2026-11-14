"""Build 1-degree GPCP seasonal tiles, trend maps and compact timelapses."""
import calendar
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.trend.io import read_month

SEASONS = {
    "ANN": ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "Calendar year"),
    "DJF": ([12, 1, 2], "January year"), "MAM": ([3, 4, 5], "Calendar year"),
    "JJA": ([6, 7, 8], "Calendar year"), "SON": ([9, 10, 11], "Calendar year"),
}
YEARS = {s: list(range(1984, 2026)) if s == "DJF" else list(range(1983, 2026)) for s in SEASONS}
SCALE, SLOPE_SCALE, FILL = 0.01, 0.001, -32768
try:
    from backend.trend.stats import sen_slope as _sen_slope
except ImportError:
    _sen_slope = None


def regrid_05_to_1(data, lat):
    """Cos(latitude)-weighted 2x2 block mean on the 1-degree grid."""
    x = np.asarray(data, dtype=np.float64)
    latitude = np.asarray(lat, dtype=float)
    if x.shape != (360, 720) or not (latitude[0] > latitude[-1]):
        raise ValueError(f"Expected descending-latitude 360x720 GPCP grid, got {x.shape}")
    weights = np.cos(np.deg2rad(latitude)).reshape(180, 2, 1, 1)
    blocks = x.reshape(180, 2, 360, 2)
    valid = np.isfinite(blocks)
    weighted = np.where(valid, blocks * weights, 0.0)
    denom = np.sum(np.where(valid, weights, 0.0), axis=(1, 3))
    numer = np.sum(weighted, axis=(1, 3))
    return np.divide(numer, denom, out=np.full((180, 360), np.nan), where=denom > 0)


def load_monthly():
    monthly = {}
    for year in range(1983, 2026):
        for month in range(1, 13):
            data, lat, _, _ = read_month(year, month)
            monthly[(year, month)] = regrid_05_to_1(data, lat).astype(np.float32)
        if year % 5 == 0:
            print(f"Read monthly data through {year}", flush=True)
    return monthly


def encode(value, scale):
    if value is None or not np.isfinite(value):
        return FILL
    return int(np.clip(np.rint(value / scale), -32767, 32767))


def seasonal_values(monthly, season, years):
    months = SEASONS[season][0]
    values, cover = [], []
    for year in years:
        keys = [(year - 1, 12), (year, 1), (year, 2)] if season == "DJF" else [(year, m) for m in months]
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
    if _sen_slope is None:
        return None
    good = np.isfinite(vals)
    if int(good.sum()) < 10:
        return None
    y, x = np.asarray(years)[good], np.asarray(vals)[good]
    return float(_sen_slope(y.tolist(), x.tolist()))


def color_image(data, vmin, vmax, cmap="viridis"):
    import matplotlib
    matplotlib.use("Agg")
    rgba = matplotlib.colormaps[cmap](np.clip((data - vmin) / (vmax - vmin), 0, 1), bytes=True)
    rgba[~np.isfinite(data)] = (0, 0, 0, 0)
    # Half-degree 1-degree pixels keep all-season animations well under budget.
    return Image.fromarray(rgba, "RGBA").resize((360, 180), Image.Resampling.BILINEAR).convert("P", palette=Image.Palette.ADAPTIVE, colors=256)


def write_tiles(season, years, vals, coverage):
    out = ROOT / "data" / "artifacts" / "grid" / "precip" / season
    out.mkdir(parents=True, exist_ok=True)
    available = []
    # Each tile has at most 100 cells; calculate Sen slopes from decoded series.
    for tile_lat in range(-90, 90, 10):
        for tile_lon in range(-180, 180, 10):
            cells = {}
            for lat_sw in range(tile_lat, tile_lat + 10):
                row = 89 - lat_sw
                for lon_sw in range(tile_lon, tile_lon + 10):
                    # Each 1-degree cell is identified by its centre (SW corner + 0.5°).
                    # Tiles partition those cells by their integer SW-corner coordinates.
                    col = lon_sw + 180
                    series = vals[:, row, col]
                    if not np.isfinite(series).any():
                        continue
                    qv = [encode(v, SCALE) for v in series]
                    decoded = [None if q == FILL else round(q * SCALE, 2) for q in qv]
                    slope = cell_sen(years, decoded)
                    qs = encode(slope, SLOPE_SCALE)
                    cs = [int(np.clip(np.rint(c * 1000), 0, 1000)) if q != FILL else 0 for c, q in zip(coverage[:, row, col], qv)]
                    compact = 1000 if all((q == FILL and c == 0) or (q != FILL and c == 1000) for q, c in zip(qv, cs)) else cs
                    cell_id = f"cell_{lat_sw + 0.5:.1f}_{lon_sw + 0.5:.1f}"
                    cells[cell_id] = {"s": qs, "v": qv, "c": compact}
            if cells:
                key = f"{tile_lon}_{tile_lat}"
                available.append(key)
                payload = {"v_slug": "precip", "season": season, "tile": [tile_lon, tile_lat], "cells": dict(sorted(cells.items()))}
                target = out / f"{key}.json"
                target.write_text(json.dumps(payload, separators=(",", ":"), sort_keys=False), encoding="utf-8")
                if target.stat().st_size >= 300_000:
                    raise ValueError(f"Tile over 300 KB: {target.name}")
    return sorted(available)


def build():
    monthly = load_monthly()
    meta = {"format_version": 1, "grid_resolution_deg": 1.0, "tile_size_deg": 10, "fill_int16": FILL,
            "seasons": {}, "variables": {"precip": {"variable": "precipitation", "units": "mm/day", "slope_units": "mm/day/decade", "scale": .01, "offset": 0., "decimals": 2, "slope_scale": .001, "slope_offset": 0., "slope_decimals": 3, "coverage_scale": .001, "coverage_offset": 0., "coverage_decimals": 3, "land_only": False,
            "regrid_note": "GPCP 0.5 deg averaged to 1.0 deg with cos(latitude) weights", "source": {"product": "GPCPMON", "version": "3.3", "var": "sat_gauge_precip", "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA304"}, "years_by_season": {}, "available_tiles": {}}}}
    root = ROOT / "data" / "artifacts"
    for season, (months, label) in SEASONS.items():
        years = YEARS[season]
        vals, coverage = seasonal_values(monthly, season, years)
        meta["seasons"][season] = {"code": season, "year_label": label, "months": months, "aggregation": "day-weighted mean of monthly rates"}
        meta["variables"]["precip"]["years_by_season"][season] = years
        meta["variables"]["precip"]["available_tiles"][season] = write_tiles(season, years, vals, coverage)
        # Fixed cross-year display scale for each season.
        vmin, vmax = 0., 20.
        frames_dir = root / "timelapse" / f"precip_{season}"
        frames_dir.mkdir(parents=True, exist_ok=True)
        for index, year in enumerate(years):
            color_image(vals[index], vmin, vmax).save(frames_dir / f"{year}.png", optimize=True)
        # Sen-slope map, using the same true year coordinates and decoded values.
        slopes = np.full((180, 360), np.nan, np.float32)
        for row in range(180):
            for col in range(360):
                decoded = np.round(vals[:, row, col] / SCALE) * SCALE
                slopes[row, col] = cell_sen(years, decoded)
        color_image(slopes, -2., 2., "coolwarm").save(root / "grid" / "precip" / f"trend_{season}.png", optimize=True)
        print(f"Built {season}: {len(years)} frames", flush=True)
    p = root / "grid" / "index.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    variable_bytes = sum(f.stat().st_size for f in (root / "grid" / "precip").rglob("*.json"))
    meta["variables"]["precip"]["total_size_bytes"] = variable_bytes
    p.write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")
    if variable_bytes > 150_000_000:
        raise RuntimeError(f"precip grid exceeds 150 MB ({variable_bytes} bytes); stop per scope gate")
    for season, years in YEARS.items():
        folder = root / "timelapse" / f"precip_{season}"
        frames = list(folder.glob("*.png"))
        size = sum(f.stat().st_size for f in frames)
        index = {"years": years, "units": "mm/day", "vmin": 0., "vmax": 20., "colormap": "viridis", "extent": [-180, -90, 180, 90], "source": "GPCPMON 3.3 sat_gauge_precip", "frame_count": len(frames), "total_size_bytes": size}
        (folder / "index.json").write_text(json.dumps(index, separators=(",", ":")), encoding="utf-8")
        if season == "DJF" and size > 15_000_000:
            raise RuntimeError(f"DJF timelapse exceeds 15 MB ({size} bytes)")
    print(f"precip grid JSON bytes: {variable_bytes}", flush=True)


if __name__ == "__main__":
    build()
