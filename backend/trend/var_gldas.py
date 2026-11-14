"""GLDAS 2.1 Soil Moisture and Snow Water Equivalent variable module.

Product: GLDAS_NOAH10_M v2.1
Variables: SoilMoi0_10cm_inst (top 0-10 cm soil moisture), SWE_inst (snow water equivalent)
Units: kg m-2 (equivalent to mm water depth)
Native Grid: 1.0° x 1.0° (already 1-degree), land-only (60S to 90N)
"""

from pathlib import Path
import numpy as np
import xarray as xr

DATA_ROOT = Path(r"D:\trend-detective-data\raw\GLDAS_NOAH10_M_2.1")

# Variables
SOIL_VAR = "SoilMoi0_10cm_inst"
SWE_VAR = "SWE_inst"
FILL_VALUE = -9999.0
UNITS = "kg m-2"

# Native grid: 1.0° x 1.0°, lat 150 points (-59.5 to 89.5), lon 360 points (-179.5 to 179.5)
# Already 1-degree, no regridding needed


def monthly_path(year, month, root=DATA_ROOT):
    """Return path to monthly NetCDF file."""
    return Path(root) / f"GLDAS_NOAH10_M.A{year:04d}{month:02d}.021.nc4"


def read_month(year, month, root=DATA_ROOT, variables=None):
    """Read one monthly GLDAS file.

    Args:
        year: Year
        month: Month
        root: Data root
        variables: List of variable names to read (default: both soil and SWE)

    Returns:
        data_dict: {var_name: 2D array (lat, lon)}
        lat: 1D latitude array (ascending, -59.5 to 89.5)
        lon: 1D longitude array (-179.5 to 179.5)
        units_dict: {var_name: units string}
    """
    if variables is None:
        variables = [SOIL_VAR, SWE_VAR]

    path = monthly_path(year, month, root)
    with xr.open_dataset(path, decode_times=False) as ds:
        data_dict = {}
        units_dict = {}
        for var in variables:
            da = ds[var]
            units = da.attrs.get("units", "")
            if units.strip() != "kg m-2":
                raise ValueError(f"Unexpected {var} units: {units!r}")
            arr = np.asarray(da.squeeze().values, dtype=float)
            fill = da.attrs.get("_FillValue", ds[var].encoding.get("_FillValue"))
            if fill is not None:
                arr[arr == fill] = np.nan
            arr[~np.isfinite(arr)] = np.nan
            data_dict[var] = arr
            units_dict[var] = units

        lat = np.asarray(ds["lat"].values)
        lon = np.asarray(ds["lon"].values)

    return data_dict, lat, lon, units_dict


def load_monthly(start_year=2000, end_year=2026, variables=None):
    """Load all monthly data (native 1-degree grid, no regridding needed).

    Returns dict mapping (year, month) -> {var_name: (150, 360) float32 array}
    """
    if variables is None:
        variables = [SOIL_VAR, SWE_VAR]

    monthly = {}
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            data_dict, lat, lon, _ = read_month(year, month, variables=variables)
            monthly[(year, month)] = {k: v.astype(np.float32) for k, v in data_dict.items()}
        if year % 5 == 0:
            print(f"Read GLDAS monthly data through {year}", flush=True)
    return monthly, lat, lon


# Grid format constants per GRID_FORMAT.md
VAR_SLUG = "soil"
VARIABLE_NAME = "soil_moisture"
DISPLAY_UNITS = "kg/m2"
SLOPE_UNITS = "kg/m2/decade"
SCALE = 0.01
OFFSET = 0.0
DECIMALS = 2
SLOPE_SCALE = 0.001
SLOPE_OFFSET = 0.0
SLOPE_DECIMALS = 3
COVERAGE_SCALE = 0.001
COVERAGE_OFFSET = 0.0
COVERAGE_DECIMALS = 3
LAND_ONLY = True

# Year ranges per GRID_FORMAT.md Section 5.1
# GLDAS 2.1: 2000-01 to 2026-07
# ANN, JJA, SON: 2000..2025 (26 yr)
# MAM: 2000..2026 (27 yr)
# DJF: 2001..2026 (26 years, January year; DJF 2000 incomplete - missing Dec 1999)
YEARS = {
    "ANN": list(range(2000, 2026)),
    "DJF": list(range(2001, 2027)),
    "MAM": list(range(2000, 2027)),
    "JJA": list(range(2000, 2026)),
    "SON": list(range(2000, 2026)),
}

SEASONS = {
    "ANN": ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "Calendar year"),
    "DJF": ([12, 1, 2], "January year"),
    "MAM": ([3, 4, 5], "Calendar year"),
    "JJA": ([6, 7, 8], "Calendar year"),
    "SON": ([9, 10, 11], "Calendar year"),
}

FILL_INT16 = -32768


def encode_int16(val, scale):
    """Encode float to int16 with fill value."""
    if val is None or not np.isfinite(val):
        return FILL_INT16
    q = int(np.rint((val - OFFSET) / scale))
    return max(-32767, min(32767, q))


def decode_int16(q, scale, decimals):
    """Decode int16 to float."""
    if q == FILL_INT16 or q is None:
        return None
    return round(q * scale + OFFSET, decimals)


# Source info
SOIL_SOURCE = {
    "product": "GLDAS_NOAH10_M",
    "version": "2.1",
    "var": "SoilMoi0_10cm_inst",
    "doi_or_url": "https://doi.org/10.5067/SXAVCZFAQLNO",
}

SWE_SOURCE = {
    "product": "GLDAS_NOAH10_M",
    "version": "2.1",
    "var": "SWE_inst",
    "doi_or_url": "https://doi.org/10.5067/SXAVCZFAQLNO",
}

REGRID_NOTE = "Native 1.0 deg GLDAS-2.1 land grid (60S to 90N)"

# Land mask: GLDAS is land-only; ocean cells are fill value
# Latitude range: -59.5 to 89.5 (excludes Antarctica)
# Valid cells have finite values in at least one variable


def get_land_mask(lat, lon):
    """Get land mask from first available month (cells with valid soil moisture)."""
    data_dict, _, _, _ = read_month(2000, 1)
    soil = data_dict[SOIL_VAR]
    return np.isfinite(soil)


# Coastal region warning
COASTAL_WARNING = (
    "Coastal regions with only a few land cells (e.g., Coastal Peru) have weak "
    "representativeness due to coarse 1.0° resolution. Cell count and area_km2 "
    "are reported in each artifact; interpret trends with caution."
)

# Anomaly note
ANOMALY_NOTE = (
    "Anomalies are an open question for the lead. Raw values (kg m-2) are reported by default. "
    "A 2001-2020 baseline could be used but is not standard for GLDAS 2.1 "
    "which starts in 2000 (first complete DJF is 2001). Do not mix with GLDAS 2.0."
)