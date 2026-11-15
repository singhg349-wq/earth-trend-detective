#!/usr/bin/env python3
"""Generate the TypeScript test fixtures in frontend/src/lib/__fixtures__/.

What this script proves
-----------------------
The expected Sen slopes come from :func:`backend.trend.stats.sen_slope`, the
same function the Python backend uses. ``frontend/src/lib/stats.test.ts`` runs
the browser implementation against those numbers, and
``tests/test_js_python_slope.py`` recomputes them from the source data, so a
drift in either language fails a test.

Series included
---------------
* all ten real regional DJF files in ``data/artifacts/`` (42 years each),
* real 1-degree cells decoded from two (or more) real tile files under
  ``data/artifacts/grid/precip/DJF/``,
* derived copies of a real regional series and a real cell with years masked to
  the int16 fill value, so gap handling is checked on real values,
* one short sub-period (fewer than 8 valid years) to record the one place the
  two languages deliberately differ (see below),
* the original synthetic cases used by the earlier tests.

The n < 8 difference
--------------------
``backend.trend.stats.sen_slope`` returns NaN below its ``MIN_POINTS`` of 8,
because a trend is not reported for such a short series. The descriptive
browser helper ``senSlope`` still returns the median pairwise slope for any
n >= 2, because it is used only for the descriptive full-series number. Fixture
blocks therefore carry ``python_comparable``: true means both languages must
agree; false means Python returns NaN by design and the stored number is the
descriptive value the browser shows.

Also written: the tiny worked-example tile from docs/GRID_FORMAT.md section 9.4,
the minimal index.json needed to exercise it, a 42-year inference tile, and the
inference cases file used by the TypeScript tests. The inference cases are
illustrative placeholders in the agreed shape, not computed science.

Run from the repository root:
    python scripts/make_stats_fixtures.py
"""

from __future__ import annotations

import itertools
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from scipy.stats import theilslopes

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DATA_DIR = ROOT / "data" / "artifacts"
GRID_DIR = DATA_DIR / "grid"
OUT_DIR = ROOT / "frontend" / "src" / "lib" / "__fixtures__"
GRID_OUT_DIR = OUT_DIR / "grid"
FILL = -32768

INFERENCE_METHOD = "MK + Hamed-Rao (3 lags)"
SLOPE_CI_NOTE = (
    "95% slope interval (assumes independent years; narrower than true "
    "uncertainty when years correlate)"
)

try:
    from backend.trend.stats import MIN_POINTS as PYTHON_MIN_POINTS
    from backend.trend.stats import sen_slope as BACKEND_SEN_SLOPE
except Exception as error:  # pragma: no cover - a broken checkout should fail loudly
    raise SystemExit(
        "cannot import backend.trend.stats.sen_slope from the repository root: "
        f"{error}"
    ) from error


def _is_valid(value: Any) -> bool:
    """True for a real measurement, False for null, NaN or the int16 fill."""
    if value is None:
        return False
    if not isinstance(value, (int, float)):
        return False
    if not math.isfinite(float(value)):
        return False
    return float(value) != FILL


def _descriptive_slope(xs: list[float], ys: list[float]) -> float:
    """Median pairwise slope, the estimator the browser uses for any n >= 2."""
    slopes = [
        (ys[j] - ys[i]) / (xs[j] - xs[i])
        for i, j in itertools.combinations(range(len(xs)), 2)
        if xs[j] != xs[i]
    ]
    return float(np.median(slopes))


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
            "python_comparable": False,
            "python_note": f"backend sen_slope returns NaN below {PYTHON_MIN_POINTS} valid years",
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
            "python_comparable": False,
            "python_note": "fewer than two valid years; backend sen_slope returns NaN",
        }

    comparable = count >= PYTHON_MIN_POINTS
    if comparable:
        slope_per_year = float(BACKEND_SEN_SLOPE(xs, ys)[0])
        note = ""
    else:
        slope_per_year = _descriptive_slope(xs, ys)
        note = (
            f"Python backend sen_slope returns NaN below {PYTHON_MIN_POINTS} valid "
            "years; this stored value is the descriptive browser slope."
        )

    intercept = float(np.median(ys) - slope_per_year * np.median(xs))
    return {
        "slope_per_year": round(slope_per_year, 12),
        "slope_per_decade": round(slope_per_year * 10.0, 12),
        "intercept": round(intercept, 12),
        "n": count,
        "period": period,
        "python_comparable": comparable,
        "python_note": note,
    }


def _case(
    name: str,
    years: Iterable[int],
    values: Iterable[float | None],
    periods: Iterable[tuple[int, int]] = (),
    *,
    kind: str = "synthetic",
    source_file: str | None = None,
    note: str = "",
    masked_years: Iterable[int] = (),
    cell_id: str | None = None,
) -> dict[str, Any]:
    year_list = [int(year) for year in years]
    value_list = [
        None
        if value is None
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        else float(value)
        for value in values
    ]
    if len(year_list) != len(value_list):
        raise ValueError(f"{name}: years and values differ in length")

    period_cases = [
        {
            "start_year": int(start_year),
            "end_year": int(end_year),
            "expected": _expected(year_list, value_list, start_year, end_year),
        }
        for start_year, end_year in periods
    ]

    payload: dict[str, Any] = {
        "name": name,
        "kind": kind,
        "years": year_list,
        "values": value_list,
        "expected_full": _expected(year_list, value_list),
        "periods": period_cases,
    }
    if source_file:
        payload["source_file"] = source_file
    if cell_id:
        payload["cell_id"] = cell_id
    if note:
        payload["note"] = note
    if list(masked_years):
        payload["masked_years"] = [int(year) for year in masked_years]
    return payload


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _decode_int16(q: Any, scale: float, offset: float, decimals: float) -> float | None:
    """Inverse of docs/GRID_FORMAT.md section 4.2 for one integer."""
    if q is None or q == FILL:
        return None
    return float(f"{float(q) * scale + offset:.{int(decimals)}f}")


def _precip_meta() -> tuple[list[int], dict[str, Any]]:
    index = json.loads((GRID_DIR / "index.json").read_text(encoding="utf-8"))
    meta = index["variables"]["precip"]
    return [int(year) for year in meta["years_by_season"]["DJF"]], meta


def _mask(values: list[float | None], years: list[int], masked: list[int]) -> list[float | None]:
    """Replace the years in ``masked`` with fill/null, keeping the year axis."""
    positions = {year: index for index, year in enumerate(years)}
    out = list(values)
    for count, year in enumerate(masked):
        # Alternate null and the int16 fill so both missing spellings are tested.
        out[positions[year]] = None if count % 2 == 0 else float(FILL)
    return out


def build_synthetic_cases() -> list[dict[str, Any]]:
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
        _case(
            "medium_eight_years_1990_1997",
            range(1990, 1998),
            [round(2.0 + 0.03 * index, 3) for index in range(8)],
            periods=[(1990, 1993), (1994, 1997)],
        ),
    ]


def build_regional_cases() -> list[dict[str, Any]]:
    """One case per real regional DJF artifact, plus derived gap variants."""
    cases: list[dict[str, Any]] = []
    files = sorted(DATA_DIR.glob("precip_*_DJF.json"))
    if not files:
        raise SystemExit(f"no regional artifacts found under {DATA_DIR}")

    for path in files:
        payload = json.loads(path.read_text(encoding="utf-8"))
        years = [int(year) for year in payload["years"]]
        values = payload["values"]
        region = payload["region"]["id"]
        name = f"regional_{region}_{payload['season']['code']}"
        # Two ten-year sub-periods for every regional series (n = 10 > MIN_POINTS).
        periods = [(years[17], years[26]), (years[27], years[36])]
        if region == "indonesia":
            # A deliberately short five-year window: descriptive in the browser,
            # NaN in the backend, recorded as python_comparable = false.
            periods.append((years[32], years[36]))
        cases.append(
            _case(
                name,
                years,
                values,
                periods=periods,
                kind="regional",
                source_file=_relative(path),
                note=(
                    "Real regional DJF series. The artifact has no gaps; values are "
                    "used exactly as stored."
                ),
            )
        )

    india_path = DATA_DIR / "precip_india_DJF.json"
    india = json.loads(india_path.read_text(encoding="utf-8"))
    india_years = [int(year) for year in india["years"]]
    masked_years = [1989, 1997, 2006, 2014]
    cases.append(
        _case(
            "regional_india_DJF_masked_for_gaps",
            india_years,
            _mask(india["values"], india_years, masked_years),
            periods=[(1990, 2010), (2015, 2025)],
            kind="regional-gap-variant",
            source_file=_relative(india_path),
            note=(
                "Derived from the real India series: four years replaced by null/ "
                "-32768 to exercise gap handling. The source artifact itself has no gaps."
            ),
            masked_years=masked_years,
        )
    )
    return cases


def _tile_cell_case(
    *,
    name: str,
    tile_key: str,
    cell_id: str,
    years: list[int],
    values: list[float | None],
    periods: Iterable[tuple[int, int]] = (),
    masked_years: Iterable[int] = (),
    note: str = "",
) -> dict[str, Any]:
    tile_path = GRID_DIR / "precip" / "DJF" / f"{tile_key}.json"
    return _case(
        name,
        years,
        values,
        periods=periods,
        kind="grid-cell-gap-variant" if list(masked_years) else "grid-cell",
        source_file=_relative(tile_path),
        note=note,
        masked_years=masked_years,
        cell_id=cell_id,
    )


def build_grid_cell_cases() -> list[dict[str, Any]]:
    """Real 1-degree cells decoded with the documented int16 rules."""
    years, meta = _precip_meta()
    scale, offset, decimals = meta["scale"], meta["offset"], meta["decimals"]

    chosen = [
        ("-80_-10", "cell_-4.5_-79.5"),  # coastal Peru
        ("-80_-10", "cell_-9.5_-79.5"),
        ("100_-10", "cell_-0.5_100.5"),  # Indonesia
        ("100_-10", "cell_-4.5_105.5"),
    ]
    cases = []
    for tile_key, cell_id in chosen:
        tile_path = GRID_DIR / "precip" / "DJF" / f"{tile_key}.json"
        tile = json.loads(tile_path.read_text(encoding="utf-8"))
        cell = tile["cells"][cell_id]
        values = [_decode_int16(q, scale, offset, decimals) for q in cell["v"]]
        if len(values) != len(years):
            raise SystemExit(f"{tile_key}/{cell_id}: value length does not match DJF years")
        cases.append(
            _tile_cell_case(
                name=f"grid_{tile_key}_{cell_id}".replace("-", "m"),
                tile_key=tile_key,
                cell_id=cell_id,
                years=years,
                values=values,
                periods=[(years[6], years[15])],  # a 10-year sub-period
                note=(
                    "Real tile cell decoded from int16 with scale/offset from index.json. "
                    f"Stored tile slope s={cell['s']} is not used; the values are."
                ),
            )
        )

    tile_key = "-80_-10"
    cell_id = "cell_-9.5_-79.5"
    tile_path = GRID_DIR / "precip" / "DJF" / f"{tile_key}.json"
    tile = json.loads(tile_path.read_text(encoding="utf-8"))
    cell = tile["cells"][cell_id]
    masked_years = [years[2], years[13], years[27], years[38], years[41]]
    values = _mask(
        [_decode_int16(q, scale, offset, decimals) for q in cell["v"]],
        years,
        masked_years,
    )
    cases.append(
        _tile_cell_case(
            name="grid_peru_cell_masked_for_gaps",
            tile_key=tile_key,
            cell_id=cell_id,
            years=years,
            values=values,
            periods=[(years[5], years[20]), (years[21], years[35])],
            masked_years=masked_years,
            note=(
                "Derived from a real Peru tile cell: five years replaced by null/ "
                "-32768 so gaps are tested on real decoded values."
            ),
        )
    )
    return cases


def build_real_tile_expectations() -> dict[str, Any]:
    """Python-decoded values for two real tile files, used by the vitest disk test.

    The test reads these tile files from disk at run time and compares the
    TypeScript decoder with these numbers. The files are listed relative to the
    repository root; no machine-specific path is stored.
    """
    years, meta = _precip_meta()
    tiles = []
    for tile_key, cell_ids, clicks in [
        (
            "-80_-10",
            ["cell_-4.5_-79.5", "cell_-9.5_-79.5"],
            [(-79.2, -4.2), (-79.2, -9.2)],
        ),
        (
            "100_-10",
            ["cell_-0.5_100.5", "cell_-4.5_105.5"],
            [(100.2, -0.2), (105.2, -4.2)],
        ),
    ]:
        tile_path = GRID_DIR / "precip" / "DJF" / f"{tile_key}.json"
        tile = json.loads(tile_path.read_text(encoding="utf-8"))
        cells = []
        for cell_id, (lon, lat) in zip(cell_ids, clicks):
            cell = tile["cells"][cell_id]
            values = [
                _decode_int16(q, meta["scale"], meta["offset"], meta["decimals"])
                for q in cell["v"]
            ]
            raw_coverage = (
                [cell["c"]] * len(cell["v"])
                if isinstance(cell["c"], int)
                else cell["c"]
            )
            coverage = [
                0.0
                if qv == FILL
                else (
                    _decode_int16(
                        qc,
                        meta["coverage_scale"],
                        meta["coverage_offset"],
                        meta["coverage_decimals"],
                    )
                    or 0.0
                )
                for qv, qc in zip(cell["v"], raw_coverage)
            ]
            valid_years = [year for year, value in zip(years, values) if value is not None]
            valid_values = [value for value in values if value is not None]
            slope, intercept = BACKEND_SEN_SLOPE(valid_years, valid_values)
            cells.append(
                {
                    "cell_id": cell_id,
                    "click": {"lon": lon, "lat": lat},
                    "raw_s": cell["s"],
                    "decoded": {
                        "years": years,
                        "values": values,
                        "coverage": coverage,
                        "n_valid": len(valid_values),
                        "slope_per_decade_raw": round(float(slope) * 10.0, 12),
                        "intercept": round(float(intercept), 12),
                    },
                }
            )
        tiles.append(
            {
                "path": _relative(tile_path),
                "v_slug": tile["v_slug"],
                "season": tile["season"],
                "tile": tile["tile"],
                "cells": cells,
            }
        )

    return {
        "note": (
            "Expected decodes computed by scripts/make_stats_fixtures.py with Python "
            "from the real tile files. Regenerate rather than edit by hand. "
            "tests/test_js_python_slope.py checks these numbers against the same tiles."
        ),
        "index_path": _relative(GRID_DIR / "index.json"),
        "tiles": tiles,
    }


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
                    "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA306",
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
                    "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA306",
                },
                "years_by_season": {"DJF": years},
                "available_tiles": ["-80_-10"],
            }
        },
    }
    return index, tile


def main() -> None:
    cases = build_synthetic_cases() + build_regional_cases() + build_grid_cell_cases()
    comparable = sum(1 for case in cases if case["expected_full"]["python_comparable"])
    stats_payload = {
        "source": "backend.trend.stats.sen_slope",
        "python_min_points": PYTHON_MIN_POINTS,
        "fill_value": FILL,
        "note": (
            "Generated by scripts/make_stats_fixtures.py; regenerate rather than edit "
            "by hand. python_comparable is true when backend.trend.stats.sen_slope "
            "returns a number for the same block; below its MIN_POINTS the stored "
            "value is the descriptive browser slope and Python returns NaN."
        ),
        "cases": cases,
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

    real_tiles = build_real_tile_expectations()
    write_json(OUT_DIR / "real_tiles.json", real_tiles)

    print(f"wrote {OUT_DIR / 'stats_fixtures.json'} ({len(cases)} cases, {comparable} Python-comparable)")
    print(f"wrote {OUT_DIR / 'inference_cases.json'}")
    print(f"wrote {OUT_DIR / 'real_tiles.json'} ({len(real_tiles['tiles'])} tiles)")
    print(f"wrote {GRID_OUT_DIR / 'index.json'}")
    print(f"wrote {GRID_OUT_DIR / 'precip' / 'DJF' / '-80_-10.json'}")
    print(f"wrote {GRID_OUT_DIR / 'inference_index.json'}")
    print(f"wrote {GRID_OUT_DIR / 'inference_tile.json'}")


if __name__ == "__main__":
    main()
