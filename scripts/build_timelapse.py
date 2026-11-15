#!/usr/bin/env python3
"""Build scientific anomaly timelapse PNGs and metadata for precip, t2m, and aod."""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import matplotlib
import numpy as np
from PIL import Image

matplotlib.use("Agg")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.trend.grid_io import load_seasonal_grid  # noqa: E402

GRID_ROOT = ROOT / "data" / "artifacts" / "grid"
TIMELAPSE_ROOT = ROOT / "data" / "artifacts" / "timelapse"

METRICS: Tuple[Dict[str, str], ...] = (
    {
        "slug": "precip",
        "variable": "precipitation",
        "metric_label": "Rainfall",
        "units": "mm/day",
        "cmap": "BrBG",
        "source": "NASA GPCP Monthly v3.3 (sat_gauge_precip)",
    },
    {
        "slug": "t2m",
        "variable": "temperature",
        "metric_label": "Temperature",
        "units": "°C",
        "cmap": "RdBu_r",
        "source": "NASA MERRA-2 M2TMNXSLV v5.12.4 (T2M)",
    },
    {
        "slug": "aod",
        "variable": "aerosol_optical_depth",
        "metric_label": "Aerosols (haze)",
        "units": "AOD (unitless, 550 nm)",
        "cmap": "PuOr_r",
        "source": "NASA MERRA-2 M2TMNXAER v5.12.4 (TOTEXTTAU)",
        "clim_start": "1991",
        "clim_end": "2020",
    },
    {
        "slug": "sm",
        "variable": "soil_moisture",
        "metric_label": "Soil moisture (0–10 cm)",
        "units": "kg/m²",
        "cmap": "BrBG",
        "source": "NASA GLDAS Noah v2.1 (SoilMoi0_10cm_inst; v2.0 withheld due to +0.47 kg/m² step change)",
        "clim_start": "2001",
        "clim_end": "2020",
    },
)

SEASON_LABELS: Dict[str, str] = {
    "ANN": "Annual (ANN)",
    "DJF": "Winter (DJF)",
    "MAM": "Spring (MAM)",
    "JJA": "Summer (JJA)",
    "SON": "Autumn (SON)",
}

NICE_BOUNDS: Tuple[float, ...] = (
    0.05, 0.08, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75,
    1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 7.5, 10.0, 15.0, 20.0,
)


def nice_symmetric_bound(raw_abs: float) -> float:
    """Round a positive anomaly magnitude to a clean, fixed symmetric scale bound."""
    if not np.isfinite(raw_abs) or raw_abs <= 0:
        return 1.0
    for candidate in NICE_BOUNDS:
        if candidate >= raw_abs * 0.92:
            return float(candidate)
    return float(np.ceil(raw_abs))


def compute_anomalies_and_scale(
    years: Sequence[int],
    grid: np.ndarray,
    clim_start: int = 1991,
    clim_end: int = 2020,
) -> Tuple[np.ndarray, float, float]:
    """Compute anomalies relative to the 1991-2020 mean and choose symmetric 2nd-98th pct scale."""
    years_arr = np.asarray(years, dtype=int)
    mask = (years_arr >= clim_start) & (years_arr <= clim_end)
    if not mask.any():
        raise ValueError(f"No years fall in baseline {clim_start}-{clim_end}")

    clim_slice = grid[mask]
    valid_counts = np.sum(np.isfinite(clim_slice), axis=0)
    summed = np.nansum(clim_slice, axis=0)
    baseline = np.divide(
        summed,
        valid_counts,
        out=np.full(grid.shape[1:], np.nan, dtype=np.float32),
        where=valid_counts >= max(1, int(mask.sum()) // 2),
    )
    anomalies = (grid - baseline[None, :, :]).astype(np.float32)

    finite_vals = anomalies[np.isfinite(anomalies)]
    if finite_vals.size == 0:
        return anomalies, -1.0, 1.0
    p2, p98 = np.percentile(finite_vals, [2.0, 98.0])
    vmax = nice_symmetric_bound(float(max(abs(p2), abs(p98))))
    return anomalies, -vmax, vmax


def colormap_stops(cmap_name: str, vmin: float, vmax: float, n_stops: int = 11) -> List[List[Any]]:
    """Sample n_stops evenly spaced [value, '#rrggbb'] entries from matplotlib colormap."""
    cmap = matplotlib.colormaps[cmap_name]
    stops: List[List[Any]] = []
    for i in range(n_stops):
        t = i / (n_stops - 1)
        val = round(vmin + t * (vmax - vmin), 4)
        r, g, b, _ = cmap(t, bytes=True)
        stops.append([val, f"#{int(r):02x}{int(g):02x}{int(b):02x}"])
    return stops


N_PALETTE_COLORS = 64


def build_palette(cmap_name: str) -> bytes:
    """Build 256-entry RGB palette where index 0 is reserved for transparency."""
    cmap = matplotlib.colormaps[cmap_name]
    palette = bytearray(256 * 3)
    for idx in range(1, N_PALETTE_COLORS + 1):
        t = (idx - 1) / (N_PALETTE_COLORS - 1)
        r, g, b, _ = cmap(t, bytes=True)
        palette[idx * 3] = int(r)
        palette[idx * 3 + 1] = int(g)
        palette[idx * 3 + 2] = int(b)
    return bytes(palette)


def render_anomaly_frame(
    anom_2d: np.ndarray, vmin: float, vmax: float, palette: bytes
) -> Image.Image:
    """Render a (180, 360) anomaly slice to a 360x180 palette PNG with transparent NaNs."""
    valid = np.isfinite(anom_2d)
    safe = np.where(valid, anom_2d, 0.0)
    scaled = np.clip((safe - vmin) / (vmax - vmin), 0.0, 1.0)
    q = np.rint(scaled * (N_PALETTE_COLORS - 1)).astype(np.uint8)
    indices = np.where(valid, 1 + q, 0).astype(np.uint8)
    img = Image.fromarray(indices, mode="P")
    img.putpalette(palette)
    img.info["transparency"] = 0
    return img


def build_set(
    metric: Dict[str, str],
    season: str,
    grid_root: Path = GRID_ROOT,
    timelapse_root: Path = TIMELAPSE_ROOT,
) -> Tuple[Path, int, int]:
    """Build one (metric, season) anomaly timelapse directory atomically."""
    slug = metric["slug"]
    years, grid, _ = load_seasonal_grid(grid_root, slug, season)
    clim_start = int(metric.get("clim_start", 1991))
    clim_end = int(metric.get("clim_end", 2020))
    baseline_label = f"{clim_start}–{clim_end}"
    anomalies, vmin, vmax = compute_anomalies_and_scale(
        years, grid, clim_start=clim_start, clim_end=clim_end
    )
    cmap_name = metric["cmap"]
    palette = build_palette(cmap_name)

    set_name = f"{slug}_{season}"
    target_dir = timelapse_root / set_name
    timelapse_root.mkdir(parents=True, exist_ok=True)
    tmp_dir = Path(tempfile.mkdtemp(prefix=f".tmp_{set_name}_", dir=str(timelapse_root)))

    frames_meta: List[Dict[str, Any]] = []
    total_bytes = 0
    try:
        for i, year in enumerate(years):
            img = render_anomaly_frame(anomalies[i], vmin, vmax, palette)
            fname = f"{year}.png"
            fpath = tmp_dir / fname
            img.save(fpath, format="PNG", transparency=0, optimize=True)
            total_bytes += fpath.stat().st_size
            frames_meta.append({"year": int(year), "file": fname})

        payload = {
            "variable": metric["variable"],
            "slug": slug,
            "metric_label": metric["metric_label"],
            "season": season,
            "season_label": SEASON_LABELS[season],
            "units": metric["units"],
            "anomaly_baseline": baseline_label,
            "vmin": vmin,
            "vmax": vmax,
            "colormap": {
                "name": cmap_name,
                "stops": colormap_stops(cmap_name, vmin, vmax, n_stops=11),
            },
            "extent": [-180, -90, 180, 90],
            "width": 360,
            "height": 180,
            "years": [int(y) for y in years],
            "frames": frames_meta,
            "frame_count": len(frames_meta),
            "total_size_bytes": total_bytes,
            "source": metric["source"],
            "method": (
                f"Seasonal anomalies relative to the {baseline_label} mean of the same season on the 1° grid; "
                "fixed symmetric color scale chosen from the 2nd–98th percentile of all anomalies in the set; "
                "native 1° cells (360×180 equirectangular, no smoothing)."
            ),
        }
        (tmp_dir / "index.json").write_text(
            json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        if target_dir.exists():
            shutil.rmtree(target_dir)
        os.replace(tmp_dir, target_dir)
    except Exception:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
        raise

    return target_dir, len(frames_meta), total_bytes


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--slug", help="Optional metric slug to rebuild (default: all).")
    args = parser.parse_args()

    selected = [m for m in METRICS if args.slug in (None, m["slug"])]
    if not selected:
        raise ValueError(f"Unknown metric slug: {args.slug!r}")

    for metric in selected:
        for season in ("ANN", "DJF", "MAM", "JJA", "SON"):
            target_dir, n_frames, size_b = build_set(metric, season)
            idx = json.loads((target_dir / "index.json").read_text(encoding="utf-8"))
            print(
                f"[timelapse] {target_dir.name}: {n_frames} frames, "
                f"[{idx['vmin']}, +{idx['vmax']}] {idx['units']}, "
                f"{size_b / 1024:.1f} KB"
            )
    all_pngs = list(TIMELAPSE_ROOT.glob("*/*.png"))
    total_bytes = sum(p.stat().st_size for p in all_pngs)
    total_frames = len(all_pngs)
    n_sets = len([d for d in TIMELAPSE_ROOT.iterdir() if d.is_dir() and (d / "index.json").is_file()])
    mb = total_bytes / (1024 * 1024)
    print(f"[timelapse] TOTAL: {total_frames} frames across {n_sets} sets, {mb:.2f} MB")
    if mb >= 25.0:
        print(f"WARNING: total timelapse size {mb:.2f} MB >= 25 MB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
