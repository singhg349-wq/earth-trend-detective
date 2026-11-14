"""Predeclared ENSO association analysis for DJF rainfall artifacts."""
from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
from scipy.stats import rankdata, spearmanr, t as student_t

from backend.trend.stats import sen_slope


def read_january_oni(path):
    """Read January ONI from NOAA PSL's whitespace annual table or year/value CSV."""
    path = Path(path)
    text = path.read_text(encoding="utf-8-sig")
    rows = {}
    for line in text.splitlines():
        parts = line.replace(",", " ").split()
        try:
            year = int(parts[0])
        except (ValueError, IndexError):
            continue
        if len(parts) >= 13:
            value = float(parts[1])
        elif len(parts) >= 2:
            value = float(parts[1])
        else:
            continue
        rows[year] = None if value <= -99 else value
    if not rows:
        raise ValueError(f"No year/value ONI rows found in {path}")
    return rows


def detrend_sen(years, values):
    years = np.asarray(years, dtype=float)
    values = np.asarray(values, dtype=float)
    slope, intercept = sen_slope(years, values)
    if not np.isfinite(slope):
        raise ValueError("Sen detrending requires at least 8 finite years")
    return values - (slope * years + intercept), float(slope), float(intercept)


def lag1(values, years=None):
    values = np.asarray(values, dtype=float)
    if years is None:
        left, right = values[:-1], values[1:]
    else:
        years = np.asarray(years, dtype=int)
        adjacent = np.diff(years) == 1
        left, right = values[:-1][adjacent], values[1:][adjacent]
    if len(left) < 2 or np.std(left) == 0 or np.std(right) == 0:
        return 0.0
    return float(np.corrcoef(left, right)[0, 1])


def spearman_association(x, y):
    """Spearman rank correlation for two paired series."""
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    if x.size != y.size or x.size < 2:
        raise ValueError("Spearman correlation requires equal-length paired series")
    return float(spearmanr(x, y).statistic)


def effective_sample_size_p(rs, n, r1_x, r1_y):
    product = r1_x * r1_y
    denominator = 1.0 + product
    neff = float(n) if abs(denominator) < 1e-12 else n * (1.0 - product) / denominator
    neff = float(np.clip(neff, 3.0, float(n)))
    df = neff - 2.0
    if not np.isfinite(rs) or abs(rs) >= 1:
        p = 0.0 if abs(rs) == 1 else None
    else:
        stat = rs * np.sqrt(df / (1.0 - rs * rs))
        p = float(2.0 * student_t.sf(abs(stat), df))
    return neff, p


def block_bootstrap_interval(years, x, y, seed=20261114, n_resamples=10000, block_length=3):
    """Paired circular moving-block percentile interval; input years must be contiguous."""
    years = np.asarray(years, dtype=int)
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=float)
    if len(years) != len(x) or len(x) != len(y) or len(years) < 20:
        raise ValueError("Bootstrap requires at least 20 paired contiguous years")
    if not np.all(np.diff(years) == 1):
        raise ValueError("Bootstrap years must be contiguous; gaps are not bridged")
    rng = np.random.default_rng(seed)
    n = len(years)
    blocks_needed = int(np.ceil(n / block_length))
    starts = np.arange(n)
    estimates = np.empty(n_resamples)
    jitter_scale_x = (float(np.std(x)) or 1.0) * 1e-10
    jitter_scale_y = (float(np.std(y)) or 1.0) * 1e-10
    for i in range(n_resamples):
        selected = np.concatenate([
            (start + np.arange(block_length)) % n
            for start in rng.choice(starts, size=blocks_needed, replace=True)
        ])[:n]
        bx, by = x[selected], y[selected]
        # Random tie-breaking avoids duplicated sampled years retaining artificial rank ties.
        bx = bx + rng.uniform(-jitter_scale_x, jitter_scale_x, n)
        by = by + rng.uniform(-jitter_scale_y, jitter_scale_y, n)
        estimates[i] = spearmanr(bx, by).statistic
    return [float(v) for v in np.quantile(estimates, [0.025, 0.975])]


def _longest_contiguous_run(years):
    if not years:
        return []
    runs, current = [], [years[0]]
    for year in years[1:]:
        if year == current[-1] + 1:
            current.append(year)
        else:
            runs.append(current)
            current = [year]
    runs.append(current)
    return max(runs, key=len)


def analyze_region(artifact_path, oni_path, region_key=None, seed=20261114):
    artifact_path = Path(artifact_path)
    artifact = json.loads(artifact_path.read_text(encoding="utf-8"))
    oni = read_january_oni(oni_path)
    years, rainfall, index, excluded = [], [], [], []
    for year, value in zip(artifact["years"], artifact["values"]):
        ov = oni.get(int(year))
        if value is None or not np.isfinite(value):
            excluded.append({"year": int(year), "reason": "missing rainfall artifact value"})
        elif ov is None or not np.isfinite(ov):
            excluded.append({"year": int(year), "reason": "missing January ONI"})
        else:
            years.append(int(year)); rainfall.append(float(value)); index.append(float(ov))
    years = np.asarray(years, dtype=int)
    rainfall, index = np.asarray(rainfall), np.asarray(index)
    if len(years) < 8:
        raise ValueError("At least 8 matched years are required for Sen detrending")
    rain_res, rain_slope, rain_intercept = detrend_sen(years, rainfall)
    oni_res, oni_slope, oni_intercept = detrend_sen(years, index)
    rs = spearman_association(rain_res, oni_res)
    r1_rain, r1_oni = lag1(rain_res, years), lag1(oni_res, years)
    neff, p_value = effective_sample_size_p(rs, len(years), r1_rain, r1_oni)
    run = _longest_contiguous_run(years.tolist())
    run_mask = np.isin(years, run)
    if len(run) >= 20:
        interval = block_bootstrap_interval(run, rain_res[run_mask], oni_res[run_mask], seed=seed)
    else:
        interval = None
    comparisons = []
    for threshold in (0.5, 1.0):
        group = index >= threshold
        comparisons.append({
            "threshold_c": threshold,
            "el_nino_mean_rainfall_mm_day": float(np.mean(rainfall[group])) if group.any() else None,
            "el_nino_year_count": int(group.sum()),
            "other_mean_rainfall_mm_day": float(np.mean(rainfall[~group])) if (~group).any() else None,
            "other_year_count": int((~group).sum()),
        })
    return {
        "region": region_key or artifact["region"]["id"],
        "label": artifact["region"]["label"], "season": "DJF", "years_target": [1984, 2025],
        "rainfall_source": "day-weighted DJF box-mask product in backend.trend artifact; mm/day",
        "oni_source": "CPC ONI, January value (already DJF three-month mean)",
        "n": int(len(years)), "matched_years": years.tolist(), "excluded_years": excluded,
        "detrending": "Sen slope from backend.trend.stats removed separately from both series",
        "rainfall_sen_slope_per_year": rain_slope, "oni_sen_slope_per_year": oni_slope,
        "rs": rs, "lag1_rainfall_residual": r1_rain, "lag1_oni_residual": r1_oni,
        "effective_sample_size": neff, "p_value_two_sided_approx": p_value,
        "effective_sample_size_formula": "N_eff = n * (1 - r1_rain * r1_oni) / (1 + r1_rain * r1_oni), clamped to [3, n]",
        "lag1_note": "Calculated only from adjacent calendar-year pairs; gaps are not stitched together.",
        "p_value_method": "t approximation with df=N_eff-2 using lag-1 product correction",
        "block_bootstrap_95_interval": interval,
        "bootstrap": {"resamples": 10000, "block_years": 3, "circular": True, "seed": seed,
                      "tie_breaking": "independent uniform jitter, 1e-10 times series SD, before ranks",
                      "years_used": run, "note": "Approximate with 42 years; uses longest contiguous matched run."},
        "el_nino_rainfall_comparison": comparisons,
        "eligibility": "inferential under declared design" if len(years) >= 20 else "exploratory: fewer than 20 matched years",
    }
