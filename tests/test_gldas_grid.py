"""Tests for GLDAS grid tiles and regional artifacts."""
import json
import pytest
import numpy as np
from pathlib import Path

from backend.trend.var_gldas import (
    VAR_SLUG,
    VARIABLE_NAME,
    DISPLAY_UNITS,
    SLOPE_UNITS,
    SCALE,
    SLOPE_SCALE,
    FILL_INT16,
    YEARS,
    SEASONS,
    SOIL_SOURCE,
    SWE_SOURCE,
    REGRID_NOTE,
    LAND_ONLY,
    SOIL_VAR,
    SWE_VAR,
)
from backend.trend.stats import inference_block


def test_gldas_index_json_exists_and_valid():
    """Test that index.json exists and has correct structure for soil."""
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
    assert var["source"]["product"] == SOIL_SOURCE["product"]
    assert var["source"]["version"] == SOIL_SOURCE["version"]
    assert var["source"]["var"] == SOIL_SOURCE["var"]

    # Check all seasons present
    for season in SEASONS:
        assert season in var["years_by_season"]
        assert season in var["available_tiles"]
        assert len(var["years_by_season"][season]) == len(YEARS[season])


def test_gldas_djf_years_correct():
    """Test that DJF years are 2001-2026 (26 years, January year)."""
    idx_path = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "index.json"
    if not idx_path.exists():
        pytest.skip("Grid index.json not built yet")

    idx = json.loads(idx_path.read_text())
    djf_years = idx["variables"][VAR_SLUG]["years_by_season"]["DJF"]
    assert djf_years == list(range(2001, 2027)), f"DJF years: {djf_years}"
    assert len(djf_years) == 26


def test_gldas_tile_structure():
    """Test that a sample tile has correct structure (land-only)."""
    # Find any tile
    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "soil" / "DJF"
    if not root.exists():
        pytest.skip("Soil DJF tiles not built yet")

    tile_files = list(root.glob("*.json"))
    if not tile_files:
        pytest.skip("No soil tiles found")

    tile_file = tile_files[0]
    tile = json.loads(tile_file.read_text())

    assert tile["v_slug"] == VAR_SLUG
    assert tile["season"] == "DJF"
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
        assert len(cell["v"]) == 26  # DJF years
        if isinstance(cell["c"], list):
            assert len(cell["c"]) == 26
        else:
            assert cell["c"] == 1000


def test_gldas_cell_id_format():
    """Test that cell IDs follow the correct format: cell_<lat>_<lon> with 1 decimal."""
    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "soil" / "DJF"
    if not root.exists():
        pytest.skip("Soil DJF tiles not built yet")

    tile_files = list(root.glob("*.json"))
    if not tile_files:
        pytest.skip("No soil tiles found")

    tile = json.loads(tile_files[0].read_text())

    for cell_id in tile["cells"]:
        parts = cell_id.split("_")
        assert len(parts) == 3
        assert parts[0] == "cell"
        lat = float(parts[1])
        lon = float(parts[2])
        assert abs(lat * 2 - round(lat * 2)) < 1e-10
        assert abs(lon * 2 - round(lon * 2)) < 1e-10
        assert -59.5 <= lat <= 89.5, f"Lat {lat} outside GLDAS range"
        assert -179.5 <= lon <= 179.5


def test_gldas_int16_encoding():
    """Test that values are properly encoded as int16 with fill."""
    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "soil" / "DJF"
    if not root.exists():
        pytest.skip("Soil DJF tiles not built yet")

    tile_files = list(root.glob("*.json"))
    if not tile_files:
        pytest.skip("No soil tiles found")

    tile = json.loads(tile_files[0].read_text())

    for cell in tile["cells"].values():
        assert -32768 <= cell["s"] <= 32767
        for q in cell["v"]:
            assert -32768 <= q <= 32767
        if isinstance(cell["c"], list):
            for c in cell["c"]:
                assert 0 <= c <= 1000
        else:
            assert cell["c"] == 1000


def test_gldas_sen_slope_consistency():
    """Test that precomputed Sen slope matches decoded series."""
    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "soil" / "DJF"
    if not root.exists():
        pytest.skip("Soil DJF tiles not built yet")

    tile_files = list(root.glob("*.json"))
    if not tile_files:
        pytest.skip("No soil tiles found")

    tile = json.loads(tile_files[0].read_text())
    djf_years = YEARS["DJF"]

    for cell_id, cell in list(tile["cells"].items())[:5]:
        qv = cell["v"]
        qs = cell["s"]

        decoded = [None if q == FILL_INT16 else round(q * SCALE, 2) for q in qv]

        from backend.trend.stats import sen_slope
        valid = [(y, v) for y, v in zip(djf_years, decoded) if v is not None]
        if len(valid) >= 10:
            years, vals = zip(*valid)
            slope, _ = sen_slope(list(years), list(vals))
            slope_per_decade = slope * 10
            expected_qs = int(np.rint(slope_per_decade / SLOPE_SCALE))
            expected_qs = max(-32767, min(32767, expected_qs))
            assert qs == expected_qs, f"Cell {cell_id}: tile slope {qs} != computed {expected_qs} (slope={slope_per_decade:.6f})"


def test_gldas_regional_artifacts_exist():
    """Test that regional artifacts exist for featured regions (soil and SWE)."""
    artifacts_dir = Path(__file__).resolve().parents[1] / "data" / "artifacts"
    if not artifacts_dir.exists():
        pytest.skip("Artifacts directory not found")

    for region in ["indonesia", "coastal_peru"]:
        # Soil moisture
        soil_artifact = artifacts_dir / f"soil_{region}_DJF.json"
        if soil_artifact.exists():
            art = json.loads(soil_artifact.read_text())
            assert art["variable"] == VARIABLE_NAME
            assert art["units"] == DISPLAY_UNITS
            assert art["season"]["code"] == "DJF"
            assert "trend" in art
            assert "inference" in art["trend"]
            inf = art["trend"]["inference"]
            assert inf["method"] == "MK + Hamed-Rao (3 lags)"

        # SWE
        swe_artifact = artifacts_dir / f"swe_{region}_DJF.json"
        if swe_artifact.exists():
            art = json.loads(swe_artifact.read_text())
            assert art["variable"] == "snow_water_equivalent"
            assert art["units"] == DISPLAY_UNITS
            assert art["season"]["code"] == "DJF"
            assert "trend" in art
            assert "inference" in art["trend"]


def test_gldas_regional_inference_block_structure():
    """Test that regional artifacts have valid inference_block structure."""
    artifacts_dir = Path(__file__).resolve().parents[1] / "data" / "artifacts"
    if not artifacts_dir.exists():
        pytest.skip("Artifacts directory not found")

    artifact = artifacts_dir / "soil_indonesia_DJF.json"
    if not artifact.exists():
        pytest.skip("Indonesia soil artifact not found")

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


def test_gldas_coastal_warning_in_summary():
    """Test that coastal warning appears in template_summary for coastal regions."""
    artifacts_dir = Path(__file__).resolve().parents[1] / "data" / "artifacts"
    if not artifacts_dir.exists():
        pytest.skip("Artifacts directory not found")

    artifact = artifacts_dir / "soil_coastal_peru_DJF.json"
    if not artifact.exists():
        pytest.skip("Coastal Peru artifact not found")

    art = json.loads(artifact.read_text())
    summary = art["template_summary"]
    assert "Coastal regions with only a few land cells" in summary
    assert "weak representativeness" in summary


def test_gldas_anomaly_note_in_summary():
    """Test that anomaly note appears in template_summary."""
    artifacts_dir = Path(__file__).resolve().parents[1] / "data" / "artifacts"
    if not artifacts_dir.exists():
        pytest.skip("Artifacts directory not found")

    artifact = artifacts_dir / "soil_indonesia_DJF.json"
    if not artifact.exists():
        pytest.skip("Indonesia artifact not found")

    art = json.loads(artifact.read_text())
    summary = art["template_summary"]
    assert "Anomalies are an open question" in summary
    assert "Raw values (kg m-2) are reported" in summary


def test_gldas_validation_record_exists():
    """Test that VALIDATION_GLDAS.md exists."""
    val_path = Path(__file__).resolve().parents[1] / "docs" / "VALIDATION_GLDAS.md"
    assert val_path.exists(), "VALIDATION_GLDAS.md not found"

    content = val_path.read_text()
    assert "Giovanni request" in content
    assert "GLDAS_NOAH10_M" in content
    assert "SoilMoi0_10cm_inst" in content
    assert "SWE_inst" in content
    assert "DJF" in content
    assert "2001" in content  # DJF starts 2001