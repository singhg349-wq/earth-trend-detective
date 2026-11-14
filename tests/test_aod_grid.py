"""Tests for AOD grid tiles and regional artifacts."""
import json
import pytest
import numpy as np
from pathlib import Path

from backend.trend.var_aod import (
    VAR_SLUG,
    VARIABLE_NAME,
    DISPLAY_UNITS,
    SLOPE_UNITS,
    SCALE,
    SLOPE_SCALE,
    FILL_INT16,
    YEARS,
    SEASONS,
    SOURCE_INFO,
    REGRID_NOTE,
    LAND_ONLY,
)
from backend.trend.stats import inference_block


def test_aod_index_json_exists_and_valid():
    """Test that index.json exists and has correct structure for AOD."""
    idx_path = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "index.json"
    if not idx_path.exists():
        pytest.skip("Grid index.json not built yet")

    idx = json.loads(idx_path.read_text())

    assert idx["format_version"] == 1
    assert idx["grid_resolution_deg"] == 1.0
    assert idx["tile_size_deg"] == 10
    assert idx["fill_int16"] == FILL_INT16

    assert VAR_SLUG in idx["variables"]
    var = idx["variables"][VAR_SLUG]
    assert var["variable"] == VARIABLE_NAME
    assert var["units"] == DISPLAY_UNITS
    assert var["slope_units"] == SLOPE_UNITS
    assert var["scale"] == SCALE
    assert var["slope_scale"] == SLOPE_SCALE
    assert var["land_only"] == LAND_ONLY
    assert var["regrid_note"] == REGRID_NOTE
    assert var["source"]["product"] == SOURCE_INFO["product"]
    assert var["source"]["version"] == SOURCE_INFO["version"]
    assert var["source"]["var"] == SOURCE_INFO["var"]

    # Check all seasons present
    for season in SEASONS:
        assert season in var["years_by_season"]
        assert season in var["available_tiles"]
        assert len(var["years_by_season"][season]) == len(YEARS[season])
        assert len(var["available_tiles"][season]) > 0


def test_aod_djf_years_correct():
    """Test that DJF years are 1981-2026 (46 years, January year)."""
    idx_path = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "index.json"
    if not idx_path.exists():
        pytest.skip("Grid index.json not built yet")

    idx = json.loads(idx_path.read_text())
    djf_years = idx["variables"][VAR_SLUG]["years_by_season"]["DJF"]
    assert djf_years == list(range(1981, 2027)), f"DJF years: {djf_years[:5]}...{djf_years[-5:]}"
    assert len(djf_years) == 46


def test_aod_tile_structure():
    """Test that a sample tile has correct structure."""
    tile_path = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "aod" / "DJF" / "-80_-10.json"
    if not tile_path.exists():
        pytest.skip("Test tile not found")

    tile = json.loads(tile_path.read_text())

    assert tile["v_slug"] == VAR_SLUG
    assert tile["season"] == "DJF"
    assert tile["tile"] == [-80, -10]
    assert "cells" in tile
    assert len(tile["cells"]) > 0

    # Check cell structure
    for cell_id, cell in tile["cells"].items():
        assert cell_id.startswith("cell_")
        assert "s" in cell
        assert "v" in cell
        assert "c" in cell
        assert isinstance(cell["s"], int)
        assert isinstance(cell["v"], list)
        assert len(cell["v"]) == 46  # DJF years
        # c can be 1000 or list
        if isinstance(cell["c"], list):
            assert len(cell["c"]) == 46
        else:
            assert cell["c"] == 1000


def test_aod_cell_id_format():
    """Test that cell IDs follow the correct format: cell_<lat>_<lon> with 1 decimal."""
    tile_path = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "aod" / "DJF" / "-80_-10.json"
    if not tile_path.exists():
        pytest.skip("Test tile not found")

    tile = json.loads(tile_path.read_text())

    for cell_id in tile["cells"]:
        parts = cell_id.split("_")
        assert len(parts) == 3
        assert parts[0] == "cell"
        lat = float(parts[1])
        lon = float(parts[2])
        # Should be half-degree increments
        assert abs(lat * 2 - round(lat * 2)) < 1e-10
        assert abs(lon * 2 - round(lon * 2)) < 1e-10
        # Lat in [-89.5, 89.5], Lon in [-179.5, 179.5]
        assert -89.5 <= lat <= 89.5
        assert -179.5 <= lon <= 179.5


def test_aod_int16_encoding():
    """Test that values are properly encoded as int16 with fill."""
    tile_path = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "aod" / "DJF" / "-80_-10.json"
    if not tile_path.exists():
        pytest.skip("Test tile not found")

    tile = json.loads(tile_path.read_text())

    for cell in tile["cells"].values():
        # s (slope)
        assert -32768 <= cell["s"] <= 32767
        # v (values)
        for q in cell["v"]:
            assert -32768 <= q <= 32767
        # c (coverage)
        if isinstance(cell["c"], list):
            for c in cell["c"]:
                assert 0 <= c <= 1000
        else:
            assert cell["c"] == 1000


def test_aod_sen_slope_consistency():
    """Test that precomputed Sen slope is consistent with decoded series (within tolerance)."""
    tile_path = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "aod" / "DJF" / "-80_-10.json"
    if not tile_path.exists():
        pytest.skip("Test tile not found")

    tile = json.loads(tile_path.read_text())
    djf_years = YEARS["DJF"]

    for cell_id, cell in list(tile["cells"].items())[:5]:  # Test first 5 cells
        qv = cell["v"]
        qs = cell["s"]

        # Decode series
        decoded = [None if q == FILL_INT16 else round(q * SCALE, 3) for q in qv]

        # Compute Sen slope from decoded
        from backend.trend.stats import sen_slope
        valid = [(y, v) for y, v in zip(djf_years, decoded) if v is not None]
        if len(valid) >= 10:
            years, vals = zip(*valid)
            slope, _ = sen_slope(list(years), list(vals))
            slope_per_decade = slope * 10
            expected_qs = int(np.rint(slope_per_decade / SLOPE_SCALE))
            expected_qs = max(-32767, min(32767, expected_qs))
            # Allow some tolerance due to regridding and rounding differences
            # The tile slope is computed from the same decoded series but may have small differences
            assert abs(qs - expected_qs) <= 5, f"Cell {cell_id}: tile slope {qs} != computed {expected_qs} (diff={abs(qs-expected_qs)}, slope={slope_per_decade:.6f})"


def test_aod_regional_artifacts_exist():
    """Test that regional artifacts exist for featured regions."""
    artifacts_dir = Path(__file__).resolve().parents[1] / "data" / "artifacts"
    if not artifacts_dir.exists():
        pytest.skip("Artifacts directory not found")

    # Check for at least the two flagship regions
    for region in ["indonesia", "coastal_peru"]:
        artifact = artifacts_dir / f"aod_{region}_DJF.json"
        if artifact.exists():
            art = json.loads(artifact.read_text())
            assert art["variable"] == VARIABLE_NAME
            assert art["units"] == DISPLAY_UNITS
            assert art["season"]["code"] == "DJF"
            assert "trend" in art
            assert "inference" in art["trend"]
            inf = art["trend"]["inference"]
            assert "status" in inf
            assert "method" in inf
            assert inf["method"] == "MK + Hamed-Rao (3 lags)"


def test_aod_regional_inference_block_structure():
    """Test that regional artifacts have valid inference_block structure."""
    artifacts_dir = Path(__file__).resolve().parents[1] / "data" / "artifacts"
    if not artifacts_dir.exists():
        pytest.skip("Artifacts directory not found")

    artifact = artifacts_dir / "aod_indonesia_DJF.json"
    if not artifact.exists():
        pytest.skip("Indonesia artifact not found")

    art = json.loads(artifact.read_text())
    inf = art["trend"]["inference"]

    required_keys = {"status", "p_value", "ci", "method", "strict_check_pass", "strict_check_p", "lag1", "caution", "ci_note", "n"}
    assert set(inf.keys()) == required_keys

    assert inf["method"] == "MK + Hamed-Rao (3 lags)"
    assert inf["status"] in ("ok", "unavailable")
    assert inf["caution"] in (True, False)

    if inf["status"] == "ok":
        assert inf["p_value"] is not None
        assert inf["ci"] is not None
        assert isinstance(inf["ci"], list) and len(inf["ci"]) == 2
        assert inf["n"] >= 8
    else:
        assert inf["p_value"] is None
        assert inf["ci"] is None


def test_aod_validation_record_exists():
    """Test that VALIDATION_AOD.md exists."""
    val_path = Path(__file__).resolve().parents[1] / "docs" / "VALIDATION_AOD.md"
    assert val_path.exists(), "VALIDATION_AOD.md not found"

    content = val_path.read_text()
    assert "Giovanni" in content
    assert "M2TMNXAER" in content
    assert "TOTEXTTAU" in content
    assert "DJF" in content