"""Global monthly ERSST v6 SST anomaly timelapse (1979-01 to 2026-10) for the 3D globe."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Tuple

import geopandas as gpd
import matplotlib
import numpy as np
import xarray as xr
from PIL import Image, ImageDraw

from backend.enso_history.history import build_history_payload
from backend.enso_history.parsers import format_ym

matplotlib.use("Agg")

ERSST_DIR = Path(r"D:\trend-detective-data\raw\ERSST_6")
NE_LAND_ZIP = Path(r"D:\trend-detective-data\raw\NaturalEarth_5.1.1\ne_10m_land.zip")
REF_HISTORY_DIR = Path(__file__).resolve().parents[2] / "data" / "reference" / "enso" / "history"

WIDTH = 720
HEIGHT = 360
VMIN = -3.0
VMAX = 3.0
START_YM = (1979, 1)
END_YM = (2026, 10)
CLIM_START = 1991
CLIM_END = 2020


def _colormap_stops(cmap_name: str, vmin: float, vmax: float, n_stops: int = 13) -> List[List[Any]]:
    cmap = matplotlib.colormaps[cmap_name]
    stops: List[List[Any]] = []
    for i in range(n_stops):
        t = i / (n_stops - 1)
        val = round(vmin + t * (vmax - vmin), 4)
        r, g, b, _ = cmap(t, bytes=True)
        stops.append([val, f"#{int(r):02x}{int(g):02x}{int(b):02x}"])
    return stops


N_PALETTE_COLORS = 64
ANOM_PALETTE_COLORS = 128
ALPHA_LOW_C = 0.25
ALPHA_HIGH_C = 1.0

# Darker diverging SST stops without white at zero:
# cool: #0b3d91 -> #1fb5c9 ... warm: #f2a541 -> #ff5a3c -> #b3122e
_COOL_X = np.array([-3.0, -1.5, -0.5, 0.0], dtype=np.float64)
_COOL_RGB = np.array([[11, 61, 145], [21, 122, 173], [31, 181, 201], [31, 181, 201]], dtype=np.float64)
_WARM_X = np.array([0.0, 0.6, 1.75, 3.0], dtype=np.float64)
_WARM_RGB = np.array([[242, 165, 65], [242, 165, 65], [255, 90, 60], [179, 18, 46]], dtype=np.float64)


def _sst_anom_rgb(val: float) -> Tuple[int, int, int]:
    """Interpolate RGB on dark cool/warm ramp without white near zero."""
    if val < 0.0:
        return tuple(int(round(float(np.interp(val, _COOL_X, _COOL_RGB[:, ch])))) for ch in range(3))  # type: ignore[return-value]
    return tuple(int(round(float(np.interp(val, _WARM_X, _WARM_RGB[:, ch])))) for ch in range(3))  # type: ignore[return-value]


def _sst_anom_stops(vmin: float = VMIN, vmax: float = VMAX, n_stops: int = 13) -> List[List[Any]]:
    """Return evenly spaced colormap stops with dark ocean center (no white wash)."""
    stops: List[List[Any]] = []
    for i in range(n_stops):
        val = round(vmin + (i / (n_stops - 1)) * (vmax - vmin), 4)
        if abs(val) < 1e-9:
            stops.append([0.0, "#0f172a"])
        else:
            r, g, b = _sst_anom_rgb(val)
            stops.append([val, f"#{r:02x}{g:02x}{b:02x}"])
    return stops


def _build_sst_anom_palette_and_trns() -> Tuple[bytes, bytes]:
    """Return (palette_rgb_768, tRNS_alpha) with smooth alpha ramp 0 (<=0.25C) -> 255 (>=1.0C)."""
    palette = bytearray(256 * 3)
    trns = bytearray(ANOM_PALETTE_COLORS + 1)
    trns[0] = 0  # index 0 = land, sea-ice, or near-normal |anom| <= 0.25 C
    for idx in range(1, ANOM_PALETTE_COLORS + 1):
        val = VMIN + ((idx - 1) / (ANOM_PALETTE_COLORS - 1)) * (VMAX - VMIN)
        r, g, b = _sst_anom_rgb(val)
        palette[idx * 3] = r
        palette[idx * 3 + 1] = g
        palette[idx * 3 + 2] = b
        u = float(np.clip((abs(val) - ALPHA_LOW_C) / (ALPHA_HIGH_C - ALPHA_LOW_C), 0.0, 1.0))
        trns[idx] = int(round(255.0 * u * u * (3.0 - 2.0 * u)))
    return bytes(palette), bytes(trns)


def _build_palette(cmap_name: str) -> bytes:
    """Return a 768-byte RGB palette where index 0 is reserved for transparency."""
    cmap = matplotlib.colormaps[cmap_name]
    palette = bytearray(256 * 3)
    # Index 0 is transparent black; indices 1..N_PALETTE_COLORS cover [0, 1] of cmap
    for idx in range(1, N_PALETTE_COLORS + 1):
        t = (idx - 1) / (N_PALETTE_COLORS - 1)
        r, g, b, _ = cmap(t, bytes=True)
        palette[idx * 3] = int(r)
        palette[idx * 3 + 1] = int(g)
        palette[idx * 3 + 2] = int(b)
    return bytes(palette)


def _rasterize_land_mask(width: int = WIDTH, height: int = HEIGHT) -> np.ndarray:
    """Rasterize Natural Earth 10m land polygons onto equirectangular [-180,180]x[-90,90]."""
    gdf = gpd.read_file(f"zip://{NE_LAND_ZIP.as_posix()}")
    img = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(img)
    sx = width / 360.0
    sy = height / 180.0

    def to_px(coords: Any) -> List[Tuple[float, float]]:
        return [((lon + 180.0) * sx, (90.0 - lat) * sy) for lon, lat in coords]

    for geom in gdf.geometry:
        if geom is None:
            continue
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        for poly in polys:
            draw.polygon(to_px(poly.exterior.coords), fill=1)
            for hole in poly.interiors:
                draw.polygon(to_px(hole.coords), fill=0)
    return np.array(img, dtype=bool)


def _read_ersst_month(year: int, month: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    path = ERSST_DIR / f"ersst.v6.{year:04d}{month:02d}.nc"
    with xr.open_dataset(path) as ds:
        sst = np.asarray(ds["sst"].squeeze().values, dtype=np.float32)
        lat = np.asarray(ds["lat"].values, dtype=np.float64)
        lon = np.asarray(ds["lon"].values, dtype=np.float64)
    return sst, lat, lon


def _load_all_ersst_and_climatology() -> Tuple[Dict[Tuple[int, int], np.ndarray], Dict[int, np.ndarray], np.ndarray, np.ndarray]:
    """Load all 1979-01..2026-10 ERSST fields in one pass and compute 1991-2020 climatology."""
    monthly: Dict[Tuple[int, int], np.ndarray] = {}
    clim_accum: Dict[int, List[np.ndarray]] = {m: [] for m in range(1, 13)}
    lat_ref: np.ndarray | None = None
    lon_ref: np.ndarray | None = None
    for year, month in _iter_ym(START_YM, END_YM):
        sst, lat, lon = _read_ersst_month(year, month)
        if lat_ref is None:
            lat_ref, lon_ref = lat, lon
        monthly[(year, month)] = sst
        if CLIM_START <= year <= CLIM_END:
            clim_accum[month].append(sst)
    clim: Dict[int, np.ndarray] = {}
    for month in range(1, 13):
        arr = np.stack(clim_accum[month], axis=0)
        valid_count = np.sum(np.isfinite(arr), axis=0)
        summed = np.nansum(arr, axis=0)
        clim[month] = np.divide(
            summed,
            valid_count,
            out=np.full(arr.shape[1:], np.nan, dtype=np.float32),
            where=valid_count > 0,
        )
    assert lat_ref is not None and lon_ref is not None
    return monthly, clim, lat_ref, lon_ref


def _nino34_mean(anom: np.ndarray, lat: np.ndarray, lon: np.ndarray) -> float:
    """Area-weighted Niño-3.4 (5S-5N, 170W-120W i.e. 190-240E) anomaly in deg C."""
    m_lat = (lat >= -5.0) & (lat <= 5.0)
    m_lon = (lon >= 190.0) & (lon <= 240.0)
    sub = anom[np.ix_(m_lat, m_lon)]
    w = np.cos(np.deg2rad(lat[m_lat]))[:, None] * np.isfinite(sub)
    denom = float(np.sum(w))
    if denom <= 0.0:
        return 0.0
    return round(float(np.nansum(sub * w) / denom), 2)


def _iter_ym(start: Tuple[int, int], end: Tuple[int, int]) -> List[Tuple[int, int]]:
    y, m = start
    out: List[Tuple[int, int]] = []
    while (y, m) <= end:
        out.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def _build_chapters(history: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Select every strong/very strong El Niño and strong La Niña in 1979-2026, plus 2025-26."""
    chapters: List[Dict[str, Any]] = []
    for ep in history["episodes"]:
        start_yr = int(ep["start_center_ym"][:4])
        if start_yr < 1979:
            continue
        if ep["strength"] not in ("strong", "very strong"):
            continue
        start_y = ep["start_center_ym"][:4]
        end_y = ep["end_center_ym"][:4]
        cid = f"{start_y}-{end_y[-2:]}" if start_y != end_y else start_y
        phase_label = "El Niño" if ep["phase"] == "el_nino" else "La Niña"
        title = f"{start_y}–{end_y[-2:]} {phase_label}" if start_y != end_y else f"{start_y} {phase_label}"
        sign = "+" if ep["peak_anom_c"] >= 0 else ""
        note = (
            f"NOAA CPC RONI peaked at {sign}{ep['peak_anom_c']:.2f} °C "
            f"({ep['peak_center_ym']}) across {ep['n_overlapping_seasons']} consecutive overlapping 3-month seasons."
        )
        chapters.append(
            {
                "id": cid,
                "title": title,
                "start_ym": ep["start_center_ym"],
                "peak_ym": ep["peak_center_ym"],
                "end_ym": ep["end_center_ym"],
                "peak_anom_c": ep["peak_anom_c"],
                "phase": ep["phase"],
                "strength": ep["strength"],
                "note": note,
            }
        )

    # Current 2025-26 event (2025-26 La Niña followed by rapid 2026 El Niño warming through ASO 2026)
    latest = history["current"]
    chapters.append(
        {
            "id": "2025-26",
            "title": "2025–26 La Niña to El Niño",
            "start_ym": "2025-11",
            "peak_ym": latest.get("center_ym", "2026-09"),
            "end_ym": "2026-10",
            "peak_anom_c": latest["anom_c"],
            "phase": latest["phase"],
            "strength": "strong (developing)",
            "note": (
                f"2025–26 La Niña (-1.04 °C in NDJ 2025) flipped rapidly to +{latest['anom_c']:.2f} °C "
                f"in NOAA CPC RONI by {latest['latest_season']} (4 consecutive warm seasons through the latest table)."
            ),
        }
    )
    return chapters


def build_sst_global(out_root: Path) -> Path:
    """Build global 720x360 transparent-land SST anomaly PNGs and sst_global/index.json."""
    history = build_history_payload(REF_HISTORY_DIR)
    roni_phase_by_ym = {s["center_ym"]: s["phase"] for s in history["seasons"]}

    monthly, clim, lat, lon = _load_all_ersst_and_climatology()
    land_mask = _rasterize_land_mask(WIDTH, HEIGHT)
    palette, trns = _build_sst_anom_palette_and_trns()

    # Precompute nearest-neighbor ERSST index grid for (HEIGHT, WIDTH) without faking 2-deg detail
    px_lat = 89.75 - 0.5 * np.arange(HEIGHT)
    px_lon = -179.75 + 0.5 * np.arange(WIDTH)
    lat_idx = np.clip(np.rint((px_lat + 88.0) / 2.0).astype(int), 0, len(lat) - 1)
    lon_idx = np.rint((px_lon % 360.0) / 2.0).astype(int) % len(lon)
    grid_lat_idx = lat_idx[:, None]
    grid_lon_idx = lon_idx[None, :]

    target_dir = out_root / "sst_global"
    tmp_dir = Path(tempfile.mkdtemp(prefix=".tmp_sst_global_", dir=str(out_root)))

    frames: List[Dict[str, Any]] = []
    total_bytes = 0
    try:
        for year, month in _iter_ym(START_YM, END_YM):
            sst = monthly[(year, month)]
            anom = sst - clim[month]
            nino34 = _nino34_mean(anom, lat, lon)

            # Sample 2-degree ERSST onto 720x360 and mask land, missing/sea-ice, and |anom| <= 0.25 C
            grid_anom = anom[grid_lat_idx, grid_lon_idx]
            valid = np.isfinite(grid_anom) & (~land_mask) & (np.abs(grid_anom) > ALPHA_LOW_C)

            safe = np.where(valid, grid_anom, 0.0)
            scaled = np.clip((safe - VMIN) / (VMAX - VMIN), 0.0, 1.0)
            q = np.rint(scaled * (ANOM_PALETTE_COLORS - 1)).astype(np.uint8)
            indices = np.where(valid, 1 + q, 0).astype(np.uint8)

            img = Image.fromarray(indices, mode="P")
            img.putpalette(palette)
            fname = f"{year:04d}-{month:02d}.png"
            fpath = tmp_dir / fname
            img.save(fpath, format="PNG", transparency=trns, optimize=True)
            total_bytes += fpath.stat().st_size

            ym_str = format_ym(year, month)
            phase = roni_phase_by_ym.get(ym_str)
            if phase is None:
                # 2026-10 is one month past ASO 2026; classify by Niño-3.4 / latest state
                phase = "el_nino" if nino34 >= 0.5 else ("la_nina" if nino34 <= -0.5 else "neutral")

            frames.append(
                {
                    "ym": ym_str,
                    "file": fname,
                    "nino34_anom_c": nino34,
                    "roni_phase": phase,
                }
            )

        index_payload = {
            "units": "°C",
            "baseline": "1991–2020",
            "vmin": VMIN,
            "vmax": VMAX,
            "colormap": {
                "name": "sst_diverging_dark",
                "stops": _sst_anom_stops(VMIN, VMAX, n_stops=13),
                "alpha_rule": (
                    "Transparent (alpha = 0) for |anom| <= 0.25 °C; smooth ramp to fully opaque "
                    "(alpha = 255) for |anom| >= 1.0 °C; land and missing/sea-ice cells transparent."
                ),
            },
            "bbox": [-180, -90, 180, 90],
            "width": WIDTH,
            "height": HEIGHT,
            "source": "NOAA ERSST v6",
            "method": (
                "Monthly sea surface temperature minus 1991–2020 monthly climatology from NOAA ERSST v6 (2° grid), "
                "nearest-neighbor mapped to 720×360 equirectangular with Natural Earth 10m land, missing/sea-ice, and "
                "near-normal water (|anom| <= 0.25 °C) transparent (smooth fade to full opacity by |anom| >= 1.0 °C). "
                "Niño-3.4 area mean (5°S–5°N, 170°W–120°W) cosine-latitude weighted; chapters follow NOAA CPC RONI."
            ),
            "frame_count": len(frames),
            "total_size_bytes": total_bytes,
            "frames": frames,
            "chapters": _build_chapters(history),
        }
        (tmp_dir / "index.json").write_text(
            json.dumps(index_payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        if target_dir.exists():
            shutil.rmtree(target_dir)
        os.replace(tmp_dir, target_dir)
    except Exception:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
        raise

    print(
        f"[enso_history] wrote {target_dir.relative_to(out_root.parents[2])}: "
        f"{len(frames)} frames, {total_bytes / (1024 * 1024):.2f} MB, "
        f"{len(index_payload['chapters'])} chapters"
    )
    return target_dir


MONTH_NAMES: Tuple[str, ...] = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
CLIM_VMIN = -2.0
CLIM_VMAX = 32.0
CLIM_CMAP = "RdYlBu_r"


def build_sst_climatology(out_root: Path) -> Path:
    """Build 12 monthly 1991-2020 absolute SST climatology frames for the 'Normal year' globe toggle."""
    clim_accum: Dict[int, List[np.ndarray]] = {m: [] for m in range(1, 13)}
    lat: np.ndarray | None = None
    lon: np.ndarray | None = None
    for year in range(CLIM_START, CLIM_END + 1):
        for month in range(1, 13):
            sst, lat_m, lon_m = _read_ersst_month(year, month)
            if lat is None:
                lat, lon = lat_m, lon_m
            clim_accum[month].append(sst)
    assert lat is not None and lon is not None

    land_mask = _rasterize_land_mask(WIDTH, HEIGHT)
    palette = _build_palette(CLIM_CMAP)
    px_lat = 89.75 - 0.5 * np.arange(HEIGHT)
    px_lon = -179.75 + 0.5 * np.arange(WIDTH)
    lat_idx = np.clip(np.rint((px_lat + 88.0) / 2.0).astype(int), 0, len(lat) - 1)
    lon_idx = np.rint((px_lon % 360.0) / 2.0).astype(int) % len(lon)
    grid_lat_idx = lat_idx[:, None]
    grid_lon_idx = lon_idx[None, :]

    target_dir = out_root / "sst_climatology"
    tmp_dir = Path(tempfile.mkdtemp(prefix=".tmp_sst_clim_", dir=str(out_root)))
    frames: List[Dict[str, Any]] = []
    total_bytes = 0
    try:
        for month in range(1, 13):
            arr = np.stack(clim_accum[month], axis=0)
            valid_count = np.sum(np.isfinite(arr), axis=0)
            clim_m = np.divide(
                np.nansum(arr, axis=0),
                valid_count,
                out=np.full(arr.shape[1:], np.nan, dtype=np.float32),
                where=valid_count > 0,
            )
            grid_val = clim_m[grid_lat_idx, grid_lon_idx]
            valid = np.isfinite(grid_val) & (~land_mask)
            safe = np.where(valid, grid_val, 0.0)
            scaled = np.clip((safe - CLIM_VMIN) / (CLIM_VMAX - CLIM_VMIN), 0.0, 1.0)
            q = np.rint(scaled * (N_PALETTE_COLORS - 1)).astype(np.uint8)
            indices = np.where(valid, 1 + q, 0).astype(np.uint8)

            img = Image.fromarray(indices, mode="P")
            img.putpalette(palette)
            fname = f"{month:02d}.png"
            fpath = tmp_dir / fname
            img.save(fpath, format="PNG", transparency=0, optimize=True)
            total_bytes += fpath.stat().st_size

            nino34_abs = _nino34_mean(clim_m, lat, lon)
            frames.append(
                {
                    "month": month,
                    "ym": f"{month:02d}",
                    "label": MONTH_NAMES[month - 1],
                    "file": fname,
                    "nino34_sst_c": nino34_abs,
                }
            )

        index_payload = {
            "kind": "absolute",
            "units": "°C",
            "baseline": "1991–2020",
            "vmin": CLIM_VMIN,
            "vmax": CLIM_VMAX,
            "colormap": {
                "name": CLIM_CMAP,
                "stops": _colormap_stops(CLIM_CMAP, CLIM_VMIN, CLIM_VMAX, n_stops=13),
            },
            "bbox": [-180, -90, 180, 90],
            "width": WIDTH,
            "height": HEIGHT,
            "source": "NOAA ERSST v6",
            "method": (
                "1991–2020 monthly mean sea surface temperature (°C) from NOAA ERSST v6 (2° grid), "
                "nearest-neighbor mapped to 720×360 equirectangular with Natural Earth 10m land and missing/sea-ice cells transparent."
            ),
            "frame_count": 12,
            "total_size_bytes": total_bytes,
            "frames": frames,
        }
        (tmp_dir / "index.json").write_text(
            json.dumps(index_payload, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        if target_dir.exists():
            shutil.rmtree(target_dir)
        os.replace(tmp_dir, target_dir)
    except Exception:
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir, ignore_errors=True)
        raise

    print(
        f"[enso_history] wrote {target_dir.relative_to(out_root.parents[2])}: "
        f"12 climatology frames, {total_bytes / 1024:.1f} KB"
    )
    return target_dir
