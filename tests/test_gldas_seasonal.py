"""Tests for GLDAS seasonal aggregation: day weights, incomplete season exclusion, land-only, etc."""
import calendar
import pytest
import numpy as np

from backend.trend.var_gldas import (
    load_monthly,
    get_land_mask,
    SEASONS,
    YEARS,
    seasonal_values,
)
from backend.trend.seasons import aggregate_djf


def test_gldas_djf_day_weights():
    """Test that DJF aggregation uses day-weighted mean (Dec=31, Jan=31, Feb=28/29)."""
    try:
        monthly, lat, lon = load_monthly(2000, 2000)
    except FileNotFoundError:
        pytest.skip("Local GLDAS collection is not available")

    # Create synthetic data where Dec=10, Jan=20, Feb=30 for a specific land cell
    test_data = {}
    for (y, m), vars_dict in monthly.items():
        test_data[(y, m)] = {k: v.copy() for k, v in vars_dict.items()}

    # Find a land cell (e.g., somewhere in Africa)
    land_mask = get_land_mask(lat, lon)
    land_rows, land_cols = np.where(land_mask)
    if len(land_rows) == 0:
        pytest.skip("No land cells found")
    row, col = land_rows[0], land_cols[0]

    # Overwrite with known values
    test_data[(1999, 12)][SOIL_VAR][row, col] = 10.0
    test_data[(2000, 1)][SOIL_VAR][row, col] = 20.0
    test_data[(2000, 2)][SOIL_VAR][row, col] = 30.0

    # Day-weighted: (10*31 + 20*31 + 30*29) / (31+31+29) = (310+620+870)/91 = 1800/91 ≈ 19.78
    # Equal-weight: (10 + 20 + 30) / 3 = 20
    result = aggregate_djf({k: v[SOIL_VAR] for k, v in test_data.items()}, [2000])
    dw_val = result["day_weighted"][0, row, col]
    eq_val = result["equal"][0, row, col]

    expected_dw = (10.0 * 31 + 20.0 * 31 + 30.0 * 29) / (31 + 31 + 29)
    expected_eq = 20.0

    assert np.isclose(dw_val, expected_dw, rtol=1e-6), f"Day-weighted: got {dw_val}, expected {expected_dw}"
    assert np.isclose(eq_val, expected_eq, rtol=1e-6), f"Equal-weight: got {eq_val}, expected {expected_eq}"


def test_gldas_incomplete_season_excluded():
    """Test that incomplete DJF seasons are excluded."""
    try:
        monthly, lat, lon = load_monthly(2000, 2000)
    except FileNotFoundError:
        pytest.skip("Local GLDAS collection is not available")

    test_data = {k: {kk: vv.copy() for kk, vv in v.items()} for k, v in monthly.items()}
    # Remove Dec 1999 (needed for DJF 2000)
    del test_data[(1999, 12)]

    result = aggregate_djf({k: v[SOIL_VAR] for k, v in test_data.items()}, [2000])

    # DJF 2000 should be excluded because Dec 1999 is missing
    assert len(result["years"]) == 0, "Incomplete season should be excluded entirely"


def test_gldas_djf_starts_2001():
    """Test that DJF starts at 2001 (first complete DJF for GLDAS 2.1)."""
    assert YEARS["DJF"] == list(range(2001, 2027))
    assert len(YEARS["DJF"]) == 26


def test_gldas_seasonal_values_land_only():
    """Test that seasonal_values masks ocean cells."""
    try:
        monthly, lat, lon = load_monthly(2000, 2002)
    except FileNotFoundError:
        pytest.skip("Local GLDAS collection is not available")

    djf_years = [2001, 2002]
    vals, coverage, land_mask = seasonal_values(monthly, lat, lon, "DJF", djf_years)

    assert vals.shape == (2, 150, 360)
    assert coverage.shape == (2, 150, 360)
    assert land_mask.shape == (150, 360)

    # Ocean cells should be NaN in output
    ocean_mask = ~land_mask
    assert np.all(np.isnan(vals[0, ocean_mask])), "Ocean cells should be NaN"
    assert np.all(np.isnan(vals[1, ocean_mask])), "Ocean cells should be NaN"

    # Land cells should have valid data (mostly)
    land_valid_frac = np.isfinite(vals[0, land_mask]).mean()
    assert land_valid_frac > 0.9, f"Land cells should be mostly valid: {land_valid_frac:.2%}"


def test_gldas_mask_area_positive():
    """Test that land mask has positive area."""
    try:
        _, lat, lon = load_monthly(2000, 2000)
    except FileNotFoundError:
        pytest.skip("Local GLDAS collection is not available")

    land_mask = get_land_mask(lat, lon)
    valid_cells = np.count_nonzero(land_mask)
    assert valid_cells > 10000, f"Expected >10000 land cells, got {valid_cells}"

    # Check latitude range of land cells
    land_rows = np.where(land_mask.any(axis=1))[0]
    min_row, max_row = land_rows[0], land_rows[-1]
    min_lat = 89.5 - min_row
    max_lat = 89.5 - max_row
    assert min_lat <= -59.5 + 1, f"Southern extent {min_lat}"
    assert max_lat >= 89.5 - 1, f"Northern extent {max_lat}"


def test_gldas_tile_size_under_300kb():
    """Test that generated tiles stay under 300 KB."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "soil"
    if not root.exists():
        pytest.skip("Soil grid tiles not built yet")

    tiles = list(root.rglob("*.json"))
    if not tiles:
        pytest.skip("No soil tiles found")

    for tile in tiles:
        size = tile.stat().st_size
        assert size < 300_000, f"Tile {tile.name} exceeds 300 KB: {size} bytes"


def test_gldas_cell_values_against_direct_read():
    """Test that tile cell values match direct read from source."""
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "data" / "artifacts" / "grid" / "soil" / "DJF"
    if not root.exists():
        pytest.skip("Soil DJF tiles not built yet")

    # Find a tile with data
    tile_files = list(root.glob("*.json"))
    if not tile_files:
        pytest.skip("No DJF tiles found")

    tile_file = tile_files[0]
    tile = json.loads(tile_file.read_text())
    if not tile["cells"]:
        pytest.skip("Tile has no cells")

    cell_id = next(iter(tile["cells"]))
    cell = tile["cells"][cell_id]
    qv = cell["v"]
    years = YEARS["DJF"]

    # Decode first valid value
    for i, (year, q) in enumerate(zip(years, qv)):
        if q != -32768:
            decoded = round(q * 0.01, 2)
            # Read direct from source
            from backend.trend.var_gldas import load_monthly
            try:
                monthly, lat, lon = load_monthly(year - 1, year)
                # DJF year Y uses Dec Y-1, Jan Y, Feb Y
                dec_data = monthly[(year - 1, 12)][SOIL_VAR]
                jan_data = monthly[(year, 1)][SOIL_VAR]
                feb_data = monthly[(year, 2)][SOIL_VAR]
                stack = np.stack([dec_data, jan_data, feb_data])
                days = np.array([31, 31, 28 + (1 if calendar.isleap(year) else 0)], dtype=float)[:, None, None]
                valid = np.isfinite(stack)
                den = np.sum(valid * days, axis=0)
                complete = valid.all(axis=0)
                direct = np.divide(np.nansum(stack * days, axis=0), den, out=np.full((150, 360), np.nan), where=complete)

                # Parse cell_id: cell_<lat>_<lon>
                parts = cell_id.split("_")
                cell_lat = float(parts[1])
                cell_lon = float(parts[2])
                row = int(round(89.5 - cell_lat))
                col = int(round(cell_lon + 179.5))
                direct_val = direct[row, col]

                if np.isfinite(direct_val):
                    assert np.isclose(decoded, round(direct_val, 2), atol=0.01), f"Year {year}: tile={decoded}, direct={direct_val:.2f}"
                    break
            except (FileNotFoundError, KeyError):
                pytest.skip(f"Source file for year {year} not available")
            break


def test_gldas_leap_year_feb_days():
    """Test that February days are 29 in leap years, 28 otherwise."""
    # 2000 is leap, 2001 is not
    assert calendar.monthrange(2000, 2)[1] == 29
    assert calendar.monthrange(2001, 2)[1] == 28
    assert calendar.monthrange(2020, 2)[1] == 29
    assert calendar.monthrange(2021, 2)[1] == 28


# Import SOIL_VAR for test_gldas_cell_values_against_direct_read
from backend.trend.var_gldas import SOIL_VAR