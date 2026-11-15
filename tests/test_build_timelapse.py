"""Tests for anomaly timelapse builder and metadata contracts."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from scripts.build_timelapse import (
    build_palette,
    colormap_stops,
    compute_anomalies_and_scale,
    nice_symmetric_bound,
    render_anomaly_frame,
)

ROOT = Path(__file__).resolve().parents[1]
TIMELAPSE_ROOT = ROOT / "data" / "artifacts" / "timelapse"


def test_anomaly_baseline_and_symmetric_scale_on_synthetic_grid():
    years = list(range(1990, 2025))
    T = len(years)
    grid = np.zeros((T, 4, 6), dtype=np.float32)
    # 1991-2020 baseline has mean 10.0 on row 0, 20.0 elsewhere
    grid[:, 0, :] = 10.0
    grid[:, 1:, :] = 20.0
    # Add anomaly in 2023 (+2.0) and 2024 (-2.0)
    grid[years.index(2023), 0, :] = 12.0
    grid[years.index(2024), 1:, :] = 18.0
    grid[:, 3, 5] = np.nan

    anomalies, vmin, vmax = compute_anomalies_and_scale(years, grid)
    assert vmin == -vmax
    assert vmin < 0 < vmax
    assert anomalies[years.index(2023), 0, 0] == pytest.approx(2.0, abs=1e-4)
    assert anomalies[years.index(2024), 1, 0] == pytest.approx(-2.0, abs=1e-4)
    assert np.isnan(anomalies[:, 3, 5]).all()


def test_render_anomaly_frame_keeps_missing_transparent():
    anom = np.array([[np.nan, -1.0], [0.0, 1.0]], dtype=np.float32)
    palette = build_palette("BrBG")
    img = render_anomaly_frame(anom, -1.0, 1.0, palette)
    rgba = img.convert("RGBA")
    assert rgba.getpixel((0, 0))[3] == 0
    assert rgba.getpixel((1, 0))[3] == 255
    assert rgba.getpixel((1, 1))[3] == 255
    assert nice_symmetric_bound(1.42) >= 1.42 * 0.92
    stops = colormap_stops("BrBG", -1.0, 1.0, n_stops=11)
    assert len(stops) == 11
    assert stops[0][0] == -1.0 and stops[-1][0] == 1.0


def test_all_timelapse_sets_match_contract_and_size_budget():
    if not (TIMELAPSE_ROOT / "sm_DJF" / "index.json").is_file():
        pytest.skip("Full 4-metric timelapses not built yet")
    total_png_bytes = 0
    for slug in ("precip", "t2m", "aod", "sm"):
        for season in ("ANN", "DJF", "MAM", "JJA", "SON"):
            folder = TIMELAPSE_ROOT / f"{slug}_{season}"
            idx = json.loads((folder / "index.json").read_text(encoding="utf-8"))
            expected_baseline = "2001–2020" if slug == "sm" else "1991–2020"
            assert idx["anomaly_baseline"] == expected_baseline
            assert idx["extent"] == [-180, -90, 180, 90]
            assert idx["vmin"] == -idx["vmax"]
            assert len(idx["colormap"]["stops"]) >= 9
            assert len(idx["frames"]) == len(idx["years"])
            pngs = list(folder.glob("*.png"))
            assert len(pngs) == len(idx["years"])
            total_png_bytes += sum(p.stat().st_size for p in pngs)
    assert total_png_bytes < 25 * 1024 * 1024
