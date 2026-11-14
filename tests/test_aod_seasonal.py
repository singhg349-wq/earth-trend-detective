"""Tests for AOD seasonal aggregation: day weights, incomplete season exclusion, etc."""
import calendar
import pytest
import numpy as np

from backend.trend.var_aod import (
    read_month,
    regrid_05x0625_to_1,
    SEASONS,
    YEARS,
    load_monthly_regridded,
)
from backend.trend.seasons import aggregate_djf
from scripts.build_aod import seasonal_values


def test_aod_djf_day_weights():
    """Test that DJF aggregation uses day-weighted mean (Dec=31, Jan=31, Feb=28/29)."""
    try:
        monthly = load_monthly_regridded(1983, 1984)  # 1984 is a leap year
    except FileNotFoundError:
        pytest.skip("Local MERRA-2 AOD collection is not available")

    # Create synthetic data where Dec=1.0, Jan=2.0, Feb=3.0 for a specific cell
    # Use a known valid cell (e.g., near equator)
    test_data = {}
    for (y, m), arr in monthly.items():
        test_data[(y, m)] = arr.copy()

    # Overwrite with known values at a specific cell (row=90, col=180 ~ equator, prime meridian)
    row, col = 90, 180
    test_data[(1983, 12)][row, col] = 1.0
    test_data[(1984, 1)][row, col] = 2.0
    test_data[(1984, 2)][row, col] = 3.0

    # Day-weighted: (1.0*31 + 2.0*31 + 3.0*29) / (31+31+29) = (31+62+87)/91 = 180/91 ≈ 1.978
    # Equal-weight: (1.0 + 2.0 + 3.0) / 3 = 2.0
    result = aggregate_djf(test_data, [1984])
    dw_val = result["day_weighted"][0, row, col]
    eq_val = result["equal"][0, row, col]

    expected_dw = (1.0 * 31 + 2.0 * 31 + 3.0 * 29) / (31 + 31 + 29)
    expected_eq = 2.0

    assert np.isclose(dw_val, expected_dw, rtol=1e-6), f"Day-weighted: got {dw_val}, expected {expected_dw}"
    assert np.isclose(eq_val, expected_eq, rtol=1e-6), f"Equal-weight: got {eq_val}, expected {expected_eq}"


def test_aod_incomplete_season_excluded():
    """Test that incomplete DJF seasons are excluded (not just NaN-filled)."""
    try:
        monthly = load_monthly_regridded(1980, 1981)
    except FileNotFoundError:
        pytest.skip("Local MERRA-2 AOD collection is not available")

    # Remove one month from 1981 DJF
    test_data = {k: v.copy() for k, v in monthly.items()}
    del test_data[(1980, 12)]

    result = aggregate_djf(test_data, [1981])

    # Should have no years because 1981 DJF is incomplete
    assert len(result["years"]) == 0, "Incomplete season should be excluded entirely"
    assert result["day_weighted"].size == 0
    assert result["equal"].size == 0


def test_aod_seasonal_values_shape_and_coverage():
    """Test seasonal_values output shape and coverage calculation."""
    try:
        monthly = load_monthly_regridded(1980, 1982)
    except FileNotFoundError:
        pytest.skip("Local MERRA-2 AOD collection is not available")

    djf_years = [1981, 1982]
    vals, coverage = seasonal_values(monthly, "DJF", djf_years)

    assert vals.shape == (2, 180, 360)
    assert coverage.shape == (2, 180, 360)
    assert np.all(coverage >= 0) and np.all(coverage <= 1), "Coverage should be in [0, 1]"

    # Valid cells should have coverage > 0
    valid_cells = np.isfinite(vals[0])
    assert np.any(valid_cells), "Should have some valid cells"
    assert np.all(coverage[0][valid_cells] > 0), "Valid cells should have positive coverage"


def test_aod_mask_area_positive():
    """Test that the valid land+ocean mask has positive area (global grid)."""
    try:
        data, lat, lon, _ = read_month(1980, 1)
    except FileNotFoundError:
        pytest.skip("Local MERRA-2 AOD collection is not available")

    regridded = regrid_05x0625_to_1(data, lat, lon)
    valid = np.isfinite(regridded)

    # AOD is global - should have valid cells everywhere
    valid_fraction = valid.mean()
    assert valid_fraction > 0.9, f"Expected >90% valid cells globally, got {valid_fraction:.2%}"

    # Total valid area should be positive
    target_lat = np.linspace(-89.5, 89.5, 180)
    cos_lat = np.cos(np.deg2rad(target_lat))
    cell_area_weights = cos_lat[:, None]  # proportional to cos(lat) - shape (180, 1)
    # Broadcast to (180, 360) for indexing
    weights_2d = np.broadcast_to(cell_area_weights, (180, 360))
    total_valid_weight = np.sum(weights_2d[valid])
    total_weight = np.sum(weights_2d)
    assert total_valid_weight / total_weight > 0.9, "Valid area fraction should be >90%"


def test_aod_tile_size_under_300kb():
    """Test that generated tiles stay under 300 KB."""
    from pathlib import Path
    import json

    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "aod"
    if not root.exists():
        pytest.skip("AOD grid tiles not built yet")

    tiles = list(root.rglob("*.json"))
    if not tiles:
        pytest.skip("No AOD tiles found")

    for tile in tiles:
        size = tile.stat().st_size
        assert size < 300_000, f"Tile {tile.name} exceeds 300 KB: {size} bytes"


def test_aod_cell_values_against_direct_read():
    """Test that tile cell values match direct read from source."""
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "aod" / "DJF"
    if not root.exists():
        pytest.skip("AOD DJF tiles not built yet")

    # Pick a known tile and cell
    tile_file = root / "-80_-10.json"
    if not tile_file.exists():
        pytest.skip("Test tile not found")

    tile = json.loads(tile_file.read_text())
    cell_id = "cell_-4.5_-79.5"
    if cell_id not in tile["cells"]:
        pytest.skip("Test cell not in tile")

    cell = tile["cells"][cell_id]
    qv = cell["v"]
    years = YEARS["DJF"]

    # Decode first valid value
    for i, (year, q) in enumerate(zip(years, qv)):
        if q != -32768:
            decoded = round(q * 0.001, 3)
            # Read direct from source for this year
            from backend.trend.var_aod import read_month, regrid_05x0625_to_1
            try:
                # DJF year Y uses Dec Y-1, Jan Y, Feb Y
                dec_data, lat, lon, _ = read_month(year - 1, 12)
                jan_data, _, _, _ = read_month(year, 1)
                feb_data, _, _, _ = read_month(year, 2)
                dec_r = regrid_05x0625_to_1(dec_data, lat, lon)
                jan_r = regrid_05x0625_to_1(jan_data, lat, lon)
                feb_r = regrid_05x0625_to_1(feb_data, lat, lon)
                stack = np.stack([dec_r, jan_r, feb_r])
                days = np.array([31, 31, 28 + (1 if calendar.isleap(year) else 0)], dtype=float)[:, None, None]
                valid = np.isfinite(stack)
                den = np.sum(valid * days, axis=0)
                complete = valid.all(axis=0)
                direct = np.divide(np.nansum(stack * days, axis=0), den, out=np.full((180, 360), np.nan), where=complete)
                # Cell at lat_sw=-5, lon_sw=-80 -> row=89-(-5)=94, col=-80+180=100
                direct_val = direct[94, 100]
                if np.isfinite(direct_val):
                    assert np.isclose(decoded, round(direct_val, 3), atol=0.001), f"Year {year}: tile={decoded}, direct={direct_val:.3f}"
                    break  # Only test first valid year
            except FileNotFoundError:
                pytest.skip(f"Source file for year {year} not available")
            break


def test_aod_leap_year_feb_days():
    """Test that February days are 29 in leap years, 28 otherwise."""
    # 1980 is leap, 1981 is not
    assert calendar.monthrange(1980, 2)[1] == 29
    assert calendar.monthrange(1981, 2)[1] == 28
    assert calendar.monthrange(2020, 2)[1] == 29
    assert calendar.monthrange(2021, 2)[1] == 28