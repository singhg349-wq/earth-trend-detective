"""Tests for ENSO history, global SST timelapse, and ENSO impact composites."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from backend.enso_history.history import classify_phase, classify_strength, detect_episodes
from backend.enso_history.impacts import compute_composite_and_fdr, detrend_grid_linear
from backend.enso_history.parsers import parse_roni_ascii

ROOT = Path(__file__).resolve().parents[1]
REF_HISTORY = ROOT / "data" / "reference" / "enso" / "history"
ENSO_ART = ROOT / "data" / "artifacts" / "enso_history"


def test_roni_parser_matches_known_noaa_peaks():
    roni = parse_roni_ascii(REF_HISTORY / "RONI.ascii.txt")
    assert roni[(1983, 1)]["anom_c"] == pytest.approx(2.40)
    assert roni[(1997, 12)]["anom_c"] == pytest.approx(2.28)
    assert roni[(2015, 12)]["anom_c"] == pytest.approx(2.25)
    assert roni[(1950, 1)]["anom_c"] == pytest.approx(-1.19)


def test_five_season_episode_rule_on_synthetic_series():
    # 4 warm seasons (not an episode), 1 neutral, 5 warm seasons (qualifies),
    # then a calendar gap splitting 3 + 3 cool seasons (neither qualifies).
    vals = [
        (1990, 1, 0.6), (1990, 2, 0.7), (1990, 3, 0.8), (1990, 4, 0.5),
        (1990, 5, 0.2),
        (1990, 6, 0.5), (1990, 7, 1.1), (1990, 8, 1.6), (1990, 9, 1.2), (1990, 10, 0.6),
        (1991, 1, -0.7), (1991, 2, -0.8), (1991, 3, -0.9),
        (1991, 5, -0.7), (1991, 6, -0.8), (1991, 7, -0.9),
    ]
    series = {
        (y, m): {
            "season": "JJA",
            "center_year": y,
            "center_month": m,
            "center_ym": f"{y:04d}-{m:02d}",
            "anom_c": v,
        }
        for y, m, v in vals
    }
    episodes = detect_episodes(series, threshold=0.5, min_seasons=5)
    assert len(episodes) == 1
    ep = episodes[0]
    assert ep["phase"] == "el_nino"
    assert ep["n_overlapping_seasons"] == 5
    assert ep["peak_anom_c"] == 1.6
    assert ep["strength"] == "strong"
    assert classify_phase(0.5) == "el_nino"
    assert classify_phase(-0.5) == "la_nina"
    assert classify_phase(0.49) == "neutral"
    assert classify_strength(2.0) == "very strong"


def test_composite_and_fdr_recovers_known_signal_on_synthetic_grid():
    rng = np.random.default_rng(42)
    years = np.arange(1980, 2020)
    T = years.size
    grid = rng.normal(0.0, 0.2, size=(T, 10, 10))
    en_mask = (years % 4 == 0)
    ln_mask = (years % 4 == 2)
    # Add linear trend everywhere plus a strong +3.0 El Nino signal in cells [0:2, 0:2]
    grid += 0.05 * (years - 2000)[:, None, None]
    grid[en_mask, 0:2, 0:2] += 1.5
    grid[ln_mask, 0:2, 0:2] -= 1.5

    resid = detrend_grid_linear(years, grid)
    diff, _, sig = compute_composite_and_fdr(resid, en_mask, ln_mask, n_perm=500, fdr_q=0.10, seed=7)
    assert np.all(diff[0:2, 0:2] > 2.5)
    assert sig[0:2, 0:2].all()
    assert sig[2:, 2:].sum() <= 2


def test_history_json_contract():
    path = ENSO_ART / "history.json"
    if not path.is_file():
        pytest.skip("history.json not built yet")
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["index"]["name"] == "RONI"
    assert len(data["seasons"]) >= 900
    assert len(data["episodes"]) >= 40
    assert data["current"]["latest_season"]
    assert "episodes_count" in data["also_traditional_oni"]


def test_sst_global_contract_when_built():
    idx_path = ENSO_ART / "sst_global" / "index.json"
    if not idx_path.is_file():
        pytest.skip("sst_global not built yet")
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    assert idx["width"] == 720 and idx["height"] == 360
    assert idx["bbox"] == [-180, -90, 180, 90]
    assert idx["vmin"] == -3 and idx["vmax"] == 3
    assert len(idx["frames"]) == 574
    assert idx["total_size_bytes"] <= 12 * 1024 * 1024
    assert len(idx["chapters"]) >= 9
    assert isinstance(idx["colormap"].get("alpha_rule"), str) and "0.25" in idx["colormap"]["alpha_rule"]
    assert idx["colormap"]["stops"][0][1] == "#0b3d91"
    assert idx["colormap"]["stops"][-1][1] == "#b3122e"

    # Check a land pixel (e.g. central Sahara 20N, 15E -> row=140, col=390) is transparent
    sample = Image.open(ENSO_ART / "sst_global" / "1997-12.png").convert("RGBA")
    assert sample.size == (720, 360)
    assert sample.getpixel((390, 140))[3] == 0
    # Neutral / near-zero ocean exists with alpha == 0 while Niño-3.4 peak is opaque
    arr = np.array(sample)
    assert int((arr[..., 3] == 0).sum()) > 100000
    assert int((arr[..., 3] == 255).sum()) > 10000
    # Check Niño-3.4 frame value in Dec 1997 is strongly warm (> +1.5 C)
    dec97 = next(f for f in idx["frames"] if f["ym"] == "1997-12")
    assert dec97["nino34_anom_c"] > 1.5


def test_impacts_contract_and_physical_sanity_when_built():
    idx_path = ENSO_ART / "impacts" / "index.json"
    if not idx_path.is_file():
        pytest.skip("impacts not built yet")
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    assert idx["width"] == 1440 and idx["height"] == 720
    by_id = {m["id"]: m for m in idx["maps"]}
    assert {"precip_DJF", "t2m_DJF", "aod_SON"} <= set(by_id.keys())
    precip_djf = by_id["precip_DJF"]
    reg = {r["region_id"]: r for r in precip_djf["region_summaries"]}
    # Physical sanity: El Nino DJF is drier in Indonesia/Amazon/Australia, wetter in East Africa/California;
    # and El Nino SON produces strong haze in Indonesia.
    assert reg["indonesia"]["diff"] < 0
    assert reg["amazon"]["diff"] < 0
    assert reg["australia"]["diff"] < 0
    assert reg["east_africa"]["diff"] > 0
    assert reg["california"]["diff"] > 0
    aod_son = by_id["aod_SON"]
    aod_reg = {r["region_id"]: r for r in aod_son["region_summaries"]}
    assert aod_reg["indonesia"]["diff"] > 0
    for m in idx["maps"]:
        assert isinstance(m["colormap"].get("alpha_rule"), str)
        for key in ("file", "overlay_file", "sig_file"):
            assert (ENSO_ART / "impacts" / m[key]).is_file()
    ovl = np.array(Image.open(ENSO_ART / "impacts" / "precip_DJF_overlay.png").convert("RGBA"))
    assert int((ovl[..., 3] == 0).sum()) > 100000
    assert int((ovl[..., 3] == 255).sum()) > 50000


def test_sst_climatology_contract_when_built():
    idx_path = ENSO_ART / "sst_climatology" / "index.json"
    if not idx_path.is_file():
        pytest.skip("sst_climatology not built yet")
    idx = json.loads(idx_path.read_text(encoding="utf-8"))
    assert idx["kind"] == "absolute"
    assert idx["vmin"] == -2.0 and idx["vmax"] == 32.0
    assert idx["width"] == 720 and idx["height"] == 360
    assert len(idx["frames"]) == 12
    sample = Image.open(ENSO_ART / "sst_climatology" / "01.png").convert("RGBA")
    assert sample.getpixel((390, 140))[3] == 0
