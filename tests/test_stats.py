"""Tests for the trend estimators and the product inference path.

Agreement checks use pymannkendall (>= 1.4) as an outside implementation and
scipy.stats.theilslopes for the Sen slope interval. They run on three synthetic
series and three real DJF series frozen in ``tests/real_series_fixture.py`` (the
artifact files themselves are never read). The full Monte Carlo study lives in
``tests/sim_stats.py``; the simulation test here is a deliberately small version
of the same code so pytest stays quick.
"""

from __future__ import annotations

import json

import numpy as np
import pymannkendall as pmk
import pytest
from scipy.stats import theilslopes

from backend.trend import stats
from tests import sim_stats
from tests.real_series_fixture import REAL_SERIES, YEARS as REAL_YEARS

FIELDS = ("s", "var_s", "z", "p")


def _cases():
    """Three different synthetic series: trending, flat, and tied (rounded)."""
    rng = np.random.default_rng(20261114)
    n = 42
    years = np.arange(1984, 1984 + n, dtype=float)
    trending = 0.02 * np.arange(n) + rng.normal(size=n)
    flat = rng.normal(size=n)
    tied = np.round(3.0 + 0.015 * np.arange(n) + rng.normal(scale=0.7, size=n), 1)
    return [("trending", years, trending), ("flat", years, flat), ("tied", years, tied)]


def _real_cases():
    """The three frozen real DJF series with their shared 1984-2025 year labels."""
    years = np.asarray(REAL_YEARS, dtype=float)
    return [(name, years.copy(), np.asarray(values, dtype=float)) for name, values in REAL_SERIES]


CASES = _cases()
REAL_CASES = _real_cases()
ALL_CASES = CASES + REAL_CASES
CASE_IDS = [case[0] for case in CASES]
REAL_IDS = [case[0] for case in REAL_CASES]
ALL_IDS = CASE_IDS + REAL_IDS


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
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


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
def test_mann_kendall_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall(years, values)
    reference = pmk.original_test(values)
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)
    assert result["n"] == values.size


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
def test_hamed_rao_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall_hamed_rao(years, values)
    reference = pmk.hamed_rao_modification_test(values)
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
def test_hamed_rao_three_lags_matches_pymannkendall(name, years, values):
    """The product main test: pymannkendall treats its ``lag`` as a count."""
    result = stats.mann_kendall_hamed_rao(years, values, max_lag=3)
    reference = pmk.hamed_rao_modification_test(values, lag=3)
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)
    assert result["max_lag"] == 3


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
def test_yue_wang_tfpw_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall_yue_wang(years, values)
    reference = pmk.trend_free_pre_whitening_modification_test(values)
    assert result["trend_preserving"] is True
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
def test_yue_wang_classic_prewhitening_matches_pymannkendall(name, years, values):
    result = stats.mann_kendall_yue_wang(years, values, trend_preserving=False)
    reference = pmk.pre_whitening_modification_test(values)
    assert result["trend_preserving"] is False
    for field in FIELDS:
        expected = getattr(reference, field)
        assert result[field] == pytest.approx(expected, rel=1e-10, abs=1e-10)


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
@pytest.mark.parametrize("alpha", [0.05, 0.10])
def test_sen_slope_ci_matches_scipy(name, years, values, alpha):
    result = stats.sen_slope_ci(years, values, alpha=alpha)
    reference = theilslopes(values, years, alpha=1.0 - alpha)
    assert result["low"] == pytest.approx(reference.low_slope, rel=1e-12, abs=1e-12)
    assert result["high"] == pytest.approx(reference.high_slope, rel=1e-12, abs=1e-12)
    assert result["slope"] == pytest.approx(reference.slope, rel=1e-12, abs=1e-12)


@pytest.mark.parametrize("name, years, values", ALL_CASES, ids=ALL_IDS)
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


# ---------------------------------------------------------------------------
# Product inference block
# ---------------------------------------------------------------------------

INFERENCE_KEYS = {
    "status",
    "p_value",
    "ci",
    "method",
    "strict_check_pass",
    "strict_check_p",
    "lag1",
    "caution",
    "ci_note",
    "n",
}


def _years(size):
    return np.arange(1984, 1984 + size, dtype=float)


@pytest.mark.parametrize("name, years, values", REAL_CASES, ids=REAL_IDS)
def test_inference_block_is_built_from_the_chosen_tests(name, years, values):
    block = stats.inference_block(years, values)
    main = stats.mann_kendall_hamed_rao(years, values, max_lag=3)
    strict = stats.mann_kendall_yue_wang(years, values, trend_preserving=False)
    interval = stats.sen_slope_ci(years, values)

    assert set(block) == INFERENCE_KEYS
    assert block["status"] == "ok"
    assert block["method"] == "MK + Hamed-Rao (3 lags)"
    assert block["p_value"] == pytest.approx(main["p"], rel=1e-12, abs=0.0)
    assert block["strict_check_p"] == pytest.approx(strict["p"], rel=1e-12, abs=0.0)
    assert block["strict_check_pass"] == (
        strict["p"] < 0.05 and np.sign(strict["s"]) == np.sign(main["s"])
    )
    assert block["ci"] == pytest.approx(
        [10.0 * interval["low"], 10.0 * interval["high"]], rel=1e-12, abs=1e-12
    )
    assert block["ci"][0] <= 10.0 * interval["slope"] <= block["ci"][1]
    assert block["n"] == values.size
    assert -1.0 <= block["lag1"] <= 1.0
    assert block["caution"] == (block["lag1"] >= 0.3)
    assert block["ci_note"].startswith("95% slope interval assumes independent years")


def test_inference_block_is_json_safe_and_round_trips():
    years = np.asarray(REAL_CASES[0][1])
    values = np.asarray(REAL_CASES[0][2])

    block = stats.inference_block(years, values)
    text = json.dumps(block, allow_nan=False)
    assert "NaN" not in text
    assert json.loads(text) == block

    short = stats.inference_block(years[:5], values[:5])
    text = json.dumps(short, allow_nan=False)
    assert "NaN" not in text
    assert json.loads(text) == short
    assert short["p_value"] is None
    assert short["ci"] is None
    assert short["lag1"] is None
    assert short["strict_check_p"] is None
    assert short["strict_check_pass"] is None


def test_trend_block_holds_sen_slope_and_inference():
    years = np.asarray(REAL_CASES[0][1])
    values = np.asarray(REAL_CASES[0][2])

    trend = stats.trend_block(years, values)
    slope, intercept = stats.sen_slope(years, values)

    assert trend["method"] == "Sen"
    assert trend["sen_slope_per_decade"] == pytest.approx(10.0 * slope)
    assert trend["intercept"] == pytest.approx(intercept)
    assert trend["inference"] == stats.inference_block(years, values)
    json.dumps(trend, allow_nan=False)


@pytest.mark.parametrize("size", [0, 1, 7])
def test_inference_block_unavailable_below_eight_points(size):
    years = _years(size)
    values = np.arange(size, dtype=float) * 0.1

    block = stats.inference_block(years, values)
    assert block["status"] == "unavailable"
    assert block["p_value"] is None
    assert block["strict_check_p"] is None
    assert block["strict_check_pass"] is None
    assert block["lag1"] is None
    assert block["caution"] is False
    assert block["ci"] is None
    assert block["n"] == size
    # The method label is descriptive, not a claim that a test ran.
    assert block["method"] == "MK + Hamed-Rao (3 lags)"


def test_inference_block_unavailable_for_constant_series():
    years = _years(42)
    values = np.full(42, 2.5)

    block = stats.inference_block(years, values)
    main = stats.mann_kendall_hamed_rao(years, values, max_lag=3)

    assert block["status"] == "unavailable"
    assert main["var_s"] == 0.0
    assert block["p_value"] is None
    assert block["ci"] == [0.0, 0.0]
    assert block["lag1"] == 0.0
    assert block["caution"] is False
    assert block["strict_check_p"] is None
    assert block["strict_check_pass"] is None


def test_inference_block_unavailable_when_variance_is_not_positive():
    """A strongly alternating series makes the corrected variance negative."""
    years = _years(42)
    values = np.array([0.0, 1.0] * 21)

    main = stats.mann_kendall_hamed_rao(years, values, max_lag=3)
    block = stats.inference_block(years, values)

    assert main["var_s"] < 0.0
    assert np.isnan(main["p"])
    assert block["status"] == "unavailable"
    assert block["p_value"] is None
    assert block["strict_check_pass"] is None
    # The classic prewhitening test still has a positive variance here, so its
    # p-value is reported; it cannot confirm a main test that does not exist.
    assert block["strict_check_p"] is not None
    assert np.isfinite(block["strict_check_p"])


def test_inference_block_reports_caution_for_persistent_series():
    rng = np.random.default_rng(7)
    values = np.empty(42)
    values[0] = 0.0
    shocks = rng.normal(size=42)
    for t in range(1, 42):
        values[t] = 0.7 * values[t - 1] + shocks[t]

    block = stats.inference_block(_years(42), values)
    assert block["lag1"] > 0.3
    assert block["caution"] is True


def test_inference_block_handles_nan_gaps():
    rng = np.random.default_rng(5)
    years = _years(42)
    values = 0.01 * np.arange(42) + rng.normal(size=42)
    gappy = values.copy()
    gappy[[3, 17, 40]] = np.nan

    keep = ~np.isnan(gappy)
    block = stats.inference_block(years, gappy)
    clean = stats.inference_block(years[keep], values[keep])

    assert block["status"] == "ok"
    assert block["n"] == 39
    assert block["p_value"] == pytest.approx(clean["p_value"], rel=1e-12)
    assert block["ci"] == pytest.approx(clean["ci"], rel=1e-12)
    assert block["lag1"] == pytest.approx(clean["lag1"], rel=1e-12)

    mostly_missing = values.copy()
    mostly_missing[:35] = np.nan
    short = stats.inference_block(years, mostly_missing)
    assert short["n"] == 7
    assert short["status"] == "unavailable"
    assert short["p_value"] is None


# ---------------------------------------------------------------------------
# Benjamini-Hochberg FDR
# ---------------------------------------------------------------------------


def test_fdr_bh_known_example():
    # m = 4, q = 0.05 gives thresholds 0.0125, 0.025, 0.0375, 0.05; the
    # largest passing rank is 3, so the first three are rejected.
    mask = stats.fdr_bh([0.001, 0.02, 0.03, 0.2], q=0.05)
    assert mask.dtype == bool
    assert mask.tolist() == [True, True, True, False]


def test_fdr_bh_boundary_is_inclusive():
    # Exactly on the line: p_(k) == q * k / m is rejected.
    assert stats.fdr_bh([0.01, 0.02, 0.03, 0.04, 0.05], q=0.05).all()


def test_fdr_bh_all_null_and_empty():
    assert stats.fdr_bh([np.nan, np.nan]).tolist() == [False, False]
    empty = stats.fdr_bh([])
    assert empty.size == 0 and empty.dtype == bool


def test_fdr_bh_all_significant():
    assert stats.fdr_bh(np.full(25, 1e-12), q=0.10).all()
    assert stats.fdr_bh([1e-6, 1e-5, 0.0001], q=0.10).all()


def test_fdr_bh_ignores_nan_when_counting_tests():
    # Three finite tests, thresholds q*k/3 = 0.0333, 0.0667, 0.1.
    mask = stats.fdr_bh([0.01, np.nan, 0.2, 0.03], q=0.10)
    assert mask.tolist() == [True, False, False, True]
    # If NaN counted as a test, 0.03 would be compared with 0.05 instead.
    assert mask.tolist() != [True, False, False, False]


def test_fdr_bh_is_a_step_up_rule():
    pvalues = np.array([0.021, 0.009, 0.2, 0.04, np.nan, 0.031])
    mask = stats.fdr_bh(pvalues, q=0.10)
    rejected = pvalues[mask & np.isfinite(pvalues)]
    borderline = rejected.max()
    # Every finite p-value at or below the largest rejected one is rejected.
    expected = np.isfinite(pvalues) & (pvalues <= borderline)
    np.testing.assert_array_equal(mask, expected)


def test_fdr_bh_rejects_invalid_input():
    with pytest.raises(ValueError):
        stats.fdr_bh([0.01, 0.2], q=0.0)
    with pytest.raises(ValueError):
        stats.fdr_bh([0.01, 0.2], q=1.0)
    with pytest.raises(ValueError):
        stats.fdr_bh([-0.01, 0.2])
    with pytest.raises(ValueError):
        stats.fdr_bh([0.01, 1.2])

