"""AOD (Aerosol Optical Depth) variable module for MERRA-2 M2TMNXAER 5.12.4.

This module provides I/O and grid helpers for the TOTEXTTAU variable.
It is a model/reanalysis field, NOT MODIS satellite AOD.
"""

from pathlib import Path
import numpy as np
import xarray as xr

DATA_ROOT = Path(r"D:\trend-detective-data\raw\M2TMNXAER_5.12.4")
VARIABLE = "TOTEXTTAU"
FILL_VALUE = 1e15
UNITS = "1"  # dimensionless

# Native grid: 0.5 deg lat x 0.625 deg lon (361 x 576)
# Target 1-degree grid: 180 x 360


def monthly_path(year, month, root=DATA_ROOT):
    """Return path to monthly NetCDF file.

    MERRA-2 stream ID varies; find the file by globbing.
    """
    pattern = f"MERRA2_*.tavgM_2d_aer_Nx.{year:04d}{month:02d}.nc4"
    matches = list(Path(root).glob(pattern))
    if not matches:
        raise FileNotFoundError(f"No file found for {year}-{month:02d} in {root}")
    if len(matches) > 1:
        # Prefer the one without extra suffix
        for m in matches:
            if m.name.count('_') == 2:  # MERRA2_XXX.tavgM_2d_aer_Nx.YYYYMM.nc4
                return m
        return matches[0]
    return matches[0]


def read_month(year, month, root=DATA_ROOT):
    """Read one monthly AOD field.

    Returns:
        data: 2D array (lat, lon) with NaN for fill/missing
        lat: 1D latitude array (descending, -90 to 90)
        lon: 1D longitude array (-180 to 179.375)
        units: string from file attributes
    """
    path = monthly_path(year, month, root)
    with xr.open_dataset(path, decode_times=False) as ds:
        da = ds[VARIABLE]
        units = da.attrs.get("units", "")
        if units.strip() != "1":
            raise ValueError(f"Unexpected {VARIABLE} units: {units!r}")
        arr = np.asarray(da.squeeze().values, dtype=float)
        fill = da.attrs.get("_FillValue", ds[VARIABLE].encoding.get("_FillValue"))
        if fill is not None:
            arr[arr == fill] = np.nan
        arr[~np.isfinite(arr) | (arr < 0)] = np.nan
        lat = np.asarray(ds["lat"].values)
        lon = np.asarray(ds["lon"].values)
    return arr, lat, lon, units


def regrid_05x0625_to_1(data, lat, lon):
    """Area-weighted regrid from MERRA-2 native (0.5 x 0.625) to 1-degree.

    Uses cos(latitude) x overlap area weights. The MERRA-2 grid has
    361 lat points (-90 to 90, step 0.5) and 576 lon points (-180 to 179.375, step 0.625).
    Latitude is ascending (-90 to 90).

    Each 1-degree target cell = 2 native lat cells x 1.6 native lon cells.
    We use vectorized block processing for speed.

    Args:
        data: (361, 576) array on native grid
        lat: (361,) latitude coordinates (ascending, -90 to 90)
        lon: (576,) longitude coordinates (ascending, -180 to 179.375)

    Returns:
        (180, 360) array on 1-degree grid (cell centers at -89.5..89.5, -179.5..179.5)
        Output latitude is descending (90 to -90) to match GRID_FORMAT.md convention
    """
    x = np.asarray(data, dtype=np.float64)
    latitude = np.asarray(lat, dtype=float)
    longitude = np.asarray(lon, dtype=float)

    if x.shape != (361, 576):
        raise ValueError(f"Expected 361x576 MERRA-2 grid, got {x.shape}")
    if not (latitude[0] < latitude[-1]):
        raise ValueError("Expected ascending latitude")

    # Cos weights for latitude cell centers
    cos_lat = np.cos(np.deg2rad(latitude))  # (361,)

    # Average latitude: 360 cells -> 180 target cells (2 native per target)
    # Use pairs (0,1), (2,3), ..., (358,359) with cos(lat) weights
    # x[:360] drops the last lat point (90N pole) - but wait, 361 points = 360 cells
    # The 361 points ARE the cell centers from -90 to 90
    # So 360 cells from -90 to 90, step 0.5
    # Pair them: 0+1, 2+3, ... 358+359 = 180 pairs

    # Reshape to (180, 2, 576) for the 180 pairs
    x_pairs = x[:360].reshape(180, 2, 576)  # (180, 2, 576)
    cos_pairs = cos_lat[:360].reshape(180, 2, 1)  # (180, 2, 1)

    # Weighted average over the pair axis
    lat_avg = np.nansum(x_pairs * cos_pairs, axis=1) / np.nansum(cos_pairs, axis=1)
    # Result: (180, 576) - ascending latitude (south to north)
    # Reverse to get descending (north to south) for GRID_FORMAT.md
    lat_avg = lat_avg[::-1, :]  # (180, 576), row 0 = north (89.5), row 179 = south (-89.5)

    # Longitude: 576 native -> 360 target with factor 1.6 = 8/5
    # Each target cell spans 1.6 native cells
    # We'll use the exact overlap method but vectorized per column

    out = np.full((180, 360), np.nan, dtype=np.float64)

    for j in range(360):
        n_start = int(j * 1.6)
        n_end = int((j + 1) * 1.6)

        if n_end > n_start:
            n_cells = n_end - n_start
            weights = np.ones(n_cells)

            if n_cells > 1:
                # First cell partial overlap
                weights[0] = (n_start + 1) - j * 1.6
                # Last cell partial overlap
                weights[-1] = (j + 1) * 1.6 - n_end
            else:
                # Only one native cell covered
                weights[0] = 1.6

            weights = weights / weights.sum()
            # lat_avg is (180, 576), select columns n_start:n_end
            out[:, j] = np.nansum(lat_avg[:, n_start:n_end] * weights[None, :], axis=1)

    return out.astype(np.float32)


def load_monthly_regridded(start_year=1980, end_year=2026):
    """Load all monthly data regridded to 1-degree.

    Returns dict mapping (year, month) -> (180, 360) float32 array.
    Skips missing months (e.g., 2026-10, 2026-11, 2026-12).
    """
    monthly = {}
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            try:
                data, lat, lon, _ = read_month(year, month)
            except FileNotFoundError:
                continue
            monthly[(year, month)] = regrid_05x0625_to_1(data, lat, lon)
        if year % 5 == 0:
            print(f"Read/regridded AOD through {year}", flush=True)
    return monthly


# Grid format constants per GRID_FORMAT.md
VAR_SLUG = "aod"
VARIABLE_NAME = "aerosol_optical_depth"
DISPLAY_UNITS = "1"
SLOPE_UNITS = "1/decade"
SCALE = 0.001
OFFSET = 0.0
DECIMALS = 3
SLOPE_SCALE = 0.0001
SLOPE_OFFSET = 0.0
SLOPE_DECIMALS = 4
COVERAGE_SCALE = 0.001
COVERAGE_OFFSET = 0.0
COVERAGE_DECIMALS = 3
LAND_ONLY = False

# Year ranges per GRID_FORMAT.md Section 5.1
# MERRA-2 AOD: 1980-01 to 2026-09
# ANN, SON: 1980..2025 (46 yr)
# MAM, JJA: 1980..2026 (47 yr)
# DJF: 1981..2026 (46 years, January year)
YEARS = {
    "ANN": list(range(1980, 2026)),
    "DJF": list(range(1981, 2027)),
    "MAM": list(range(1980, 2027)),
    "JJA": list(range(1980, 2027)),
    "SON": list(range(1980, 2026)),
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


SOURCE_INFO = {
    "product": "M2TMNXAER",
    "version": "5.12.4",
    "var": "TOTEXTTAU",
    "doi_or_url": "https://doi.org/10.5067/FH9A0MLJPC7N",
}

REGRID_NOTE = "MERRA-2 0.5x0.625 deg area-weighted to 1.0 deg with cos(lat) x overlap area"