"""Tests for AOD variable: units, fill values, and basic I/O."""
import pytest
import numpy as np

from backend.trend.var_aod import read_month, regrid_05x0625_to_1, VARIABLE, FILL_VALUE, UNITS


def test_aod_monthly_units_and_fill():
    """Test that AOD monthly files have correct units and fill value handling."""
    try:
        data, lat, lon, units = read_month(1980, 1)
    except FileNotFoundError:
        pytest.skip("Local MERRA-2 AOD collection is not available")

    # Check units
    assert units.strip() == "1", f"Expected dimensionless units, got {units!r}"

    # Check fill value replaced with NaN
    assert not np.any(data == FILL_VALUE), "Fill value should be replaced with NaN"
    assert np.all(np.isfinite(data) | np.isnan(data)), "All values should be finite or NaN"

    # Check no negative values (AOD is non-negative)
    valid = data[np.isfinite(data)]
    assert np.all(valid >= 0), "AOD should be non-negative"

    # Check grid shape
    assert data.shape == (361, 576), f"Expected (361, 576), got {data.shape}"
    assert lat.shape == (361,), f"Expected 361 lat points, got {lat.shape}"
    assert lon.shape == (576,), f"Expected 576 lon points, got {lon.shape}"

    # Check latitude ascending (MERRA-2 native grid)
    assert lat[0] < lat[-1], "Latitude should be ascending"
    assert np.isclose(lat[0], -90.0, atol=0.01), f"Lat start {lat[0]}"
    assert np.isclose(lat[-1], 90.0, atol=0.01), f"Lat end {lat[-1]}"

    # Check longitude range
    assert np.isclose(lon[0], -180.0, atol=0.01), f"Lon start {lon[0]}"
    assert np.isclose(lon[-1], 179.375, atol=0.01), f"Lon end {lon[-1]}"


def test_aod_regrid_constant_field():
    """Test that regridding a constant field preserves the value."""
    # Create a constant field on native grid (ascending latitude)
    lat = np.linspace(-90, 90, 361)
    lon = np.linspace(-180, 179.375, 576)
    const_field = np.full((361, 576), 0.15, dtype=float)

    result = regrid_05x0625_to_1(const_field, lat, lon)

    assert result.shape == (180, 360)
    # All valid cells should be close to 0.15
    valid = result[np.isfinite(result)]
    assert len(valid) > 0, "Should have valid cells"
    assert np.allclose(valid, 0.15, rtol=1e-3), f"Regridded constant field changed: mean={valid.mean()}"


def test_aod_regrid_preserves_global_mean():
    """Test that regridding approximately preserves cosine-weighted global mean."""
    # Use real data for this test
    try:
        data, lat, lon, _ = read_month(1980, 1)
    except FileNotFoundError:
        pytest.skip("Local MERRA-2 AOD collection is not available")

    # Compute cosine-weighted mean on native grid
    lat_rad = np.deg2rad(lat)
    cos_lat = np.cos(lat_rad)
    weights_native = cos_lat[:, None]  # (361, 1)
    valid_native = np.isfinite(data)
    native_mean = np.sum(np.where(valid_native, data * weights_native, 0)) / np.sum(np.where(valid_native, weights_native, 0))

    # Regrid and compute mean on 1-degree grid
    regridded = regrid_05x0625_to_1(data, lat, lon)
    target_lat = np.linspace(-89.5, 89.5, 180)
    target_cos = np.cos(np.deg2rad(target_lat))[:, None]
    valid_target = np.isfinite(regridded)
    target_mean = np.sum(np.where(valid_target, regridded * target_cos, 0)) / np.sum(np.where(valid_target, target_cos, 0))

    # Should be close (within 1%)
    assert np.isclose(native_mean, target_mean, rtol=0.01), f"Mean changed: native={native_mean:.6f}, target={target_mean:.6f}"


def test_aod_variable_name():
    """Confirm the variable name is TOTEXTTAU."""
    assert VARIABLE == "TOTEXTTAU"