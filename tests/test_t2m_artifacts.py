"""Tests for the ten featured-region T2M DJF artifacts and their inference."""
import json
from pathlib import Path

import numpy as np
import pytest

from backend.trend import var_t2m
from backend.trend.regions import REGIONS, build_regions
from backend.trend.stats import inference_block, sen_slope_per_decade

ARTIFACT_ROOT = Path(__file__).resolve().parents[1] / "data" / "artifacts"


def artifacts_available():
    return all(
        (ARTIFACT_ROOT / f"t2m_{region['id']}_DJF.json").is_file()
        for region in REGIONS
    )


def load(region_id):
    path = ARTIFACT_ROOT / f"t2m_{region_id}_DJF.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_all_ten_artifacts_follow_the_contract():
    if not artifacts_available():
        pytest.skip("Generated t2m regional artifacts are not available")
    for region in REGIONS:
        doc = load(region["id"])
        assert doc["id"] == f"t2m_{region['id']}_DJF"
        assert doc["variable"] == "temperature"
        assert doc["units"] == "degC"
        assert doc["source"]["product"] == "M2TMNXSLV"
        assert doc["source"]["version"] == "5.12.4"
        assert doc["source"]["var"] == "T2M"
        assert doc["region"]["id"] == region["id"]
        assert doc["region"]["bbox"] == list(region["bbox"])
        assert doc["season"]["code"] == "DJF"
        assert doc["season"]["months"] == [12, 1, 2]
        assert doc["years"] == list(range(1981, 2027))
        assert len(doc["values"]) == len(doc["coverage"]) == len(doc["years"])
        assert doc["geometry_file"] == "data/artifacts/regions.geojson"
        assert doc["anomaly_baseline"] is None


def test_values_are_celsius_and_cover_the_region():
    if not artifacts_available():
        pytest.skip("Generated t2m regional artifacts are not available")
    for region in REGIONS:
        doc = load(region["id"])
        values = np.array(doc["values"], dtype=float)
        coverage = np.array(doc["coverage"], dtype=float)
        assert np.isfinite(values).all()
        # All featured regions are below 65 degC and above -60 degC in DJF;
        # a Kelvin series would sit near 270-300.
        assert values.min() > -60.0 and values.max() < 45.0, region["id"]
        assert 0.0 <= coverage.min() <= coverage.max() <= 1.0
        assert coverage.min() > 0.99, region["id"]


def test_validation_is_never_marked_passed():
    if not artifacts_available():
        pytest.skip("Generated t2m regional artifacts are not available")
    for region in REGIONS:
        doc = load(region["id"])
        assert doc["validation"]["status"] == "pending"
        assert doc["validation"]["reference"].startswith("Giovanni")


def test_inference_matches_the_stats_module():
    if not artifacts_available():
        pytest.skip("Generated t2m regional artifacts are not available")
    for region in REGIONS:
        doc = load(region["id"])
        expected = inference_block(doc["years"], doc["values"])
        assert doc["trend"]["inference"] == expected, region["id"]
        expected_slope = sen_slope_per_decade(doc["years"], doc["values"])
        assert doc["trend"]["sen_slope_per_decade"] == pytest.approx(
            expected_slope, abs=1e-12
        )
        assert doc["trend"]["method"] == "Sen"


def test_inference_status_follows_the_contract_rule():
    if not artifacts_available():
        pytest.skip("Generated t2m regional artifacts are not available")
    for region in REGIONS:
        inference = load(region["id"])["trend"]["inference"]
        assert inference["status"] in {"ok", "unavailable"}
        if inference["status"] == "ok":
            assert inference["p_value"] is not None
            assert inference["n"] >= 8
        else:
            assert inference["p_value"] is None or inference["n"] < 8
        assert inference["method"] == "MK + Hamed-Rao (3 lags)"
        assert inference["ci_note"]


def test_template_summary_uses_the_region_and_mean():
    if not artifacts_available():
        pytest.skip("Generated t2m regional artifacts are not available")
    for region in REGIONS:
        doc = load(region["id"])
        summary = doc["template_summary"]
        assert region["label"] in summary
        assert "degC" in summary
        mean = float(np.mean(doc["values"]))
        assert f"{mean:.2f}" in summary


def test_region_masks_have_positive_area_on_the_native_grid():
    if not var_t2m.DATA_ROOT.is_dir():
        pytest.skip("MERRA-2 T2M archive is not available")
    _, lat, lon, _ = var_t2m.read_month(1980, 1)
    regions = build_regions(lat, lon, region_ids=tuple(r["id"] for r in REGIONS))
    assert set(regions) == {r["id"] for r in REGIONS}
    for region_id, region in regions.items():
        assert region["area_km2"] > 0.0, region_id
        assert region["cells_used"] > 0, region_id
        assert np.isfinite(region["area_weights"]).all()
