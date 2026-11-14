"""Candidate trend estimators for yearly seasonal series.

Everything in this module is a *candidate* for the science review. Nothing here
chooses a method, and ``docs/STATS_CANDIDATES.md`` records what was measured.

Conventions
-----------
* ``years`` and ``values`` are one-dimensional arrays of the same length, one
  entry per season (DJF labelled by the January year). Years must be unique.
* NaN handling: any pair with a NaN in either array is dropped, and the number
  dropped is returned as ``n_dropped``. Gaps are never filled or interpolated.
  The lag-based tests (Hamed-Rao, Yue-Wang) then treat the surviving values as
  consecutive, so a gap makes their lag-1 autocorrelation approximate.
* Fewer than ``MIN_POINTS`` (8) valid pairs: all statistics are NaN. No
  exception is raised, because a short series is a result, not a bug.
* Slopes are in value units per year; ``sen_slope_per_decade`` multiplies by 10.
* All p-values are two-sided.

Only numpy and scipy are used here.
"""

from __future__ import annotations

import numpy as np
from scipy.stats import norm, rankdata

#: Below this many valid pairs the estimators return NaN instead of a number.
MIN_POINTS = 8


def _prepare(years, values):
    """Return aligned finite arrays plus how many input pairs were dropped."""
    y = np.asarray(years, dtype=float).ravel()
    v = np.asarray(values, dtype=float).ravel()
    if y.size != v.size:
        raise ValueError(
            f"years and values must have the same length, got {y.size} and {v.size}"
        )
    keep = np.isfinite(y) & np.isfinite(v)
    y = y[keep]
    v = v[keep]
    if np.unique(y).size != y.size:
        raise ValueError("years must be unique")
    return y, v, int(keep.size - int(keep.sum()))


def _check_alpha(alpha):
    if not 0.0 < alpha < 1.0:
        raise ValueError("alpha must be between 0 and 1")


def _empty_result(method, n, n_dropped, alpha):
    """NaN-filled result for an unusably short series."""
    nan = float("nan")
    return {
        "method": method,
        "n": int(n),
        "n_dropped": int(n_dropped),
        "s": nan,
        "var_s": nan,
        "z": nan,
        "p": nan,
        "alpha": float(alpha),
        "note": f"fewer than {MIN_POINTS} valid points",
    }


def _mk_statistic(values):
    """Mann-Kendall S: sum of signs over all pairs i < j."""
    n = values.size
    if n < 2:
        return 0.0
    diffs = np.subtract.outer(values, values)
    i, j = np.triu_indices(n, k=1)
    return float(np.sign(diffs[j, i]).sum())


def _var_s(values):
    """Variance of S with the Kendall tie correction."""
    n = values.size
    _, counts = np.unique(values, return_counts=True)
    tie_term = float(np.sum(counts * (counts - 1) * (2 * counts + 5)))
    return float((n * (n - 1) * (2 * n + 5) - tie_term) / 18.0)


def _z_score(s, var_s):
    """Standardised S with the usual continuity correction."""
    if not np.isfinite(var_s) or var_s <= 0.0:
        return float("nan")
    if s > 0:
        return float((s - 1.0) / np.sqrt(var_s))
    if s < 0:
        return float((s + 1.0) / np.sqrt(var_s))
    return 0.0


def _p_value(z):
    """Two-sided p-value for a standard normal statistic."""
    if not np.isfinite(z):
        return float("nan")
    return float(2.0 * norm.sf(abs(z)))


def _acf(values, max_lag):
    """Biased autocorrelation function, rho[0] = 1, lags 0..max_lag.

    The biased (divide by n) estimator is used, matching the usual Mann-Kendall
    implementations; it is slightly conservative for short series.
    """
    n = values.size
    centred = values - values.mean()
    acov = np.correlate(centred, centred, mode="full")[n - 1:] / n
    if acov[0] <= 0.0:
        out = np.zeros(max_lag + 1)
        out[0] = 1.0
        return out
    return acov[: max_lag + 1] / acov[0]


def sen_slope(years, values):
    """Sen (Theil-Sen) slope and intercept of ``values`` against ``years``.

    Assumptions: change is monotonic and roughly linear over the record;
    errors need not be normal; outliers are tolerated because the slope is the
    median of all pairwise slopes. Independent errors are *not* required for
    the slope itself, but the usual confidence interval assumes weak
    dependence. Returns ``(slope_per_year, intercept)`` using
    ``intercept = median(values) - slope * median(years)`` (Conover 1980).
    """
    y, v, _ = _prepare(years, values)
    if v.size < MIN_POINTS:
        return float("nan"), float("nan")
    i, j = np.triu_indices(v.size, k=1)
    slopes = (v[j] - v[i]) / (y[j] - y[i])
    slope = float(np.median(slopes))
    intercept = float(np.median(v) - slope * np.median(y))
    return slope, intercept


def sen_slope_per_decade(years, values):
    """Sen slope expressed per decade, i.e. ten times the per-year slope.

    Same estimator and assumptions as :func:`sen_slope`; provided because the
    result files report a per-decade number.
    """
    slope, _ = sen_slope(years, values)
    return float(slope * 10.0) if np.isfinite(slope) else float("nan")


def sen_slope_ci(years, values, alpha=0.05):
    """Rank-based (order-statistic) confidence interval for the Sen slope.

    Assumptions: the n observations are independent (or weakly dependent) and
    the pairwise slopes are a random sample from a symmetric distribution. The
    interval is read straight off the sorted pairwise slopes: with
    ``N = n(n-1)/2`` and ``C = z_(1-alpha/2) * sqrt(Var(S))``, the bounds are
    the order statistics at 0-based indices ``round((N-C)/2) - 1`` and
    ``round((N+C)/2)``, so they are mirror images around the median slope
    (Gilbert 1987; Hollander and Wolfe 1973, the "Sen" or "Theil" interval).
    These index rules reproduce ``scipy.stats.theilslopes`` exactly.
    ``Var(S)`` includes the tie correction, so tied values give a shorter
    interval. This is a normal approximation to S and can be optimistic for
    very short or strongly autocorrelated series; it does not correct for
    serial dependence.

    Returns a dict with ``slope``, ``low``, ``high``, ``alpha``, ``n``,
    ``n_dropped`` and ``n_pairs``. For fewer than ``MIN_POINTS`` valid pairs,
    ``low`` and ``high`` are NaN.
    """
    y, v, n_dropped = _prepare(years, values)
    n = int(v.size)
    _check_alpha(alpha)
    nan = float("nan")
    result = {
        "slope": nan,
        "low": nan,
        "high": nan,
        "alpha": float(alpha),
        "n": n,
        "n_dropped": n_dropped,
        "n_pairs": 0,
        "note": "",
    }
    if n < MIN_POINTS:
        result["note"] = f"fewer than {MIN_POINTS} valid points"
        return result

    i, j = np.triu_indices(n, k=1)
    slopes = np.sort((v[j] - v[i]) / (y[j] - y[i]))
    n_pairs = slopes.size

    c = float(norm.ppf(1.0 - alpha / 2.0) * np.sqrt(_var_s(v)))
    lower_index = int(np.round((n_pairs - c) / 2.0)) - 1
    upper_index = int(np.round((n_pairs + c) / 2.0))
    lower_index = min(max(lower_index, 0), n_pairs - 1)
    upper_index = min(max(upper_index, 0), n_pairs - 1)

    result.update(
        {
            "slope": float(np.median(slopes)),
            "low": float(slopes[lower_index]),
            "high": float(slopes[upper_index]),
            "n_pairs": int(n_pairs),
        }
    )
    return result


def mann_kendall(years, values, alpha=0.05):
    """Plain Mann-Kendall trend test (Mann 1945; Kendall 1975).

    Assumption: observations are independent and identically distributed under
    the null hypothesis of no trend. This is the assumption that fails for
    autocorrelated seasonal rainfall, where the false-positive rate is inflated.
    ``var_s`` includes the tie correction. Returns ``s``, ``var_s``, ``z``,
    ``p``, ``n``, ``n_dropped`` and ``alpha``.
    """
    _, v, n_dropped = _prepare(years, values)
    n = int(v.size)
    _check_alpha(alpha)
    if n < MIN_POINTS:
        return _empty_result("mann_kendall", n, n_dropped, alpha)
    s = _mk_statistic(v)
    var_s = _var_s(v)
    z = _z_score(s, var_s)
    return {
        "method": "mann_kendall",
        "n": n,
        "n_dropped": n_dropped,
        "s": s,
        "var_s": var_s,
        "z": z,
        "p": _p_value(z),
        "alpha": float(alpha),
        "note": "",
    }


def mann_kendall_hamed_rao(years, values, alpha=0.05, max_lag=None):
    """Mann-Kendall test with the Hamed and Rao (1998) variance correction.

    The series is detrended with the Sen slope, ranked, and the lag-k
    autocorrelations of the ranks are used to inflate ``Var(S)``:

        n/n* = 1 + 2/(n(n-1)(n-2)) * sum_k (n-k)(n-k-1)(n-k-2) * rho_k

    Assumption: the only dependence that matters is serial correlation that the
    detrended ranks can measure, and the correlation structure is the same at
    every lag used. Only lags whose autocorrelation exceeds the
    ``z_(1-alpha/2)/sqrt(n)`` band are counted, which is the Hamed-Rao
    significance rule. ``max_lag=None`` uses every available lag (1..n-1),
    matching the common implementation; passing 3 restricts the sum to the
    first three lags as also suggested in that paper.

    Caution: strongly negative lag-1 autocorrelation can make ``n/n* < 1`` and
    the test anti-conservative. The p-value is still two-sided.
    """
    y, v, n_dropped = _prepare(years, values)
    n = int(v.size)
    _check_alpha(alpha)
    if max_lag is not None and int(max_lag) < 1:
        raise ValueError("max_lag must be at least 1, or None for every lag")
    if n < MIN_POINTS:
        result = _empty_result("mann_kendall_hamed_rao", n, n_dropped, alpha)
        result.update(
            {
                "var_s_uncorrected": float("nan"),
                "var_inflation": float("nan"),
                "max_lag": 0,
            }
        )
        return result

    s = _mk_statistic(v)
    var_s = _var_s(v)

    slope, _ = sen_slope(y, v)
    detrended = v - slope * (y - y[0])
    ranks = rankdata(detrended).astype(float)

    last_lag = n - 1 if max_lag is None else min(int(max_lag), n - 1)
    rho = _acf(ranks, last_lag)

    band = float(norm.ppf(1.0 - alpha / 2.0) / np.sqrt(n))
    total = 0.0
    for k in range(1, last_lag + 1):
        if abs(rho[k]) > band:
            total += (n - k) * (n - k - 1) * (n - k - 2) * rho[k]

    inflation = 1.0 + 2.0 * total / (n * (n - 1) * (n - 2))
    var_corrected = var_s * inflation
    z = _z_score(s, var_corrected)
    return {
        "method": "mann_kendall_hamed_rao",
        "n": n,
        "n_dropped": n_dropped,
        "s": s,
        "var_s": var_corrected,
        "var_s_uncorrected": var_s,
        "var_inflation": float(inflation),
        "max_lag": last_lag,
        "z": z,
        "p": _p_value(z),
        "alpha": float(alpha),
        "note": "",
    }


def mann_kendall_yue_wang(years, values, alpha=0.05, trend_preserving=True):
    """Mann-Kendall test after Yue-Wang prewhitening.

    Two variants, both from Yue and Wang (2002) / Yue et al. (2002):

    ``trend_preserving=True`` (default) is the trend-free prewhitening (TFPW)
    variant: remove the Sen trend, estimate lag-1 autocorrelation ``rho1`` from
    the detrended series, form ``x_t - rho1 * x_(t-1)``, then add the trend back
    before applying the Mann-Kendall test. The trend is preserved, so power
    stays reasonable.

    ``trend_preserving=False`` is the classic prewhitening variant: ``rho1`` is
    estimated from the raw series and the differenced series is tested without
    restoring the trend. That removes part of the trend itself, which biases
    the test towards "no trend" when a real trend is present.

    Assumption: the serial dependence is first-order autoregressive and the
    lag-1 coefficient is a good summary of it. Higher-order dependence is not
    handled. ``rho1`` is not clipped at zero. The p-value is two-sided.

    Note that a separate Yue-Wang *variance-correction* variant exists; it is
    not implemented here.
    """
    y, v, n_dropped = _prepare(years, values)
    n = int(v.size)
    _check_alpha(alpha)
    if n < MIN_POINTS:
        result = _empty_result("mann_kendall_yue_wang", n, n_dropped, alpha)
        result.update(
            {
                "n_input": n,
                "rho1": float("nan"),
                "trend_preserving": bool(trend_preserving),
            }
        )
        return result

    if trend_preserving:
        slope, _ = sen_slope(y, v)
        detrended = v - slope * (y - y[0])
        rho1 = float(_acf(detrended, 1)[1])
        whitened = detrended[1:] - rho1 * detrended[:-1]
        tested = whitened + slope * (y[1:] - y[0])
    else:
        rho1 = float(_acf(v, 1)[1])
        tested = v[1:] - rho1 * v[:-1]

    s = _mk_statistic(tested)
    var_s = _var_s(tested)
    z = _z_score(s, var_s)
    return {
        "method": "mann_kendall_yue_wang",
        "n": int(tested.size),
        "n_dropped": n_dropped,
        "n_input": n,
        "s": s,
        "var_s": var_s,
        "rho1": rho1,
        "trend_preserving": bool(trend_preserving),
        "z": z,
        "p": _p_value(z),
        "alpha": float(alpha),
        "note": "",
    }
