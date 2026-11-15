import json

import numpy as np

from scripts.build_precip_grid import FILL, encode, regrid_05_to_1
from backend.trend.stats import fdr_bh, inference_block


def test_cos_latitude_regrid_of_constant_field():
    lat = np.linspace(89.75, -89.75, 360)
    result = regrid_05_to_1(np.ones((360, 720)), lat)
    assert result.shape == (180, 360)
    assert np.allclose(result, 1.0)


def test_int16_encoder_uses_fill_and_rounding():
    assert encode(None, 0.01) == FILL
    assert encode(1.235, 0.01) == 124
    assert -32767 <= encode(500.0, 0.01) <= 32767


def test_tile_field_names_are_compact_json():
    tile = {"v_slug": "precip", "season": "DJF", "tile": [-80, -10],
            "cells": {"cell_-4.5_-79.5": {"s": FILL, "v": [142, FILL], "c": [1000, 0]}}}
    encoded = json.dumps(tile, separators=(",", ":"), sort_keys=False)
    assert '"cell_-4.5_-79.5"' in encoded
    assert len(encoded.encode("utf-8")) < 300_000


def test_fdr_all_null_has_no_significant_flags_and_known_signal_is_found():
    years = np.arange(1983, 2026)
    null = inference_block(years, np.full(years.size, np.nan))
    assert null["p_value"] is None
    assert not fdr_bh(np.full(100, null["p_value"] or np.nan), q=0.10).any()
    p = np.full(100, 0.5)
    p[:2] = [0.0001, 0.001]
    flags = fdr_bh(p, q=0.10)
    assert flags.sum() == 2
    assert flags[:2].all()


def test_generated_grid_tiles_stay_under_size_and_have_peru_cell():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid"
    tiles = list((root / "precip").glob("*/*.json"))
    assert tiles
    assert max(tile.stat().st_size for tile in tiles) < 300_000
    assert sum(tile.stat().st_size for tile in tiles) < 150_000_000
    peru_tile = json.loads((root / "precip" / "DJF" / "-80_-10.json").read_text(encoding="utf-8"))
    peru = peru_tile["cells"]["cell_-4.5_-79.5"]
    assert len(peru["v"]) == 42
    assert all(value == FILL or 0 <= value <= 32767 for value in peru["v"])
    assert isinstance(peru["fdr_significant"], bool)
    assert peru["strict_check_pass"] is None or isinstance(peru["strict_check_pass"], bool)
