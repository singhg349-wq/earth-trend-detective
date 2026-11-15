"""Tests for the 1 degree T2M grid: weights, encoding, tiles, Sen slope."""
import json
from pathlib import Path

import numpy as np
import pytest

from backend.trend import var_t2m
from backend.trend.stats import sen_slope_per_decade

GRID_ROOT = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "t2m"


def archive_available():
    return var_t2m.DATA_ROOT.is_dir()


def tiles_available():
    return GRID_ROOT.is_dir() and any(GRID_ROOT.glob("*/*.json"))


def native_edges(coords):
    centres = np.asarray(coords, dtype=float)
    midpoints = (centres[:-1] + centres[1:]) / 2.0
    return np.concatenate(
        (
            [centres[0] - (midpoints[0] - centres[0])],
            midpoints,
            [centres[-1] + (centres[-1] - midpoints[-1])],
        )
    )


def test_encoder_uses_fill_clamp_and_round_half_even():
    assert var_t2m.encode_int16(None) == var_t2m.FILL
    assert var_t2m.encode_int16(np.nan) == var_t2m.FILL
    assert var_t2m.encode_int16(1.234) == 123
    assert var_t2m.encode_int16(-1.235) == -124
    assert var_t2m.encode_int16(5000.0) == 32767
    assert var_t2m.encode_int16(-5000.0) == -32767


def test_regrid_of_a_constant_field_is_constant():
    lat = np.arange(-90.0, 90.01, 0.5)
    lon = np.arange(-180.0, 180.0, 0.625)
    weights = var_t2m.regrid_weights(lat, lon)
    values, coverage = var_t2m.regrid_to_1deg(np.full((lat.size, lon.size), 7.5), weights)
    assert values.shape == coverage.shape == (180, 360)
    assert np.allclose(values, 7.5, atol=1e-12)
    assert np.allclose(coverage, 1.0, atol=1e-12)


def test_polar_bins_receive_data():
    lat = np.arange(-90.0, 90.01, 0.5)
    lon = np.arange(-180.0, 180.0, 0.625)
    field = np.tile(lat[:, None], (1, lon.size))
    weights = var_t2m.regrid_weights(lat, lon)
    values, coverage = var_t2m.regrid_to_1deg(field, weights)
    assert np.isfinite(values[0]).all() and np.isfinite(values[-1]).all()
    assert coverage[0].min() > 0.99 and coverage[-1].min() > 0.99
    # The southernmost bin is centred near -89.5, not exactly the pole row.
    assert -90.0 < values[0, 0] < -89.0
    assert 89.0 < values[-1, 0] < 90.0


def test_regrid_matches_a_direct_spherical_area_read():
    if not archive_available():
        pytest.skip("MERRA-2 T2M archive is not available")
    data, lat, lon, _ = var_t2m.read_month(1980, 1)
    weights = var_t2m.regrid_weights(lat, lon)
    grid, _ = var_t2m.regrid_to_1deg(data, weights)
    le, oe = native_edges(lat), native_edges(lon)

    def direct(south, north, west, east):
        lat_lo = np.maximum(le[:-1], south)
        lat_hi = np.minimum(le[1:], north)
        lon_lo = np.maximum(oe[:-1], west)
        lon_hi = np.minimum(oe[1:], east)
        rows = np.nonzero(lat_hi - lat_lo > 0)[0]
        cols = np.nonzero(lon_hi - lon_lo > 0)[0]
        numerator = denominator = 0.0
        for i in rows:
            for j in cols:
                area = np.radians(lon_hi[j] - lon_lo[j]) * (
                    np.sin(np.radians(lat_hi[i])) - np.sin(np.radians(lat_lo[i]))
                )
                numerator += data[i, j] * area
                denominator += area
        return numerator / denominator

    for south, west in ((-4.0, -80.0), (46.0, 8.0), (-34.0, 18.0), (60.0, -120.0)):
        expected = direct(south, south + 1.0, west, west + 1.0)
        actual = grid[int(south) + 90, int(west) + 180]
        assert actual == pytest.approx(expected, abs=5e-4)


def test_regrid_preserves_the_global_mean():
    if not archive_available():
        pytest.skip("MERRA-2 T2M archive is not available")
    data, lat, lon, _ = var_t2m.read_month(1980, 1)
    grid, _ = var_t2m.regrid_to_1deg(data, var_t2m.regrid_weights(lat, lon))
    native_lat = np.cos(np.deg2rad(lat))[:, None]
    grid_lat = np.cos(np.deg2rad(np.arange(-89.5, 90.0, 1.0)))[:, None]
    native_mean = float(np.sum(data * native_lat) / (np.sum(native_lat) * lon.size))
    grid_mean = float(np.sum(grid * grid_lat) / (np.sum(grid_lat) * 360))
    assert grid_mean == pytest.approx(native_mean, abs=1e-3)


def test_sen_slope_grid_matches_the_stats_module():
    from scripts.build_t2m import sen_slope_grid

    rng = np.random.default_rng(7)
    years = list(range(1990, 2000))
    series = rng.normal(size=(10, 5, 4))
    fast = sen_slope_grid(years, series.reshape(10, -1)).reshape(5, 4)
    slow = np.array(
        [
            [sen_slope_per_decade(years, series[:, i, j]) for j in range(4)]
            for i in range(5)
        ]
    )
    assert np.allclose(fast, slow, atol=1e-12)


def test_sen_slope_grid_needs_ten_valid_years():
    from scripts.build_t2m import sen_slope_grid

    years = list(range(1990, 2000))
    series = np.ones((10, 2))
    series[3:, 1] = np.nan
    slopes = sen_slope_grid(years, series)
    assert np.isfinite(slopes[0])
    assert np.isnan(slopes[1])


def test_tiles_are_under_300_kb_and_cover_the_globe():
    if not tiles_available():
        pytest.skip("Generated t2m tile set is not available")
    tiles = list(GRID_ROOT.glob("*/*.json"))
    assert tiles
    largest = max(tile.stat().st_size for tile in tiles)
    assert largest < 300_000, largest
    for season in ("ANN", "DJF", "MAM", "JJA", "SON"):
        season_tiles = list((GRID_ROOT / season).glob("*.json"))
        assert len(season_tiles) == 648, (season, len(season_tiles))
    assert sum(tile.stat().st_size for tile in tiles) < 150_000_000


def test_tile_header_and_years_match_the_specification():
    if not tiles_available():
        pytest.skip("Generated t2m tile set is not available")
    expected = {
        "ANN": (1980, 2025, 46),
        "DJF": (1981, 2026, 46),
        "MAM": (1980, 2026, 47),
        "JJA": (1980, 2026, 47),
        "SON": (1980, 2025, 46),
    }
    for season, (first, last, length) in expected.items():
        tile = json.loads((GRID_ROOT / season / "0_0.json").read_text(encoding="utf-8"))
        assert tile["v_slug"] == "t2m"
        assert tile["season"] == season
        assert tile["tile"] == [0, 0]
        cell = tile["cells"]["cell_0.5_0.5"]
        assert len(cell["v"]) == length
        assert cell["c"] == 1000

    fragment = json.loads(
        (GRID_ROOT.parent / "index_t2m.json").read_text(encoding="utf-8")
    )
    block = fragment["variables"]["t2m"]
    assert block["units"] == "degC"
    assert block["scale"] == 0.01
    for season, (first, last, length) in expected.items():
        years = block["years_by_season"][season]
        assert years[0] == first and years[-1] == last and len(years) == length
        assert len(block["available_tiles"][season]) == 648


def test_djf_cell_value_matches_a_direct_native_reading():
    """One tile cell against the native monthly files, read independently."""
    if not archive_available() or not tiles_available():
        pytest.skip("T2M archive or tiles are not available")
    tile = json.loads((GRID_ROOT / "DJF" / "0_40.json").read_text(encoding="utf-8"))
    # cell_46.5_8.5 covers [8, 9]E, [46, 47]N; year 2000 is index 2000 - 1981.
    quantized = tile["cells"]["cell_46.5_8.5"]["v"][2000 - 1981]
    decoded = quantized * 0.01

    reads = [
        var_t2m.read_month(1999, 12),
        var_t2m.read_month(2000, 1),
        var_t2m.read_month(2000, 2),
    ]
    days = np.array([31.0, 31.0, 29.0])[:, None, None]
    seasonal = np.sum(np.stack([read[0] for read in reads]) * days, axis=0) / days.sum()
    lat, lon = reads[1][1], reads[1][2]
    le, oe = native_edges(lat), native_edges(lon)
    lat_lo = np.maximum(le[:-1], 46.0)
    lat_hi = np.minimum(le[1:], 47.0)
    lon_lo = np.maximum(oe[:-1], 8.0)
    lon_hi = np.minimum(oe[1:], 9.0)
    rows = np.nonzero(lat_hi - lat_lo > 0)[0]
    cols = np.nonzero(lon_hi - lon_lo > 0)[0]
    numerator = denominator = 0.0
    for i in rows:
        for j in cols:
            area = np.radians(lon_hi[j] - lon_lo[j]) * (
                np.sin(np.radians(lat_hi[i])) - np.sin(np.radians(lat_lo[i]))
            )
            numerator += seasonal[i, j] * area
            denominator += area
    expected = numerator / denominator
    assert decoded == pytest.approx(expected, abs=0.006)
    assert -60.0 < decoded < 60.0


def test_tile_cells_hold_temperatures_not_kelvin():
    if not tiles_available():
        pytest.skip("Generated t2m tile set is not available")
    tile = json.loads((GRID_ROOT / "JJA" / "-80_-10.json").read_text(encoding="utf-8"))
    peru = tile["cells"]["cell_-4.5_-79.5"]["v"]
    values = [value * 0.01 for value in peru if value != var_t2m.FILL]
    assert values
    # Coastal Peru JJA is about 16-20 degC; a Kelvin series would be ~290.
    assert 10.0 < max(values) < 30.0
