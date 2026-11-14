"""Tests for GLDAS variables: units, fill values, and basic I/O."""
import pytest
import numpy as np

from backend.trend.var_gldas import read_month, SOIL_VAR, SWE_VAR, FILL_VALUE, UNITS


def test_gldas_monthly_units_and_fill():
    """Test that GLDAS monthly files have correct units and fill value handling."""
    try:
        data_dict, lat, lon, units_dict = read_month(2000, 1)
    except FileNotFoundError:
        pytest.skip("Local GLDAS collection is not available")

    # Check both variables present
    assert SOIL_VAR in data_dict
    assert SWE_VAR in data_dict

    # Check units
    for var in [SOIL_VAR, SWE_VAR]:
        assert units_dict[var].strip() == "kg m-2", f"Expected kg m-2 for {var}, got {units_dict[var]!r}"

    # Check fill value replaced with NaN
    for var in [SOIL_VAR, SWE_VAR]:
        arr = data_dict[var]
        assert not np.any(arr == FILL_VALUE), f"Fill value should be replaced with NaN for {var}"
        assert np.all(np.isfinite(arr) | np.isnan(arr)), f"All values should be finite or NaN for {var}"

    # Check grid shape
    for var in [SOIL_VAR, SWE_VAR]:
        assert data_dict[var].shape == (150, 360), f"Expected (150, 360) for {var}, got {data_dict[var].shape}"

    assert lat.shape == (150,), f"Expected 150 lat points, got {lat.shape}"
    assert lon.shape == (360,), f"Expected 360 lon points, got {lon.shape}"

    # Check latitude ascending (GLDAS is -59.5 to 89.5)
    assert lat[0] < lat[-1], "Latitude should be ascending"
    assert np.isclose(lat[0], -59.5, atol=0.01), f"Lat start {lat[0]}"
    assert np.isclose(lat[-1], 89.5, atol=0.01), f"Lat end {lat[-1]}"

    # Check longitude range
    assert np.isclose(lon[0], -179.5, atol=0.01), f"Lon start {lon[0]}"
    assert np.isclose(lon[-1], 179.5, atol=0.01), f"Lon end {lon[-1]}"

    # Check land-only: ocean cells should be NaN
    # At equator, prime meridian - should be land (Africa)
    # Row for lat ~0.5: (89.5 - 0.5) = 89
    # Col for lon ~0.5: 0.5 + 179.5 = 180
    soil = data_dict[SOIL_VAR]
    # Just check that there's a mix of valid and NaN (land/ocean)
    valid_frac = np.isfinite(soil).mean()
    assert 0.2 < valid_frac < 0.4, f"Expected ~28% land fraction, got {valid_frac:.2%}"


def test_gldas_soil_moisture_range():
    """Test that soil moisture values are in reasonable range (0-100 kg/m2 for 0-10cm)."""
    try:
        data_dict, _, _, _ = read_month(2000, 1)
    except FileNotFoundError:
        pytest.skip("Local GLDAS collection is not available")

    soil = data_dict[SOIL_VAR]
    valid = soil[np.isfinite(soil)]
    assert len(valid) > 0
    assert np.all(valid >= 0), "Soil moisture should be non-negative"
    assert np.all(valid <= 100), "Soil moisture 0-10cm should be <= 100 kg/m2 (saturation)"


def test_gldas_swe_range():
    """Test that SWE values are non-negative."""
    try:
        data_dict, _, _, _ = read_month(2000, 1)
    except FileNotFoundError:
        pytest.skip("Local GLDAS collection is not available")

    swe = data_dict[SWE_VAR]
    valid = swe[np.isfinite(swe)]
    assert len(valid) > 0
    assert np.all(valid >= 0), "SWE should be non-negative"


def test_gldas_variable_names():
    """Confirm the variable names."""
    assert SOIL_VAR == "SoilMoi0_10cm_inst"
    assert SWE_VAR == "SWE_inst"