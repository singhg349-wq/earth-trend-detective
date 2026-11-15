"""Recompute the TypeScript slope fixtures with the Python backend.

The fixture file ``frontend/src/lib/__fixtures__/stats_fixtures.json`` stores
Sen slopes produced by ``backend.trend.stats.sen_slope``. This test recomputes
every block marked ``python_comparable`` from the stored years and values, so a
stale fixture or a changed estimator fails here as well as in vitest.

It also checks that the fixture values still match the real files they came
from: the ten regional DJF artifacts and cells decoded from two real 1-degree
tiles. ``frontend/src/lib/tiles.real.test.ts`` uses the same expectations to
check the TypeScript decoder against Python, including the files read from disk.

``backend.trend.stats.sen_slope`` returns NaN below ``MIN_POINTS`` (8). Short
blocks therefore carry ``python_comparable: false`` and store the descriptive
browser slope; this test asserts Python really returns NaN for them rather than
silently comparing numbers it never produced.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pytest

from backend.trend import stats

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_DIR = ROOT / "frontend" / "src" / "lib" / "__fixtures__"
STATS_FIXTURES = json.loads((FIXTURE_DIR / "stats_fixtures.json").read_text(encoding="utf-8"))
REAL_TILES = json.loads((FIXTURE_DIR / "real_tiles.json").read_text(encoding="utf-8"))
FILL = -32768


def _valid(value):
    return (
        value is not None
        and isinstance(value, (int, float))
        and math.isfinite(float(value))
        and float(value) != FILL
    )


def _pairs(years, values, start_year=None, end_year=None):
    xs, ys = [], []
    for year, value in zip(years, values):
        if not _valid(value):
            continue
        if start_year is not None and year < start_year:
            continue
        if end_year is not None and year > end_year:
            continue
        xs.append(float(year))
        ys.append(float(value))
    return xs, ys


def _descriptive_slope(xs, ys):
    slopes = [
        (ys[j] - ys[i]) / (xs[j] - xs[i])
        for i in range(len(xs))
        for j in range(i + 1, len(xs))
        if xs[j] != xs[i]
    ]
    return float(np.median(slopes))


def _decode(q, scale, offset, decimals):
    if q is None or q == FILL:
        return None
    return float(f"{float(q) * scale + offset:.{int(decimals)}f}")


def _case_blocks():
    """Yield (label, case, block, start_year, end_year) for every stored block."""
    for case in STATS_FIXTURES["cases"]:
        yield case["name"], case, case["expected_full"], None, None
        for period in case["periods"]:
            yield (
                f"{case['name']} [{period['start_year']}-{period['end_year']}]",
                case,
                period["expected"],
                period["start_year"],
                period["end_year"],
            )


def test_fixture_source_is_the_backend():
    assert STATS_FIXTURES["source"] == "backend.trend.stats.sen_slope"
    assert STATS_FIXTURES["python_min_points"] == stats.MIN_POINTS
    assert STATS_FIXTURES["fill_value"] == FILL


def test_at_least_ten_series_are_compared_with_python():
    comparable = [
        case for case in STATS_FIXTURES["cases"] if case["expected_full"]["python_comparable"]
    ]
    assert len(comparable) >= 10
    kinds = {case["kind"] for case in comparable}
    assert "regional" in kinds
    assert "grid-cell" in kinds
    assert any(case.get("source_file", "").startswith("data/artifacts/") for case in comparable)


def test_every_comparable_full_block_matches_python():
    checked = 0
    for label, case, block, start, end in _case_blocks():
        if start is not None or end is not None:
            continue
        if not block["python_comparable"]:
            continue
        xs, ys = _pairs(case["years"], case["values"])
        slope, intercept = stats.sen_slope(xs, ys)
        assert np.isfinite(slope), label
        assert block["n"] == len(xs), label
        assert block["period"] == [int(min(xs)), int(max(xs))], label
        assert block["slope_per_year"] == pytest.approx(float(slope), abs=1e-9), label
        assert block["slope_per_decade"] == pytest.approx(float(slope) * 10.0, abs=1e-9), label
        assert block["intercept"] == pytest.approx(float(intercept), abs=1e-9), label
        checked += 1
    assert checked >= 10


def test_every_comparable_sub_period_matches_python():
    checked = 0
    for label, case, block, start, end in _case_blocks():
        if start is None or end is None:
            continue
        if not block["python_comparable"]:
            continue
        xs, ys = _pairs(case["years"], case["values"], start, end)
        slope, intercept = stats.sen_slope(xs, ys)
        assert np.isfinite(slope), label
        assert block["n"] == len(xs), label
        assert block["period"] == [int(min(xs)), int(max(xs))], label
        assert block["slope_per_year"] == pytest.approx(float(slope), abs=1e-9), label
        assert block["slope_per_decade"] == pytest.approx(float(slope) * 10.0, abs=1e-9), label
        assert block["intercept"] == pytest.approx(float(intercept), abs=1e-9), label
        checked += 1
    assert checked >= 10


def test_short_blocks_are_descriptive_because_python_returns_nan():
    checked = 0
    for label, case, block, start, end in _case_blocks():
        if block["python_comparable"]:
            continue
        xs, ys = _pairs(case["years"], case["values"], start, end)
        assert len(xs) < stats.MIN_POINTS, label
        slope, intercept = stats.sen_slope(xs, ys)
        assert np.isnan(slope), label
        assert np.isnan(intercept), label
        if len(xs) >= 2:
            descriptive = _descriptive_slope(xs, ys)
            assert block["slope_per_year"] == pytest.approx(descriptive, abs=1e-9), label
            assert block["slope_per_decade"] == pytest.approx(descriptive * 10.0, abs=1e-9), label
        else:
            assert block["slope_per_year"] is None, label
        assert "NaN" in block["python_note"], label
        checked += 1
    assert checked > 0


def test_regional_cases_still_match_the_artifact_files():
    checked = 0
    for case in STATS_FIXTURES["cases"]:
        if not case["kind"].startswith("regional"):
            continue
        path = ROOT / case["source_file"]
        payload = json.loads(path.read_text(encoding="utf-8"))
        assert case["years"] == payload["years"], case["name"]
        assert len(case["values"]) == len(payload["values"]), case["name"]
        assert all(value is not None for value in payload["values"]), (
            f"{case['name']}: the real artifact unexpectedly has gaps"
        )
        masked = set(case.get("masked_years", []))
        for year, actual, source in zip(case["years"], case["values"], payload["values"]):
            if year in masked:
                assert actual is None or actual == FILL, case["name"]
            else:
                assert actual == pytest.approx(source, abs=1e-12), f"{case['name']} {year}"
        checked += 1
    assert checked >= 10


def _index_meta():
    index_path = ROOT / REAL_TILES["index_path"]
    index = json.loads(index_path.read_text(encoding="utf-8"))
    return index["variables"]["precip"]


def _decoded_cell(path, cell_id, meta):
    tile = json.loads(path.read_text(encoding="utf-8"))
    cell = tile["cells"][cell_id]
    raw_coverage = [cell["c"]] * len(cell["v"]) if isinstance(cell["c"], int) else cell["c"]
    values = [
        _decode(q, meta["scale"], meta["offset"], meta["decimals"]) for q in cell["v"]
    ]
    coverage = [
        0.0
        if qv == FILL
        else (_decode(qc, meta["coverage_scale"], meta["coverage_offset"], meta["coverage_decimals"]) or 0.0)
        for qv, qc in zip(cell["v"], raw_coverage)
    ]
    return tile, cell, values, coverage


def test_grid_cell_cases_match_decoded_tile_values():
    meta = _index_meta()
    years = [int(year) for year in meta["years_by_season"]["DJF"]]
    checked = 0
    for case in STATS_FIXTURES["cases"]:
        if not case["kind"].startswith("grid-cell"):
            continue
        path = ROOT / case["source_file"]
        tile = json.loads(path.read_text(encoding="utf-8"))
        cell_id = case["cell_id"]
        assert cell_id in tile["cells"], case["name"]
        _, cell, values, _coverage = _decoded_cell(path, cell_id, meta)
        assert len(values) == len(years), case["name"]
        masked = set(case.get("masked_years", []))
        for year, actual, expected in zip(years, case["values"], values):
            if year in masked:
                assert actual is None or actual == FILL, f"{case['name']} {year}"
            else:
                assert actual == pytest.approx(expected, abs=1e-12), f"{case['name']} {year}"
        checked += 1
    assert checked >= 4


def test_real_tile_expectations_match_python_decode():
    meta = _index_meta()
    years = [int(year) for year in meta["years_by_season"]["DJF"]]
    checked = 0
    for entry in REAL_TILES["tiles"]:
        path = ROOT / entry["path"]
        tile = json.loads(path.read_text(encoding="utf-8"))
        assert tile["v_slug"] == entry["v_slug"]
        assert tile["season"] == entry["season"]
        assert tile["tile"] == entry["tile"]
        for expected in entry["cells"]:
            cell_id = expected["cell_id"]
            _, cell, values, coverage = _decoded_cell(path, cell_id, meta)
            assert cell["s"] == expected["raw_s"], f"{entry['path']} {cell_id}"
            assert values == expected["decoded"]["values"], f"{entry['path']} {cell_id}"
            assert coverage == expected["decoded"]["coverage"], f"{entry['path']} {cell_id}"
            assert years == expected["decoded"]["years"]

            xs = [float(y) for y, v in zip(years, values) if v is not None]
            ys = [float(v) for v in values if v is not None]
            slope, intercept = stats.sen_slope(xs, ys)
            assert expected["decoded"]["n_valid"] == len(xs)
            assert expected["decoded"]["slope_per_decade_raw"] == pytest.approx(
                float(slope) * 10.0, abs=1e-9
            ), f"{entry['path']} {cell_id}"
            assert expected["decoded"]["intercept"] == pytest.approx(
                float(intercept), abs=1e-9
            ), f"{entry['path']} {cell_id}"
            checked += 1
    assert checked >= 4
