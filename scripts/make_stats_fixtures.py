#!/usr/bin/env python3
"""Generate the TypeScript test fixtures in frontend/src/lib/__fixtures__/.

Expected statistical values:
    This branch does NOT contain backend/trend/stats.py, so the expected Sen
    slopes in this run were computed with scipy.stats.theilslopes (the script
    records the actual source in the `source` field). If a later branch adds
    `backend/trend/stats.py` with a callable `sen_slope(years, values)`, the
    script uses it first and falls back to scipy with a warning if the call
    fails or its return shape is not understood.

Method:
    Slope is the median of all pairwise slopes (y_j - y_i) / (x_j - x_i) in
    calendar years, then multiplied by 10 for the per-decade value. Intercept
    follows the scipy convention: median(y) - slope_per_year * median(x).
    Missing values (None/NaN and the int16 fill -32768) are skipped.

Also writes the tiny worked-example tile from docs/GRID_FORMAT.md section 9.4,
the minimal index.json needed to exercise it, a 42-year inference tile, and the
inference cases file used by the TypeScript tests.

The inference cases are illustrative placeholders in the agreed shape, not
computed science. The notes in that file say so; do not copy those numbers into
results.

Run from the repository root:
    python scripts/make_stats_fixtures.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from scipy.stats import theilslopes

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "frontend" / "src" / "lib" / "__fixtures__"
GRID_OUT_DIR = OUT_DIR / "grid"
FILL = -32768

INFERENCE_METHOD = "MK + Hamed-Rao (3 lags)"
SLOPE_CI_NOTE = (
    "95% slope interval (assumes independent years; narrower than true "
    "uncertainty when years correlate)"
)


def _load_backend_sen_slope():
    """Return backend.trend.stats.sen_slope when it exists in this branch."""
    try:
        sys.path.insert(0, str(ROOT))
        from backend.trend.stats import sen_slope  # type: ignore

        return sen_slope
    except Exception:
        return None


BACKEND_SEN_SLOPE = _load_backend_sen_slope()


def _is_valid(value: Any) -> bool:
    if value is None:
        return False
    if not isinstance(value, (int, float)):
        return False
    if not math.isfinite(float(value)):
        return False
    return float(value) != FILL


def _backend_slope_per_year(years: list[int], values: list[float]) -> float | None:
    """Adapt the optional backend result to a per-year slope.

    Accepted shapes: a number, a (slope, intercept) sequence, or a dict with
    slope_per_year / slope / slope_per_decade / sen_slope_per_decade.
    """
    if BACKEND_SEN_SLOPE is None:
        return None
    try:
        result = BACKEND_SEN_SLOPE(years, values)
    except Exception as error:
        print(
            f"warning: backend sen_slope failed ({error}); using scipy",
            file=sys.stderr,
        )
        return None

    if isinstance(result, dict):
        if "slope_per_year" in result:
            return float(result["slope_per_year"])
        if "slope" in result:
            return float(result["slope"])
        if "slope_per_decade" in result:
            return float(result["slope_per_decade"]) / 10.0
        if "sen_slope_per_decade" in result:
            return float(result["sen_slope_per_decade"]) / 10.0
        return None
    if isinstance(result, (tuple, list)):
        if not result:
            return None
        return float(result[0])
    if isinstance(result, (int, float)):
        return float(result)
    return None


def _expected(
    years: list[int],
    values: list[float | None],
    start_year: int | None = None,
    end_year: int | None = None,
) -> dict[str, Any]:
    pairs = [
        (float(year), float(value))
        for year, value in zip(years, values)
        if _is_valid(value)
        and (start_year is None or year >= start_year)
        and (end_year is None or year <= end_year)
    ]
    count = len(pairs)
    if count == 0:
        return {
            "slope_per_year": None,
            "slope_per_decade": None,
            "intercept": None,
            "n": 0,
            "period": None,
        }

    xs = [pair[0] for pair in pairs]
    ys = [pair[1] for pair in pairs]
    period = [int(min(xs)), int(max(xs))]
    if count < 2:
        return {
            "slope_per_year": None,
            "slope_per_decade": None,
            "intercept": None,
            "n": count,
            "period": period,
        }

    slope_per_year = _backend_slope_per_year(
        [int(x) for x in xs], [float(y) for y in ys]
    )
    if slope_per_year is None:
        slope_per_year = float(theilslopes(ys, xs).slope)

    intercept = float(np.median(ys) - slope_per_year * np.median(xs))
    return {
        "slope_per_year": round(slope_per_year, 12),
        "slope_per_decade": round(slope_per_year * 10.0, 12),
        "intercept": round(intercept, 12),
        "n": count,
        "period": period,
    }


def _case(
    name: str,
    years: Iterable[int],
    values: Iterable[float | None],
    periods: Iterable[tuple[int, int]] = (),
) -> dict[str, Any]:
    year_list = [int(year) for year in years]
    value_list = [
        None
        if value is None or not isinstance(value, (int, float)) or not math.isfinite(float(value))
        else float(value)
        for value in values
    ]
    if len(year_list) != len(value_list):
        raise ValueError(f"{name}: years and values differ in length")

    period_cases = []
    for start_year, end_year in periods:
        period_cases.append(
            {
                "start_year": start_year,
                "end_year": end_year,
                "expected": _expected(year_list, value_list, start_year, end_year),
            }
        )

    return {
        "name": name,
        "years": year_list,
        "values": value_list,
        "expected_full": _expected(year_list, value_list),
        "periods": period_cases,
    }


def build_cases() -> list[dict[str, Any]]:
    linear_years = list(range(1984, 2026))
    linear_values = [round(1.0 + 0.01 * index, 2) for index in range(len(linear_years))]

    fill_years = list(range(1984, 2026))
    fill_values: list[float | None] = [
        round(2.0 + 0.02 * index, 3) for index in range(len(fill_years))
    ]
    fill_values[fill_years.index(1990)] = None
    fill_values[fill_years.index(2003)] = None
    fill_values[fill_years.index(2010)] = float(FILL)

    wave_years = list(range(1984, 2026))
    wave_values = [
        round(3.0 + 0.005 * index + 0.4 * math.sin(index / 3.0), 4)
        for index in range(len(wave_years))
    ]

    negative_years = list(range(1995, 2016))
    negative_values: list[float | None] = [
        round(5.0 - 0.03 * index, 3) for index in range(len(negative_years))
    ]
    negative_values[4] = None
    negative_values[15] = float(FILL)

    return [
        _case(
            "worked_example_three_years",
            [2023, 2024, 2025],
            [1.42, 1.50, 1.68],
            periods=[(2023, 2025), (2024, 2025)],
        ),
        _case(
            "linear_42_years_1984_2025",
            linear_years,
            linear_values,
            periods=[(1984, 2005), (2006, 2025), (2000, 2010)],
        ),
        _case(
            "with_fill_values_1984_2025",
            fill_years,
            fill_values,
            periods=[(1984, 2010), (1990, 2005)],
        ),
        _case(
            "nonlinear_wave_42_years",
            wave_years,
            wave_values,
            periods=[(1984, 2004), (2005, 2025)],
        ),
        _case(
            "flat_constant_2000_2010",
            range(2000, 2011),
            [3.5] * 11,
            periods=[(2000, 2005), (2006, 2010)],
        ),
        _case("two_points_2000_2010", [2000, 2010], [1.0, 2.0]),
        _case(
            "all_fill_values",
            [2000, 2001, 2002],
            [None, float(FILL), None],
        ),
        _case("single_valid_year", [2000, 2001, 2002], [None, 5.0, None]),
        _case(
            "negative_trend_with_gaps",
            negative_years,
            negative_values,
            periods=[(1995, 2005), (2006, 2015)],
        ),
    ]


def write_json(path: Path, payload: Any, *, minified: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if minified:
        text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    else:
        text = json.dumps(payload, indent=2, sort_keys=False, ensure_ascii=False)
    path.write_text(text + "\n", encoding="utf-8")


def build_tiny_grid() -> tuple[dict[str, Any], dict[str, Any]]:
    """Worked example from docs/GRID_FORMAT.md section 9."""
    tile = {
        "v_slug": "precip",
        "season": "DJF",
        "tile": [-80, -10],
        "cells": {
            "cell_-4.5_-79.5": {
                "s": 1300,
                "v": [142, 150, 168],
                "c": 1000,
            }
        },
    }

    index = {
        "format_version": 1,
        "grid_resolution_deg": 1.0,
        "tile_size_deg": 10,
        "fill_int16": FILL,
        "seasons": {
            "DJF": {
                "code": "DJF",
                "year_label": "January year",
                "months": [12, 1, 2],
                "aggregation": "day-weighted mean of 3 monthly values",
            }
        },
        "variables": {
            "precip": {
                "variable": "precipitation",
                "units": "mm/day",
                "slope_units": "mm/day/decade",
                "scale": 0.01,
                "offset": 0.0,
                "decimals": 2,
                "slope_scale": 0.001,
                "slope_offset": 0.0,
                "slope_decimals": 3,
                "coverage_scale": 0.001,
                "coverage_offset": 0.0,
                "coverage_decimals": 3,
                "land_only": False,
                "regrid_note": "GPCP 0.5 deg 2x2 block averaged to 1.0 deg with cos(lat) weights",
                "source": {
                    "product": "GPCPMON",
                    "version": "3.3",
                    "var": "sat_gauge_precip",
                    "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA304",
                },
                "years_by_season": {"DJF": [2023, 2024, 2025]},
                "available_tiles": ["-80_-10"],
            }
        },
    }
    return tile, index


def build_inference_cases() -> list[dict[str, Any]]:
    """Illustrative inference blocks in the agreed shape.

    The p-values, strict-check values and lag-1 values are fixed placeholders so
    the UI and type tests have every combination (pass, fail, caution, short
    series). They are not computed from any series and are not results. The
    short-series case is the shape the app must show whenever n < 8.
    """
    return [
        {
            "name": "ok_significant_no_caution",
            "inference": {
                "status": "ok",
                "p_value": 0.012,
                "ci": [0.004, 0.031],
                "method": INFERENCE_METHOD,
                "strict_check_pass": True,
                "strict_check_p": 0.028,
                "lag1": 0.11,
                "caution": False,
                "ci_note": SLOPE_CI_NOTE,
                "n": 42,
            },
        },
        {
            "name": "ok_not_significant_with_caution",
            "inference": {
                "status": "ok",
                "p_value": 0.214,
                "ci": [-0.077, 0.087],
                "method": INFERENCE_METHOD,
                "strict_check_pass": False,
                "strict_check_p": 0.19,
                "lag1": 0.34,
                "caution": True,
                "ci_note": SLOPE_CI_NOTE,
                "n": 42,
            },
        },
        {
            "name": "short_series_unavailable",
            "inference": {
                "status": "unavailable",
                "p_value": None,
                "ci": None,
                "method": None,
                "strict_check_pass": None,
                "strict_check_p": None,
                "lag1": None,
                "caution": False,
                "ci_note": SLOPE_CI_NOTE,
                "n": 3,
            },
        },
    ]


def _encode_int16(value: float, scale: float) -> int:
    return max(-32767, min(32767, int(np.rint(value / scale))))


def build_inference_grid(
    cases: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """A 42-year tile carrying optional inference and FDR fields.

    Cell A uses the significant/no-caution case, cell B the non-significant
    case with the caution badge, and cell C has no optional fields so tests can
    check the unavailable fallback. Values are a deterministic sine plus trend,
    quantized exactly like the real grid.
    """
    years = list(range(1984, 2026))
    wave_a = [round(4.0 + 0.020 * i + 0.35 * math.sin(i / 2.5), 2) for i in range(len(years))]
    wave_b = [round(3.2 + 0.001 * i + 0.45 * math.sin(i / 1.7), 2) for i in range(len(years))]

    def cell(values: list[float], optional: dict[str, Any]) -> dict[str, Any]:
        xs = [float(year) for year in years]
        ys = [float(value) for value in values]
        fit = theilslopes(ys, xs, alpha=0.05)
        slope_per_decade = float(fit.slope) * 10.0
        payload: dict[str, Any] = {
            "s": _encode_int16(slope_per_decade, 0.001),
            "v": [_encode_int16(value, 0.01) for value in values],
            "c": 1000,
        }
        cell_optional = dict(optional)
        if "inference" in cell_optional:
            # The illustrative case supplies p-values and the lag-1 value; the
            # interval itself is the real Sen interval for this series, so the
            # fixture never shows an interval that excludes its own slope.
            cell_optional["inference"] = {
                **cell_optional["inference"],
                "ci": [
                    round(float(fit.low_slope) * 10.0, 6),
                    round(float(fit.high_slope) * 10.0, 6),
                ],
            }
        payload.update(cell_optional)
        return payload

    tile = {
        "v_slug": "precip",
        "season": "DJF",
        "tile": [-80, -10],
        "cells": {
            "cell_-4.5_-79.5": cell(
                wave_a,
                {
                    "inference": cases[0]["inference"],
                    "fdr_significant": True,
                },
            ),
            "cell_-5.5_-79.5": cell(
                wave_b,
                {
                    "inference": cases[1]["inference"],
                    "fdr_significant": False,
                },
            ),
            "cell_-6.5_-79.5": cell(wave_a, {}),
        },
    }

    index = {
        "format_version": 1,
        "grid_resolution_deg": 1.0,
        "tile_size_deg": 10,
        "fill_int16": FILL,
        "seasons": {
            "DJF": {
                "code": "DJF",
                "year_label": "January year",
                "months": [12, 1, 2],
                "aggregation": "day-weighted mean of 3 monthly values",
            }
        },
        "variables": {
            "precip": {
                "variable": "precipitation",
                "units": "mm/day",
                "slope_units": "mm/day/decade",
                "scale": 0.01,
                "offset": 0.0,
                "decimals": 2,
                "slope_scale": 0.001,
                "slope_offset": 0.0,
                "slope_decimals": 3,
                "coverage_scale": 0.001,
                "coverage_offset": 0.0,
                "coverage_decimals": 3,
                "land_only": False,
                "regrid_note": "GPCP 0.5 deg 2x2 block averaged to 1.0 deg with cos(lat) weights",
                "source": {
                    "product": "GPCPMON",
                    "version": "3.3",
                    "var": "sat_gauge_precip",
                    "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA304",
                },
                "years_by_season": {"DJF": years},
                "available_tiles": ["-80_-10"],
            }
        },
    }
    return index, tile


def main() -> None:
    source = (
        "backend.trend.stats.sen_slope"
        if BACKEND_SEN_SLOPE is not None
        else "scipy.stats.theilslopes"
    )
    stats_payload = {
        "source": source,
        "fill_value": FILL,
        "note": "Generated by scripts/make_stats_fixtures.py; regenerate rather than edit by hand.",
        "cases": build_cases(),
    }
    write_json(OUT_DIR / "stats_fixtures.json", stats_payload)

    inference_cases = build_inference_cases()
    inference_payload = {
        "note": (
            "Test fixtures only. Inference values are illustrative placeholders "
            "in the agreed shape, not results for any series or real data. The "
            "short-series case shows the opinionated unavailable shape used "
            "whenever n < 8. Do not copy these numbers into artifacts."
        ),
        "ci_note": SLOPE_CI_NOTE,
        "method": INFERENCE_METHOD,
        "cases": inference_cases,
    }
    write_json(OUT_DIR / "inference_cases.json", inference_payload)

    tile, index = build_tiny_grid()
    write_json(GRID_OUT_DIR / "index.json", index)
    write_json(GRID_OUT_DIR / "precip" / "DJF" / "-80_-10.json", tile, minified=True)

    inference_index, inference_tile = build_inference_grid(inference_cases)
    write_json(GRID_OUT_DIR / "inference_index.json", inference_index)
    write_json(GRID_OUT_DIR / "inference_tile.json", inference_tile, minified=True)

    print(f"wrote {OUT_DIR / 'stats_fixtures.json'} (source: {source})")
    print(f"wrote {OUT_DIR / 'inference_cases.json'}")
    print(f"wrote {GRID_OUT_DIR / 'index.json'}")
    print(f"wrote {GRID_OUT_DIR / 'precip' / 'DJF' / '-80_-10.json'}")
    print(f"wrote {GRID_OUT_DIR / 'inference_index.json'}")
    print(f"wrote {GRID_OUT_DIR / 'inference_tile.json'}")


if __name__ == "__main__":
    main()
