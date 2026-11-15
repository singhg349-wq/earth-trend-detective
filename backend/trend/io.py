"""Input helpers for the local GPCP monthly NetCDF collection."""
from pathlib import Path
import numpy as np
import xarray as xr

DATA_ROOT = Path(r"D:\trend-detective-data\raw\GPCPMON_3.3")
VARIABLE = "sat_gauge_precip"

def monthly_path(year, month, root=DATA_ROOT):
    return Path(root) / f"GPCPMON_L3_{year:04d}{month:02d}_V3.3.nc4"

def read_month(year, month, root=DATA_ROOT):
    path = monthly_path(year, month, root)
    with xr.open_dataset(path, decode_times=False) as ds:
        da = ds[VARIABLE]
        units = da.attrs.get("units", "")
        if units.lower().replace(" ", "") not in {"mm/day", "mmday-1", "mmday**-1", "mmday^-1"}:
            raise ValueError(f"Unexpected {VARIABLE} units: {units!r}")
        arr = np.asarray(da.squeeze().values, dtype=float)
        fill = da.attrs.get("_FillValue", ds[VARIABLE].encoding.get("_FillValue"))
        if fill is not None:
            arr[arr == fill] = np.nan
        arr[~np.isfinite(arr) | (arr < 0)] = np.nan
        lat = np.asarray(ds["lat"].values)
        lon = np.asarray(ds["lon"].values)
    return arr, lat, lon, units
