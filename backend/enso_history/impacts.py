"""Global ENSO composite impact maps (El Niño minus La Niña) from our 1-degree grids."""

from __future__ import annotations

import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Sequence, Tuple

import geopandas as gpd
import matplotlib
import numpy as np
from PIL import Image, ImageDraw
from shapely.geometry import box
from shapely.prepared import prep

from backend.enso_history.history import build_history_payload
from backend.trend.grid_io import load_seasonal_grid
from backend.trend.regions import REGIONS
from backend.trend.stats import fdr_bh

matplotlib.use("Agg")

ROOT = Path(__file__).resolve().parents[2]
GRID_ROOT = ROOT / "data" / "artifacts" / "grid"
REGIONS_GEOJSON = ROOT / "data" / "artifacts" / "regions.geojson"
REF_HISTORY_DIR = ROOT / "data" / "reference" / "enso" / "history"
NE_LAND_ZIP = Path(r"D:\trend-detective-data\raw\NaturalEarth_5.1.1\ne_10m_land.zip")

WIDTH = 1440
HEIGHT = 720
SCALE_FACTOR = 4  # 360x180 -> 1440x720 exact nearest-neighbor 1-deg blocks
FDR_Q = 0.10
N_PERMUTATIONS = 2000
N_BOOTSTRAP = 2000
SEED = 20261115

NICE_BOUNDS: Tuple[float, ...] = (
    0.05, 0.08, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75,
    1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 7.5, 10.0,
)

IMPACT_SPECS: Tuple[Dict[str, str], ...] = (
    {
        "id": "precip_DJF",
        "slug": "precip",
        "variable": "precipitation",
        "season": "DJF",
        "label": "Rainfall, Dec–Feb: El Niño minus La Niña",
        "units": "mm/day",
        "cmap": "BrBG",
    },
    {
        "id": "t2m_DJF",
        "slug": "t2m",
        "variable": "temperature",
        "season": "DJF",
        "label": "Temperature, Dec–Feb: El Niño minus La Niña",
        "units": "°C",
        "cmap": "RdBu_r",
    },
    {
        "id": "aod_SON",
        "slug": "aod",
        "variable": "aerosol_optical_depth",
        "season": "SON",
        "label": "Aerosols (haze), Sep–Nov: El Niño minus La Niña",
        "units": "AOD",
        "cmap": "PuOr_r",
    },
    {
        "id": "precip_JJA",
        "slug": "precip",
        "variable": "precipitation",
        "season": "JJA",
        "label": "Rainfall, Jun–Aug: El Niño minus La Niña",
        "units": "mm/day",
        "cmap": "BrBG",
    },
    {
        "id": "t2m_JJA",
        "slug": "t2m",
        "variable": "temperature",
        "season": "JJA",
        "label": "Temperature, Jun–Aug: El Niño minus La Niña",
        "units": "°C",
        "cmap": "RdBu_r",
    },
    {
        "id": "sm_DJF",
        "slug": "sm",
        "variable": "soil_moisture",
        "season": "DJF",
        "label": "Soil moisture (0–10 cm), Dec–Feb: El Niño minus La Niña",
        "units": "kg/m²",
        "cmap": "BrBG",
    },
)


def _nice_bound(raw_abs: float) -> float:
    if not np.isfinite(raw_abs) or raw_abs <= 0:
        return 1.0
    for c in NICE_BOUNDS:
        if c >= raw_abs * 0.92:
            return float(c)
    return float(np.ceil(raw_abs))


def _colormap_stops(cmap_name: str, vmin: float, vmax: float, n_stops: int = 11) -> List[List[Any]]:
    cmap = matplotlib.colormaps[cmap_name]
    stops: List[List[Any]] = []
    for i in range(n_stops):
        t = i / (n_stops - 1)
        val = round(vmin + t * (vmax - vmin), 4)
        r, g, b, _ = cmap(t, bytes=True)
        stops.append([val, f"#{int(r):02x}{int(g):02x}{int(b):02x}"])
    return stops


def _build_palette_and_trns(cmap_name: str, vmin: float, vmax: float) -> Tuple[bytes, bytes, float, float]:
    """Build RGB palette + per-index tRNS fading near-zero values to transparent."""
    cmap = matplotlib.colormaps[cmap_name]
    abs_max = max(abs(vmin), abs(vmax))
    alpha_low = abs_max / 12.0   # matches 0.25 / 3.0 in SST
    alpha_high = abs_max / 3.0   # matches 1.0 / 3.0 in SST
    palette = bytearray(256 * 3)
    trns = bytearray(256)
    trns[0] = 0
    for idx in range(1, 256):
        t = (idx - 1) / 254.0
        val = vmin + t * (vmax - vmin)
        r, g, b, _ = cmap(t, bytes=True)
        palette[idx * 3] = int(r)
        palette[idx * 3 + 1] = int(g)
        palette[idx * 3 + 2] = int(b)
        u = float(np.clip((abs(val) - alpha_low) / max(alpha_high - alpha_low, 1e-12), 0.0, 1.0))
        trns[idx] = int(round(255.0 * u * u * (3.0 - 2.0 * u)))
    return bytes(palette), bytes(trns), alpha_low, alpha_high


def detrend_grid_linear(years: Sequence[int], grid: np.ndarray) -> np.ndarray:
    """Linearly detrend each cell's time series along axis 0, returning residuals."""
    t = np.asarray(years, dtype=np.float64)
    arr = np.asarray(grid, dtype=np.float64)
    all_valid = np.all(np.isfinite(arr), axis=0)
    resid = np.full_like(arr, np.nan, dtype=np.float64)

    # Fast vectorized OLS for complete cells
    if all_valid.any():
        t_c = t - t.mean()
        denom = float(np.sum(t_c * t_c))
        y_sub = arr[:, all_valid]
        y_mean = y_sub.mean(axis=0)
        slope = np.sum(t_c[:, None] * (y_sub - y_mean[None, :]), axis=0) / denom
        resid[:, all_valid] = y_sub - (y_mean[None, :] + slope[None, :] * t_c[:, None])

    # Fallback for any cell with missing years
    partial_rows, partial_cols = np.where(~all_valid)
    for r, c in zip(partial_rows, partial_cols):
        y = arr[:, r, c]
        good = np.isfinite(y)
        if int(good.sum()) < 10:
            continue
        tg = t[good]
        yg = y[good]
        tg_c = tg - tg.mean()
        denom = float(np.sum(tg_c * tg_c))
        if denom <= 0:
            continue
        slope = float(np.sum(tg_c * (yg - yg.mean())) / denom)
        resid[good, r, c] = yg - (yg.mean() + slope * tg_c)

    return resid


def compute_composite_and_fdr(
    resid: np.ndarray,
    en_mask: np.ndarray,
    ln_mask: np.ndarray,
    n_perm: int = N_PERMUTATIONS,
    fdr_q: float = FDR_Q,
    seed: int = SEED,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute (El Nino - La Nina) composite, two-sided permutation p-values, and BH FDR mask."""
    en_vals = resid[en_mask]
    ln_vals = resid[ln_mask]

    en_valid = np.sum(np.isfinite(en_vals), axis=0)
    ln_valid = np.sum(np.isfinite(ln_vals), axis=0)
    valid_cell = (en_valid >= 3) & (ln_valid >= 3)

    mean_en = np.divide(
        np.nansum(en_vals, axis=0),
        en_valid,
        out=np.full(resid.shape[1:], np.nan, dtype=np.float64),
        where=valid_cell,
    )
    mean_ln = np.divide(
        np.nansum(ln_vals, axis=0),
        ln_valid,
        out=np.full(resid.shape[1:], np.nan, dtype=np.float64),
        where=valid_cell,
    )
    diff = mean_en - mean_ln

    # Fast vectorized permutation test over complete ENSO years (fallback handles any partial cells)
    pool = resid[en_mask | ln_mask]
    n_en = int(en_mask.sum())
    n_ln = int(ln_mask.sum())
    n_tot = n_en + n_ln

    complete_pool = valid_cell & np.all(np.isfinite(pool), axis=0)
    pvals = np.full(resid.shape[1:], np.nan, dtype=np.float64)

    if complete_pool.any():
        pool_flat = pool[:, complete_pool].astype(np.float32)  # (n_tot, M)
        sum_tot = pool_flat.sum(axis=0)
        obs_abs = np.abs(diff[complete_pool]).astype(np.float32)
        exceed = np.zeros(pool_flat.shape[1], dtype=np.int32)
        rng = np.random.default_rng(seed)
        inv_en = np.float32(1.0 / n_en)
        inv_ln = np.float32(1.0 / n_ln)
        scale_en = np.float32(inv_en + inv_ln)
        ln_term = sum_tot * inv_ln
        for _ in range(n_perm):
            idx = rng.permutation(n_tot)[:n_en]
            sum_en = pool_flat[idx].sum(axis=0)
            perm_diff = sum_en * scale_en - ln_term
            exceed += (np.abs(perm_diff) >= obs_abs)
        pvals[complete_pool] = (exceed.astype(np.float64) + 1.0) / (n_perm + 1.0)

    # Rare partial cells (if any)
    part_r, part_c = np.where(valid_cell & (~complete_pool))
    if part_r.size > 0:
        rng_p = np.random.default_rng(seed + 1)
        for r, c in zip(part_r, part_c):
            x_en = en_vals[:, r, c]
            x_ln = ln_vals[:, r, c]
            x_en = x_en[np.isfinite(x_en)]
            x_ln = x_ln[np.isfinite(x_ln)]
            comb = np.concatenate([x_en, x_ln])
            k_en = x_en.size
            obs = abs(float(x_en.mean() - x_ln.mean()))
            cnt = 0
            for _ in range(n_perm):
                p = rng_p.permutation(comb.size)
                d = abs(float(comb[p[:k_en]].mean() - comb[p[k_en:]].mean()))
                if d >= obs:
                    cnt += 1
            pvals[r, c] = (cnt + 1.0) / (n_perm + 1.0)

    sig_flat = fdr_bh(pvals.ravel(), q=fdr_q)
    sig_mask = sig_flat.reshape(resid.shape[1:]) & valid_cell
    return diff, pvals, sig_mask


def _load_region_masks() -> List[Tuple[str, str, np.ndarray]]:
    """Build cos(lat)-weighted 1-degree masks for the 10 regions in regions.geojson."""
    gj = json.loads(REGIONS_GEOJSON.read_text(encoding="utf-8"))
    labels = {r["id"]: r["label"] for r in REGIONS}
    from shapely.geometry import shape

    cos_lat = np.cos(np.deg2rad(89.5 - np.arange(180)))[:, None]
    out: List[Tuple[str, str, np.ndarray]] = []
    for feat in gj["features"]:
        rid = feat["properties"]["id"]
        geom = shape(feat["geometry"])
        prepared = prep(geom)
        mask = np.zeros((180, 360), dtype=bool)
        minx, miny, maxx, maxy = geom.bounds
        row_lo = max(0, int(np.floor(89.5 - maxy)))
        row_hi = min(179, int(np.ceil(89.5 - miny)))
        col_lo = max(0, int(np.floor(minx + 179.5)))
        col_hi = min(359, int(np.ceil(maxx + 179.5)))
        for r in range(row_lo, row_hi + 1):
            lat_sw = 89 - r
            for c in range(col_lo, col_hi + 1):
                lon_sw = c - 180
                cell_box = box(lon_sw, lat_sw, lon_sw + 1, lat_sw + 1)
                if prepared.intersects(cell_box):
                    mask[r, c] = True
        weights = np.where(mask, cos_lat, 0.0)
        out.append((rid, labels.get(rid, rid), weights))
    return out


def compute_region_summaries(
    resid: np.ndarray,
    en_mask: np.ndarray,
    ln_mask: np.ndarray,
    units: str,
    region_masks: List[Tuple[str, str, np.ndarray]],
    n_boot: int = N_BOOTSTRAP,
    seed: int = SEED,
) -> List[Dict[str, Any]]:
    """Compute area-weighted regional mean composite differences + bootstrap 95% CIs."""
    rng = np.random.default_rng(seed)
    summaries: List[Dict[str, Any]] = []
    T = resid.shape[0]
    flat_resid = resid.reshape(T, -1)

    for rid, label, weights in region_masks:
        w_flat = weights.ravel()
        active = w_flat > 0
        if not active.any():
            continue
        w_sub = w_flat[active]
        y_sub = flat_resid[:, active]
        finite_y = np.isfinite(y_sub)
        w_mat = np.where(finite_y, w_sub[None, :], 0.0)
        denom = w_mat.sum(axis=1)
        reg_series = np.divide(
            np.nansum(y_sub * w_mat, axis=1),
            denom,
            out=np.full(T, np.nan, dtype=np.float64),
            where=denom > 0,
        )

        en_vals = reg_series[en_mask]
        ln_vals = reg_series[ln_mask]
        en_vals = en_vals[np.isfinite(en_vals)]
        ln_vals = ln_vals[np.isfinite(ln_vals)]
        if en_vals.size < 3 or ln_vals.size < 3:
            continue

        diff = float(en_vals.mean() - ln_vals.mean())
        en_samples = rng.choice(en_vals, size=(n_boot, en_vals.size), replace=True).mean(axis=1)
        ln_samples = rng.choice(ln_vals, size=(n_boot, ln_vals.size), replace=True).mean(axis=1)
        boot_diffs = en_samples - ln_samples
        ci_low, ci_high = np.percentile(boot_diffs, [2.5, 97.5])
        significant = bool(ci_low > 0.0 or ci_high < 0.0)

        digits = 3 if units == "AOD" else 2
        summaries.append(
            {
                "region_id": rid,
                "label": label,
                "diff": round(diff, digits),
                "ci_low": round(float(ci_low), digits),
                "ci_high": round(float(ci_high), digits),
                "significant": significant,
                "units": units,
            }
        )
    return summaries


def _load_coastline_segments() -> List[List[Tuple[float, float]]]:
    gdf = gpd.read_file(f"zip://{NE_LAND_ZIP.as_posix()}")
    sx = WIDTH / 360.0
    sy = HEIGHT / 180.0
    lines: List[List[Tuple[float, float]]] = []

    def add_ring(coords: Any) -> None:
        pts = [((lon + 180.0) * sx, (90.0 - lat) * sy) for lon, lat in coords]
        if len(pts) >= 2:
            lines.append(pts)

    for geom in gdf.geometry:
        if geom is None:
            continue
        polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
        for poly in polys:
            add_ring(poly.exterior.coords)
            for hole in poly.interiors:
                add_ring(hole.coords)
    return lines


def _render_impact_pngs(
    map_id: str,
    diff: np.ndarray,
    sig_mask: np.ndarray,
    vmin: float,
    vmax: float,
    cmap_name: str,
    coastlines: List[List[Tuple[float, float]]],
    out_dir: Path,
) -> Tuple[int, int, int, float, float]:
    """Write <id>_overlay.png, <id>_sig.png, and <id>.png at 1440x720."""
    palette, trns, alpha_low, alpha_high = _build_palette_and_trns(cmap_name, vmin, vmax)
    valid = np.isfinite(diff) & (np.abs(diff) > alpha_low)
    safe = np.where(valid, diff, 0.0)
    scaled = np.clip((safe - vmin) / (vmax - vmin), 0.0, 1.0)
    idx_180 = np.where(valid, 1 + np.rint(scaled * 254.0), 0).astype(np.uint8)

    # Upscale 360x180 -> 1440x720 exact nearest neighbor (4x4 per 1-degree cell)
    idx_720 = np.repeat(np.repeat(idx_180, SCALE_FACTOR, axis=0), SCALE_FACTOR, axis=1)
    overlay_img = Image.fromarray(idx_720, mode="P")
    overlay_img.putpalette(palette)
    overlay_path = out_dir / f"{map_id}_overlay.png"
    overlay_img.save(overlay_path, format="PNG", transparency=trns, optimize=True)

    # Stipple-only layer (1440x720 transparent RGBA with crisp 2x2 dark dots inside sig cells)
    sig_rgba = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    sig_r, sig_c = np.where(sig_mask)
    if sig_r.size > 0:
        # Place a crisp 1-px dark dot + 1-px light dot offset on alternating cells for contrast
        y_px = sig_r * SCALE_FACTOR + 1 + ((sig_r + sig_c) % 2)
        x_px = sig_c * SCALE_FACTOR + 1 + ((sig_r + sig_c) % 2)
        sig_rgba[y_px, x_px] = (15, 23, 42, 235)
        sig_rgba[y_px, np.minimum(x_px + 1, WIDTH - 1)] = (248, 250, 252, 190)
    sig_img = Image.fromarray(sig_rgba, mode="RGBA")
    sig_path = out_dir / f"{map_id}_sig.png"
    sig_img.save(sig_path, format="PNG", optimize=True)

    # Combined static map (<id>.png): dark ocean/backdrop + transparent overlay + coastlines + stippling
    base = Image.new("RGBA", (WIDTH, HEIGHT), (11, 19, 32, 255))
    overlay_rgba = overlay_img.convert("RGBA")
    base = Image.alpha_composite(base, overlay_rgba)
    draw = ImageDraw.Draw(base)
    for pts in coastlines:
        draw.line(pts, fill=(226, 232, 240, 175), width=1)
    base.alpha_composite(sig_img)
    combined_path = out_dir / f"{map_id}.png"
    base.save(combined_path, format="PNG", optimize=True)

    return (
        combined_path.stat().st_size,
        overlay_path.stat().st_size,
        sig_path.stat().st_size,
        alpha_low,
        alpha_high,
    )


def build_impacts(out_root: Path) -> Path:
    """Build all ENSO impact composites, stipple masks, overlays, and impacts/index.json."""
    history = build_history_payload(REF_HISTORY_DIR)
    phase_by_sy = {(s["season"], int(s["year"])): s["phase"] for s in history["seasons"]}

    region_masks = _load_region_masks()
    coastlines = _load_coastline_segments()

    target_dir = out_root / "impacts"
    tmp_dir = Path(tempfile.mkdtemp(prefix=".tmp_impacts_", dir=str(out_root)))
    maps_out: List[Dict[str, Any]] = []
    total_bytes = 0

    try:
        for spec in IMPACT_SPECS:
            map_id = spec["id"]
            slug = spec["slug"]
            season = spec["season"]

            years, grid, _ = load_seasonal_grid(GRID_ROOT, slug, season)
            phases = [phase_by_sy[(season, int(y))] for y in years]
            en_mask = np.array([p == "el_nino" for p in phases], dtype=bool)
            ln_mask = np.array([p == "la_nina" for p in phases], dtype=bool)

            resid = detrend_grid_linear(years, grid)
            diff, _, sig_mask = compute_composite_and_fdr(resid, en_mask, ln_mask)

            finite_diff = diff[np.isfinite(diff)]
            p2, p98 = np.percentile(finite_diff, [2.0, 98.0])
            vmax = _nice_bound(float(max(abs(p2), abs(p98))))
            vmin = -vmax

            b_comb, b_ovl, b_sig, alpha_low, alpha_high = _render_impact_pngs(
                map_id, diff, sig_mask, vmin, vmax, spec["cmap"], coastlines, tmp_dir
            )
            total_bytes += b_comb + b_ovl + b_sig

            valid_count = int(np.isfinite(diff).sum())
            sig_frac = round(float(sig_mask.sum()) / max(1, valid_count), 4)
            region_summaries = compute_region_summaries(
                resid, en_mask, ln_mask, spec["units"], region_masks
            )

            years_en = [int(y) for y, m in zip(years, en_mask) if m]
            years_ln = [int(y) for y, m in zip(years, ln_mask) if m]

            maps_out.append(
                {
                    "id": map_id,
                    "variable": spec["variable"],
                    "slug": slug,
                    "season": season,
                    "label": spec["label"],
                    "units": spec["units"],
                    "file": f"{map_id}.png",
                    "overlay_file": f"{map_id}_overlay.png",
                    "sig_file": f"{map_id}_sig.png",
                    "vmin": vmin,
                    "vmax": vmax,
                    "colormap": {
                        "name": spec["cmap"],
                        "stops": _colormap_stops(spec["cmap"], vmin, vmax, n_stops=11),
                        "alpha_rule": (
                            f"Transparent (alpha = 0) for |diff| <= {alpha_low:.3g} {spec['units']}; "
                            f"smooth ramp to fully opaque (alpha = 255) for |diff| >= {alpha_high:.3g} {spec['units']}."
                        ),
                    },
                    "years_el_nino": years_en,
                    "years_la_nina": years_ln,
                    "n_el_nino": len(years_en),
                    "n_la_nina": len(years_ln),
                    "method": (
                        f"Linearly detrended 1° seasonal series classified by NOAA CPC RONI (±0.5 °C); "
                        f"composite El Niño minus La Niña; two-sided permutation test ({N_PERMUTATIONS} permutations, "
                        f"seed {SEED}) with Benjamini–Hochberg false discovery rate at q = {FDR_Q:.2f}; "
                        f"region CIs from stratified bootstrap ({N_BOOTSTRAP} resamples)."
                    ),
                    "fdr_q": FDR_Q,
                    "significant_fraction": sig_frac,
                    "region_summaries": region_summaries,
                }
            )
            print(
                f"[impacts] {map_id}: {len(years_en)} El Niño vs {len(years_ln)} La Niña years, "
                f"scale=[{vmin}, +{vmax}] {spec['units']}, FDR sig={sig_frac*100:.1f}%, "
                f"PNGs={(b_comb+b_ovl+b_sig)/1024:.0f} KB"
            )

        payload = {
            "bbox": [-180, -90, 180, 90],
            "width": WIDTH,
            "height": HEIGHT,
            "total_size_bytes": total_bytes,
            "maps": maps_out,
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

    print(
        f"[enso_history] wrote {target_dir.relative_to(ROOT)}: "
        f"{len(maps_out)} impact maps, {total_bytes / (1024 * 1024):.2f} MB total PNGs"
    )
    return target_dir
