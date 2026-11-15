"""Tests for reading MERRA-2 T2M, units, seasons and the archive record."""
import calendar

import numpy as np
import pytest

from backend.trend import var_t2m
from backend.trend.seasons import aggregate_djf


def archive_available():
    return var_t2m.DATA_ROOT.is_dir()


def test_unit_conversion_is_kelvin_minus_offset():
    kelvin = np.array([273.15, 300.0, 0.0, np.nan])
    celsius = var_t2m.to_celsius(kelvin)
    assert celsius[0] == pytest.approx(0.0)
    assert celsius[1] == pytest.approx(26.85)
    assert celsius[2] == pytest.approx(-273.15)
    assert np.isnan(celsius[3])


def test_units_attribute_is_kelvin():
    if not archive_available():
        pytest.skip("MERRA-2 T2M archive is not available")
    units = var_t2m.units_attribute(var_t2m.monthly_path(1980, 1))
    assert units == "K"


def test_read_month_converts_to_degrees_celsius():
    if not archive_available():
        pytest.skip("MERRA-2 T2M archive is not available")
    values, lat, lon, units = var_t2m.read_month(1980, 1)
    assert units == "degC"
    assert values.shape == (lat.size, lon.size) == (361, 576)
    # File check from _PRODUCT.md: T2M range 231.60641 to 307.80728 K.
    assert float(np.nanmin(values)) == pytest.approx(231.60641 - 273.15, abs=1e-3)
    assert float(np.nanmax(values)) == pytest.approx(307.80728 - 273.15, abs=1e-3)
    assert np.isfinite(values).all()
    assert float(np.nanmax(values)) < 60.0 and float(np.nanmin(values)) > -100.0


def test_read_month_rejects_non_kelvin_units(tmp_path):
    import xarray as xr

    ds = xr.Dataset(
        {
            "T2M": (
                ("time", "lat", "lon"),
                np.zeros((1, 2, 3), dtype=np.float32),
                {"units": "degC"},
            )
        },
        coords={"time": [0], "lat": [-0.5, 0.5], "lon": [0.0, 1.0, 2.0]},
    )
    ds.to_netcdf(tmp_path / "MERRA2_100.tavgM_2d_slv_Nx.198001.nc4", engine="scipy")
    var_t2m._FILE_INDEX.pop(str(tmp_path), None)
    with pytest.raises(ValueError, match="units"):
        var_t2m.read_month(1980, 1, root=tmp_path)


def test_leap_year_day_weights():
    monthly = {
        (1984, month): np.full((2, 3), float(month)) for month in range(1, 13)
    }
    values, coverage = var_t2m.seasonal_series(monthly, "ANN", [1984], shape=(2, 3))
    expected = sum(calendar.monthrange(1984, m)[1] * m for m in range(1, 13)) / 366.0
    assert values.shape == (1, 2, 3)
    assert float(values[0, 0, 0]) == pytest.approx(expected, rel=1e-6)
    assert float(coverage[0, 0, 0]) == pytest.approx(1.0)


def test_february_weight_differs_between_leap_and_common_year():
    leap = {(1984, m): np.full((2, 3), 100.0 if m == 2 else 0.0) for m in range(1, 13)}
    common = {(1983, m): np.full((2, 3), 100.0 if m == 2 else 0.0) for m in range(1, 13)}
    leap_value, _ = var_t2m.seasonal_series(leap, "ANN", [1984], shape=(2, 3))
    common_value, _ = var_t2m.seasonal_series(common, "ANN", [1983], shape=(2, 3))
    assert float(leap_value[0, 0, 0]) == pytest.approx(100.0 * 29 / 366, rel=1e-6)
    assert float(common_value[0, 0, 0]) == pytest.approx(100.0 * 28 / 365, rel=1e-6)


def test_incomplete_season_is_excluded():
    monthly = {(2000, m): np.full((2, 3), 5.0) for m in range(1, 13)}
    del monthly[(2000, 7)]
    values, coverage = var_t2m.seasonal_series(monthly, "ANN", [2000], shape=(2, 3))
    assert np.isnan(values).all()
    assert (coverage == 0.0).all()


def test_one_missing_month_excludes_only_that_cell():
    monthly = {(2001, m): np.full((2, 3), 5.0) for m in range(3, 6)}
    monthly[(2001, 4)][1, 2] = np.nan
    values, coverage = var_t2m.seasonal_series(monthly, "MAM", [2001], shape=(2, 3))
    assert np.isnan(values[0, 1, 2])
    assert np.isfinite(values[0, 0, 0])
    assert float(coverage[0, 0, 0]) == pytest.approx(1.0)


def test_djf_matches_the_reused_rainfall_aggregation():
    monthly = {
        key: np.full((2, 3), float(key[1]) + key[0] % 10)
        for key in ((1999, 12), (2000, 1), (2000, 2))
    }
    values, _ = var_t2m.seasonal_series(monthly, "DJF", [2000], shape=(2, 3))
    reference = aggregate_djf(monthly, [2000])
    assert float(values[0, 0, 0]) == pytest.approx(
        float(reference["day_weighted"][0, 0, 0]), rel=1e-6
    )


def test_year_ranges_match_the_archive_record():
    if not archive_available():
        pytest.skip("MERRA-2 T2M archive is not available")
    months = var_t2m.available_months()
    present = set(months)
    assert months[0] == (1980, 1)
    assert months[-1] == (2026, 9)
    assert len(months) == 561
    for season, years in var_t2m.YEAR_RANGES.items():
        for year in (years[0], years[-1]):
            for key in var_t2m.season_keys(season, year):
                assert key in present, (season, year, key)
