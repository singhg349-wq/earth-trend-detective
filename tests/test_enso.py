import json

import numpy as np
import pytest
from backend.trend.enso import (
    analyze_region, block_bootstrap_interval, detrend_sen, lag1, read_january_oni,
    spearman_association,
)


def test_spearman_detects_known_monotonic_association():
    x = np.arange(20, dtype=float)
    y = x**2
    assert spearman_association(x, y) == pytest.approx(1.0)


def test_sen_detrending_removes_shared_linear_trend_before_association():
    years = np.arange(1984, 2024)
    residual = np.sin(np.arange(40) * 1.7)
    values = 0.4 * years + residual
    detrended, slope, _ = detrend_sen(years, values)
    assert slope == pytest.approx(0.4, abs=0.02)
    assert np.corrcoef(detrended, residual)[0, 1] > 0.99


def test_block_bootstrap_is_reproducible_and_breaks_resampling_ties():
    years = np.arange(1984, 2024)
    x = np.repeat(np.arange(10, dtype=float), 4)
    y = x + np.tile([0.0, 0.01, -0.01, 0.02], 10)
    first = block_bootstrap_interval(years, x, y, seed=19, n_resamples=150)
    second = block_bootstrap_interval(years, x, y, seed=19, n_resamples=150)
    assert first == second
    assert first[0] <= first[1]
    tied = block_bootstrap_interval(years[:24], np.zeros(24), np.zeros(24), seed=3, n_resamples=50)
    assert tied[0] < tied[1]


def test_bootstrap_refuses_to_bridge_missing_calendar_year():
    with pytest.raises(ValueError, match="contiguous"):
        block_bootstrap_interval([2000, 2001, 2003] + list(range(2004, 2021)), np.arange(20), np.arange(20))


def test_lag1_uses_calendar_adjacencies_not_stitched_missing_years():
    values = np.array([0.0, 1.0, 100.0, 2.0])
    years = np.array([2000, 2001, 2003, 2004])
    assert lag1(values, years) == pytest.approx(1.0)


def test_missing_oni_year_is_excluded_and_group_counts_are_reported(tmp_path):
    oni = tmp_path / "oni.csv"
    oni.write_text("year,oni_january_c\n" + "".join(
        f"{y},{0.6 + 0.1 * (y % 3) if y % 2 else -99.9}\n" for y in range(1984, 2026)
    ))
    artifact = tmp_path / "rain.json"
    artifact.write_text(json.dumps({
        "region": {"id": "test", "label": "Test"},
        "years": list(range(1984, 2026)),
        "values": [float(y - 1980) + (0.1 if y % 2 else -0.1) for y in range(1984, 2026)],
    }))
    result = analyze_region(artifact, oni)
    assert len(result["matched_years"]) == 21
    assert len(result["excluded_years"]) == 21
    assert result["el_nino_rainfall_comparison"][0]["el_nino_year_count"] == 21


def test_oni_reader_accepts_reference_csv_and_missing_sentinel(tmp_path):
    path = tmp_path / "oni.csv"
    path.write_text("year,oni_january_c\n1984,-99.9\n1985,0.5\n")
    assert read_january_oni(path) == {1984: None, 1985: 0.5}
