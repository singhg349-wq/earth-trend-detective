"""Tests for the candidate trend estimators.

Agreement checks use pymannkendall (>= 1.4) as an outside implementation and
scipy.stats.theilslopes for the Sen slope interval. The full Monte Carlo study
lives in ``tests/sim_stats.py``; the simulation test here is a deliberately
small version of the same code so pytest stays quick.
"""

from __future__ import annotations

import numpy as np
import pymannkendall as pmk
import pytest
from scipy.stats import theilslopes

from backend.trend import stats
from tests import sim_stats

FIELDS = ("s", "var_s", "z", "p")


def _cases():
    """Three different test series: trending, flat, and tied (rounded) values."""
    rng = np.random.default_rng(20261114)
    n = 42
    years = np.arange(1984, 1984 + n, dtype=float)
    trending = 0.02 * np.arange(n) + rng.normal(size=n)
    flat = rng.normal(size=n)
    tied = np.round(3.0 + 0.015 * np.arange(n) + rng.normal(scale=0.7, size=n), 1)
    return [("trending", years, trending), ("flat", years, flat), ("tied", years, tied)]


CASES = _cases()
CASE_IDS = [case[0] for case in CASES]


@pytest.mark.parametrize("name, years, values", CASES, ids=CASE_IDS)
def test_sen_slope_matches_pymannkendall(name, years, values):
    slope, intercept = stats.sen_slope(years, values)
    reference = pmk.sens_slope(values)

    assert slope == pytest.approx(reference.slope, rel=1e-12, abs=1e-12)
    # pymannkendall reports the intercept against unit index steps; convert it
    # to the same year origin used here before comparing.
    converted = reference.intercept + reference.slope * (
        np.median(np.arange(values.size)) - np.median(years)
    )
    assert intercept == pytest.approx(converted, rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("name, years, values", CASES, ids=CASE_IDS)
def test_mann_kendall_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall(years, values)
    reference = pmk.original_test(values)
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)
    assert result["n"] == values.size


@pytest.mark.parametrize("name, years, values", CASES, ids=CASE_IDS)
def test_hamed_rao_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall_hamed_rao(years, values)
    reference = pmk.hamed_rao_modification_test(values)
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)


@pytest.mark.parametrize("name, years, values", CASES, ids=CASE_IDS)
def test_yue_wang_tfpw_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall_yue_wang(years, values)
    reference = pmk.trend_free_pre_whitening_modification_test(values)
    assert result["trend_preserving"] is True
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)


@pytest.mark.parametrize("name, years, values", CASES, ids=CASE_IDS)
def test_yue_wang_classic_prewhitening_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall_yue_wang(years, values, trend_preserving=False)
    reference = pmk.pre_whitening_modification_test(values)
    assert result["trend_preserving"] is False
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)


@pytest.mark.parametrize("name, years, values", CASES, ids=CASE_IDS)
@pytest.mark.parametrize("alpha", [0.05, 0.10])
def test_sen_slope_ci_matches_scipy(name, years, values, alpha):
    result = stats.sen_slope_ci(years, values, alpha=alpha)
    reference = theilslopes(values, years, alpha=1.0 - alpha)
    assert result["low"] == pytest.approx(reference.low_slope, rel=1e-12, abs=1e-12)
    assert result["high"] == pytest.approx(reference.high_slope, rel=1e-12, abs=1e-12)
    assert result["slope"] == pytest.approx(reference.slope, rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("name, years, values", CASES, ids=CASE_IDS)
def test_sen_slope_ci_brackets_estimate_and_narrows(name, years, values):
    wide = stats.sen_slope_ci(years, values, alpha=0.05)
    narrow = stats.sen_slope_ci(years, values, alpha=0.20)
    assert wide["low"] <= wide["slope"] <= wide["high"]
    assert narrow["low"] <= narrow["slope"] <= narrow["high"]
    assert (narrow["high"] - narrow["low"]) <= (wide["high"] - wide["low"])
    assert wide["n_pairs"] == values.size * (values.size - 1) // 2


def test_nan_pairs_are_dropped_consistently():
    rng = np.random.default_rng(5)
    years = np.arange(1984, 2026, dtype=float)
    values = 0.01 * np.arange(42) + rng.normal(size=42)
    gappy = values.copy()
    gappy[[3, 17, 40]] = np.nan

    keep = ~np.isnan(gappy)
    clean_years, clean_values = years[keep], gappy[keep]

    for name, expected_n in (
        ("mann_kendall", 39),
        ("mann_kendall_hamed_rao", 39),
        ("mann_kendall_yue_wang", 38),  # the prewhitened series is one shorter
    ):
        gappy_result = getattr(stats, name)(years, gappy)
        clean_result = getattr(stats, name)(clean_years, clean_values)
        assert gappy_result["n"] == expected_n
        assert gappy_result["n_dropped"] == 3
        assert gappy_result["p"] == pytest.approx(clean_result["p"], rel=1e-12)
        assert np.isfinite(gappy_result["p"])

    gappy_ci = stats.sen_slope_ci(years, gappy)
    clean_ci = stats.sen_slope_ci(clean_years, clean_values)
    assert gappy_ci["n"] == 39 and gappy_ci["n_dropped"] == 3
    assert gappy_ci["low"] == pytest.approx(clean_ci["low"], rel=1e-12)
    assert gappy_ci["high"] == pytest.approx(clean_ci["high"], rel=1e-12)

    slope, _ = stats.sen_slope(years, gappy)
    clean_slope, _ = stats.sen_slope(clean_years, clean_values)
    assert slope == pytest.approx(clean_slope, rel=1e-12)


@pytest.mark.parametrize("size", [0, 1, 7])
def test_short_series_returns_nan_without_crashing(size):
    years = np.arange(1984, 1984 + size, dtype=float)
    values = np.arange(size, dtype=float) * 0.1

    slope, intercept = stats.sen_slope(years, values)
    assert np.isnan(slope) and np.isnan(intercept)
    assert np.isnan(stats.sen_slope_per_decade(years, values))

    for result in (
        stats.mann_kendall(years, values),
        stats.mann_kendall_hamed_rao(years, values),
        stats.mann_kendall_yue_wang(years, values),
    ):
        assert result["n"] == size
        assert np.isnan(result["p"])
        assert np.isnan(result["z"])

    ci = stats.sen_slope_ci(years, values)
    assert ci["n"] == size
    assert np.isnan(ci["low"]) and np.isnan(ci["high"])


def test_per_decade_helper_is_ten_times_per_year():
    years = np.arange(1984, 2026, dtype=float)
    values = 0.004 * np.arange(42)
    slope, _ = stats.sen_slope(years, values)
    assert stats.sen_slope_per_decade(years, values) == pytest.approx(10.0 * slope)
    assert stats.sen_slope_per_decade(years, values) == pytest.approx(0.04)


def test_monotonic_series_is_detected():
    years = np.arange(1984, 2026, dtype=float)
    values = 5.0 + 0.001 * np.arange(42)
    result = stats.mann_kendall(years, values)
    assert result["s"] > 0
    assert result["p"] < 0.001
    ci = stats.sen_slope_ci(years, values)
    assert ci["low"] == pytest.approx(ci["high"])


def test_irregular_year_spacing_uses_actual_years():
    years = np.arange(1984, 2026, dtype=float)
    values = 0.02 * np.arange(42) + np.random.default_rng(11).normal(size=42)
    keep = np.ones(42, dtype=bool)
    keep[::7] = False
    gap_years, gap_values = years[keep], values[keep]

    i, j = np.triu_indices(gap_values.size, k=1)
    manual = np.median((gap_values[j] - gap_values[i]) / (gap_years[j] - gap_years[i]))
    slope, _ = stats.sen_slope(gap_years, gap_values)
    assert slope == pytest.approx(manual)
    assert slope != pytest.approx(stats.sen_slope(years, values)[0])

    ci = stats.sen_slope_ci(gap_years, gap_values)
    assert ci["low"] <= ci["slope"] <= ci["high"]


def test_constant_series_is_undefined_not_zero():
    years = np.arange(1984, 2026, dtype=float)
    values = np.full(42, 2.5)

    result = stats.mann_kendall(years, values)
    assert result["s"] == 0.0
    assert result["var_s"] == 0.0
    assert np.isnan(result["p"])

    slope, intercept = stats.sen_slope(years, values)
    assert slope == pytest.approx(0.0)
    assert intercept == pytest.approx(2.5)

    ci = stats.sen_slope_ci(years, values)
    assert ci["low"] == ci["slope"] == ci["high"] == pytest.approx(0.0)


def test_result_fields_are_the_same_for_short_series():
    years = np.arange(1984, 2026, dtype=float)
    values = np.sin(np.arange(42) / 3.0)
    short = slice(0, 5)

    for name in ("mann_kendall_hamed_rao", "mann_kendall_yue_wang"):
        full = getattr(stats, name)(years, values)
        empty = getattr(stats, name)(years[short], values[short])
        assert set(full) == set(empty)


def test_invalid_arguments_raise():
    years = np.arange(1984, 2026, dtype=float)
    values = np.arange(42, dtype=float) * 0.1

    with pytest.raises(ValueError):
        stats.mann_kendall(years, values, alpha=1.5)
    with pytest.raises(ValueError):
        stats.sen_slope_ci(years, values, alpha=0.0)
    with pytest.raises(ValueError):
        stats.mann_kendall_hamed_rao(years, values, max_lag=0)
    with pytest.raises(ValueError):
        stats.sen_slope(years, values[:-1])
    with pytest.raises(ValueError):
        stats.sen_slope(np.append(years[:-1], years[-2]), values)


def test_quick_false_positive_and_power_check():
    """Small version of the full study in tests/sim_stats.py."""
    runs = 400
    no_trend = {phi: sim_stats.false_positive_rates(phi, runs) for phi in (0.0, 0.6)}
    trend = {phi: sim_stats.power_rates(phi, runs) for phi in (0.0, 0.6)}

    plain = "Mann-Kendall (plain)"
    hamed_rao = "Mann-Kendall + Hamed-Rao (all lags)"
    classic_pw = "Mann-Kendall + Yue-Wang classic PW"

    # Plain MK is calibrated only when there is no serial dependence.
    assert 0.01 < no_trend[0.0][plain] < 0.11
    # With strong dependence plain MK over-rejects, so the study is sensitive
    # to the effect it is meant to reveal.
    assert no_trend[0.6][plain] > 0.20
    # Classic prewhitening is calibrated but loses power; a known trade-off.
    assert 0.01 < no_trend[0.6][classic_pw] < 0.11
    assert trend[0.6][classic_pw] < trend[0.6][plain]
    # The Hamed-Rao correction moves the false-positive rate down but does not
    # reach the nominal level at phi = 0.6 for n = 42.
    assert no_trend[0.6][hamed_rao] < no_trend[0.6][plain]
    # Power against a real trend is above the false-positive rate for every
    # method at phi = 0.0.
    for method in (plain, hamed_rao, classic_pw):
        assert trend[0.0][method] > no_trend[0.0][method]
