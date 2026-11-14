"""Synthetic check of the candidate trend tests (AR(1) null and trend power).

This is a script, not a pytest module, because the full run is deliberately
slow-ish (~2000 replicates x 3 dependence levels). Run it from the repository
root:

    python tests/sim_stats.py

It prints a Markdown table of measured false-positive rates and power. The
numbers are copied into ``docs/STATS_CANDIDATES.md``; nothing is written to
disk. ``tests/test_stats.py`` reuses the same helpers for a much smaller quick
check, so the fast tests and the full table share one simulation definition.

Design
------
* Series length n = 42, matching DJF 1984-2025 (one value per season).
* Null series: stationary AR(1), x_t = phi*x_{t-1} + eps_t, with eps ~
  N(0, 1 - phi^2) so the marginal variance is 1 and x_0 is drawn from N(0, 1).
* Alternative series: the same AR(1) plus a linear trend of 0.02 standard
  deviations per year (0.84 sd over the 42 years).
* 2000 replicates per (phi, scenario). Replicate seeds depend only on phi and
  the scenario, so any single cell can be reproduced on its own.
* False-positive rate and power are the share of replicates with p < 0.05.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

# Allow "python tests/sim_stats.py" from the repository root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.trend import stats  # noqa: E402  (import after the path fix)

#: Years used for every replicate. Only the spacing matters to the estimators.
YEARS = np.arange(1984, 1984 + 42, dtype=float)

#: Seed base; each (phi, scenario) cell gets its own stream from this.
SEED_BASE = 20261114

#: Trend size in the alternative, in standard deviations per year.
TREND_PER_YEAR = 0.02

#: Nominal significance level for every method.
ALPHA = 0.05

#: Dependence levels measured in the table.
PHIS = (0.0, 0.3, 0.6)


def ar1_series(n, phi, rng, slope=0.0):
    """One stationary AR(1) draw, unit marginal variance, optional linear trend."""
    eps = rng.normal(0.0, np.sqrt(1.0 - phi * phi), size=n)
    x = np.empty(n)
    x[0] = rng.normal(0.0, 1.0)
    for t in range(1, n):
        x[t] = phi * x[t - 1] + eps[t]
    if slope:
        x = x + slope * np.arange(n)
    return x


def method_pvalues(years, values):
    """p-value from every candidate, keyed by the label used in the table."""
    return {
        "Mann-Kendall (plain)": stats.mann_kendall(years, values)["p"],
        "Mann-Kendall + Hamed-Rao (all lags)": stats.mann_kendall_hamed_rao(
            years, values
        )["p"],
        "Mann-Kendall + Hamed-Rao (max_lag=3)": stats.mann_kendall_hamed_rao(
            years, values, max_lag=3
        )["p"],
        "Mann-Kendall + Yue-Wang TFPW": stats.mann_kendall_yue_wang(
            years, values
        )["p"],
        "Mann-Kendall + Yue-Wang classic PW": stats.mann_kendall_yue_wang(
            years, values, trend_preserving=False
        )["p"],
    }


METHOD_LABELS = (
    "Mann-Kendall (plain)",
    "Mann-Kendall + Hamed-Rao (all lags)",
    "Mann-Kendall + Hamed-Rao (max_lag=3)",
    "Mann-Kendall + Yue-Wang TFPW",
    "Mann-Kendall + Yue-Wang classic PW",
)


def _rng_for(phi, slope):
    """Seed stream for one (phi, scenario) cell; depends on nothing else."""
    offset = SEED_BASE + int(round(phi * 1000)) + (1 if slope else 0)
    return np.random.default_rng(offset)


def rejection_rates(phi, runs, slope=0.0, n=42, alpha=ALPHA, years=YEARS):
    """Share of replicates with p < alpha for every candidate method."""
    rng = _rng_for(phi, slope)
    counts = {label: 0 for label in METHOD_LABELS}
    for _ in range(runs):
        values = ar1_series(n, phi, rng, slope=slope)
        for label, p in method_pvalues(years, values).items():
            if p < alpha:
                counts[label] += 1
    return {label: count / runs for label, count in counts.items()}


def false_positive_rates(phi, runs):
    """Measured false-positive rate with no trend present."""
    return rejection_rates(phi, runs, slope=0.0)


def power_rates(phi, runs, trend_per_year=TREND_PER_YEAR):
    """Measured power against a known linear trend."""
    return rejection_rates(phi, runs, slope=trend_per_year)


def build_table(runs):
    """Rows of (method, phi, false-positive rate, power) for the Markdown table."""
    fpr = {phi: false_positive_rates(phi, runs) for phi in PHIS}
    pwr = {phi: power_rates(phi, runs) for phi in PHIS}
    rows = []
    for method in METHOD_LABELS:
        for phi in PHIS:
            rows.append((method, phi, fpr[phi][method], pwr[phi][method]))
    return rows


def reference_false_positive_rates(phi, runs):
    """Null rejection rates from pymannkendall's own implementations.

    Uses the same replicate stream as :func:`false_positive_rates`, so the two
    sets of numbers can be compared directly. This is what shows that a
    surprising result (for example the high rate of the trend-preserving
    prewhitening test) is a property of the method, not of the port.
    """
    import pymannkendall as pmk

    rng = _rng_for(phi, 0.0)
    counts = dict.fromkeys(METHOD_LABELS, 0)
    for _ in range(runs):
        values = ar1_series(42, phi, rng)
        reference = {
            "Mann-Kendall (plain)": pmk.original_test(values).p,
            "Mann-Kendall + Hamed-Rao (all lags)": pmk.hamed_rao_modification_test(values).p,
            "Mann-Kendall + Hamed-Rao (max_lag=3)": pmk.hamed_rao_modification_test(values, lag=3).p,
            "Mann-Kendall + Yue-Wang TFPW": pmk.trend_free_pre_whitening_modification_test(values).p,
            "Mann-Kendall + Yue-Wang classic PW": pmk.pre_whitening_modification_test(values).p,
        }
        for label, p in reference.items():
            if p < ALPHA:
                counts[label] += 1
    return {label: count / runs for label, count in counts.items()}


def tfpw_amplitude_ratio(phi, runs):
    """Median size of the TFPW re-added trend relative to the whitened noise.

    For each replicate this is ``|slope| * (last tested year - first tested
    year) / sd(whitened series)``, where ``slope`` is the Sen slope of the
    original series. A large ratio means the trend that the method puts back
    dominates the residuals it just whitened, which is the mechanism behind the
    high false-positive rate of this variant at strong persistence.
    """
    rng = _rng_for(phi, 0.0)
    ratios = []
    for _ in range(runs):
        values = ar1_series(42, phi, rng)
        slope, _ = stats.sen_slope(YEARS, values)
        rho1 = stats.mann_kendall_yue_wang(YEARS, values)["rho1"]
        detrended = values - slope * (YEARS - YEARS[0])
        whitened = detrended[1:] - rho1 * detrended[:-1]
        span = abs(slope) * (YEARS[-1] - YEARS[1])
        ratios.append(span / whitened.std(ddof=1))
    return float(np.median(ratios))


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    runs = 2000
    print(
        f"n=42, {runs} replicates per cell, alpha={ALPHA}, "
        f"trend={TREND_PER_YEAR} sd/year, seed base {SEED_BASE}"
    )
    print()
    print("| Method | phi | False-positive rate (no trend) | Power (0.02 sd/yr trend) |")
    print("|---|---|---|---|")
    for method, phi, fpr, power in build_table(runs):
        print(f"| {method} | {phi:.1f} | {fpr:.3f} | {power:.3f} |")

    if "--verify" in argv:
        print()
        print("Cross-check of the null rejection rate against pymannkendall:")
        print()
        print("| Method | phi | This module | pymannkendall |")
        print("|---|---|---|---|")
        ours = {phi: false_positive_rates(phi, runs) for phi in PHIS}
        theirs = {phi: reference_false_positive_rates(phi, runs) for phi in PHIS}
        for method in METHOD_LABELS:
            for phi in PHIS:
                print(
                    f"| {method} | {phi:.1f} | {ours[phi][method]:.3f} "
                    f"| {theirs[phi][method]:.3f} |"
                )

        print()
        print("TFPW, median re-added trend span as a multiple of the whitened sd:")
        for phi in PHIS:
            print(f"* phi = {phi:.1f}: {tfpw_amplitude_ratio(phi, runs):.2f}")


if __name__ == "__main__":
    main()
