"""Soil moisture (0-10 cm) variable module for GLDAS Noah L4 monthly 1.0 deg v2.1.

Product: GLDAS_NOAH10_M v2.1 (D:\\trend-detective-data\\raw\\GLDAS_NOAH10_M_2.1)
Variable: SoilMoi0_10cm_inst (kg/m^2, equivalent to mm water depth in top 10 cm)
Native grid: 1.0 deg x 1.0 deg, land-only (-59.5 to 89.5 lat, -179.5 to 179.5 lon).

Version-change policy (2.0 vs 2.1 overlap audit):
- GLDAS v2.0 covers 1948-01..2014-12 (Princeton forcing); v2.1 covers 2000-01..2026-07
  (GPCP/AGRMET forcing, switching radiation to GALWEM from 9 June 2025).
- Overlap check over 2000-2014 (Jan/Jul sample) shows a material global land mean step
  change of +0.469 kg/m^2 (spatial RMSE 3.75 kg/m^2, reaching 4.93 kg/m^2 by Jan 2014).
- Per NOAA/NASA product guidance ("Keep versions 2.0 and 2.1 separate") and honest trend
  practice, we use ONLY v2.1 (2000-01..2026-07) and never splice v2.0 onto v2.1.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Tuple

import netCDF4 as nc
import numpy as np

DATA_ROOT = Path(r"D:\trend-detective-data\raw\GLDAS_NOAH10_M_2.1")
SOIL_VAR = "SoilMoi0_10cm_inst"
UNITS_RAW = "kg m-2"

VAR_SLUG = "sm"
VARIABLE_NAME = "soil_moisture"
DISPLAY_UNITS = "kg/m²"
SLOPE_UNITS = "kg/m²/decade"

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
FILL_INT16 = -32768

SEASONS: Dict[str, Tuple[List[int], str]] = {
    "ANN": ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], "Calendar year"),
    "DJF": ([12, 1, 2], "January year"),
    "MAM": ([3, 4, 5], "Calendar year"),
    "JJA": ([6, 7, 8], "Calendar year"),
    "SON": ([9, 10, 11], "Calendar year"),
}

# GLDAS v2.1 record: 2000-01 through 2026-07 (319 monthly files)
YEARS: Dict[str, List[int]] = {
    "ANN": list(range(2000, 2026)),
    "DJF": list(range(2001, 2027)),
    "MAM": list(range(2000, 2027)),
    "JJA": list(range(2000, 2026)),
    "SON": list(range(2000, 2026)),
}

SOURCE = {
    "product": "GLDAS_NOAH10_M",
    "version": "2.1",
    "var": SOIL_VAR,
    "doi_or_url": "https://doi.org/10.5067/LWTYSMP3VM5Z",
}

REGRID_NOTE = (
    "Native 1.0 deg GLDAS-2.1 land grid (60S to 90N, 2000-01..2026-07). "
    "GLDAS v2.0 (1948-2014) withheld from splicing due to +0.47 kg/m^2 (RMSE 3.75 kg/m^2) overlap step change."
)

SPLICE_NOTE = (
    "GLDAS v2.1 only (2000-01..2026-07, 319 files); v2.0 (1948-2014) was NOT spliced because "
    "2000-2014 overlap differs by +0.47 kg/m² globally (RMSE 3.75 kg/m²)."
)


def monthly_path(year: int, month: int, root: Path = DATA_ROOT) -> Path:
    return Path(root) / f"GLDAS_NOAH10_M.A{year:04d}{month:02d}.021.nc4"


def read_month(year: int, month: int, root: Path = DATA_ROOT) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Read one monthly GLDAS v2.1 topsoil moisture slice (descending lat +89.5..-59.5)."""
    path = monthly_path(year, month, root)
    with nc.Dataset(path, "r") as ds:
        var = ds.variables[SOIL_VAR]
        units = str(getattr(var, "units", ""))
        if units.strip() != UNITS_RAW:
            raise ValueError(f"Unexpected {SOIL_VAR} units: {units!r}")
        raw = var[:]
        if np.ma.isMaskedArray(raw):
            arr = np.asarray(raw.filled(np.nan), dtype=np.float32).squeeze()
        else:
            arr = np.asarray(raw, dtype=np.float32).squeeze()
        fill = getattr(var, "_FillValue", None)
        if fill is not None:
            arr[arr == float(fill)] = np.nan
        arr[~np.isfinite(arr) | (arr < 0)] = np.nan
        lat = np.asarray(ds.variables["lat"][:], dtype=np.float64)
        lon = np.asarray(ds.variables["lon"][:], dtype=np.float64)
    # Flip to descending latitude (+89.5 -> -59.5) to match GPCP/MERRA-2 convention.
    if lat[0] < lat[-1]:
        lat = lat[::-1].copy()
        arr = arr[::-1, :].copy()
    return arr, lat, lon


def load_monthly(
    start_year: int = 2000,
    end_year: int = 2026,
    root: Path = DATA_ROOT,
) -> Tuple[Dict[Tuple[int, int], np.ndarray], np.ndarray, np.ndarray]:
    """Load all available monthly v2.1 files in start_year..end_year."""
    monthly: Dict[Tuple[int, int], np.ndarray] = {}
    lat_ref: np.ndarray | None = None
    lon_ref: np.ndarray | None = None
    for year in range(start_year, end_year + 1):
        for month in range(1, 13):
            p = monthly_path(year, month, root)
            if not p.is_file():
                continue
            arr, lat, lon = read_month(year, month, root)
            if lat_ref is None:
                lat_ref, lon_ref = lat, lon
            monthly[(year, month)] = arr
    assert lat_ref is not None and lon_ref is not None
    return monthly, lat_ref, lon_ref


def encode_int16(val: float | None, scale: float) -> int:
    if val is None or not np.isfinite(val):
        return FILL_INT16
    q = int(np.rint((val - OFFSET) / scale))
    return max(-32767, min(32767, q))
