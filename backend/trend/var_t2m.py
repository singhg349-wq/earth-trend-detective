"""MERRA-2 2 m air temperature: reading, seasons, regridding and encoding.

The rainfall pipeline is reused unchanged.  ``backend.trend.regions`` supplies
the fractional masks and spherical cell areas, ``backend.trend.seasons`` the
DJF aggregation and area mean, and ``backend.trend.stats`` the Sen slope and
the product inference block.  This module adds only what the MERRA-2
``M2TMNXSLV`` product needs:

* the archive file naming (four MERRA-2 stream prefixes);
* the Kelvin to Celsius conversion, checked against the file ``units``
  attribute;
* seasonal aggregation for all five season codes with day weights and the
  complete-season rule of ``docs/GRID_FORMAT.md``;
* area-weighted binning of the native 0.5 x 0.625 degree grid onto the 1
  degree click grid.

Product facts read from the archive on 14 November 2026
(``D:\\trend-detective-data\\raw\\M2TMNXSLV_5.12.4``):

* ``T2M`` has ``long_name`` ``2-meter_air_temperature`` and ``units`` ``K``.
  It is 2 m air temperature, not ``TS`` (surface skin temperature).
* The fill value is ``1e+15`` (``fmissing_value`` and encoding ``_FillValue``).
* Latitude is 361 points from -90 to 90 at 0.5 degree; longitude is 576
  points from -180 to 179.375 at 0.625 degree.
* The record is 1980-01 through 2026-09 with no missing months.

Units convention: every value returned by this module is in degrees Celsius,
``T_C = T_K - 273.15``.  Differences and trends in K and degC are identical.
"""

from __future__ import annotations

import calendar
import re
from pathlib import Path

import numpy as np
import xarray as xr

DATA_ROOT = Path(r"D:\trend-detective-data\raw\M2TMNXSLV_5.12.4")
VARIABLE = "T2M"
KELVIN_OFFSET = 273.15
#: Any |value| at or above this is a MERRA-2 fill marker, not a temperature.
FILL_THRESHOLD = 1.0e14

#: Season code -> calendar months.  DJF is labelled by its January year.
SEASON_MONTHS = {
    "ANN": (1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
    "DJF": (12, 1, 2),
    "MAM": (3, 4, 5),
    "JJA": (6, 7, 8),
    "SON": (9, 10, 11),
}

#: Complete seasons in the verified archive (docs/GRID_FORMAT.md section 5.1).
YEAR_RANGES = {
    "ANN": tuple(range(1980, 2026)),
    "DJF": tuple(range(1981, 2027)),
    "MAM": tuple(range(1980, 2027)),
    "JJA": tuple(range(1980, 2027)),
    "SON": tuple(range(1980, 2026)),
}

#: 1 degree click grid and the canonical int16 scaling from GRID_FORMAT.md.
GRID_SHAPE = (180, 360)
SERIES_SCALE = 0.01
SLOPE_SCALE = 0.001
COVERAGE_SCALE = 0.001
FILL = -32768

_FILE_INDEX: dict[str, dict[tuple[int, int], Path]] = {}


def _month_index(root=DATA_ROOT) -> dict[tuple[int, int], Path]:
    """Map (year, month) to the monthly file, scanned once per archive root."""
    key = str(Path(root))
    index = _FILE_INDEX.get(key)
    if index is None:
        index = {}
        pattern = "MERRA2_*.tavgM_2d_slv_Nx.*.nc4"
        for path in sorted(Path(root).glob(pattern)):
            match = re.search(r"\.(\d{4})(\d{2})\.nc4$", path.name)
            if match:
                index[(int(match.group(1)), int(match.group(2)))] = path
        _FILE_INDEX[key] = index
    return index


def monthly_path(year, month, root=DATA_ROOT):
    """Path of one monthly file, whatever the MERRA-2 stream prefix is."""
    try:
        return _month_index(root)[(int(year), int(month))]
    except KeyError as exc:
        raise FileNotFoundError(f"No MERRA-2 T2M file for {year}-{month:02d}") from exc


def available_months(root=DATA_ROOT):
    """Sorted (year, month) pairs present in the archive root."""
    return sorted(_month_index(root))


def units_attribute(path):
    """The ``units`` string written in one file, read without loading data."""
    with xr.open_dataset(path, decode_times=False) as ds:
        return str(ds[VARIABLE].attrs.get("units", ""))


def to_celsius(values):
    """Convert Kelvin to degrees Celsius; NaN passes through."""
    return np.asarray(values, dtype=float) - KELVIN_OFFSET


def read_month(year, month, root=DATA_ROOT):
    """Read one month of T2M and return ``(degC, lat, lon, "degC")``.

    The source ``units`` attribute must be ``K``.  Anything else raises,
    because converting an unknown unit would invent science.  The fill value is
    taken from ``fmissing_value``, ``missing_value`` or the file encoding, and
    every magnitude at or above :data:`FILL_THRESHOLD` is masked as well.
    """
    path = monthly_path(year, month, root)
    with xr.open_dataset(path, decode_times=False) as ds:
        da = ds[VARIABLE]
        units = str(da.attrs.get("units", "")).strip()
        if units.lower() != "k":
            raise ValueError(f"Unexpected {VARIABLE} units in {path.name}: {units!r}")
        raw = np.asarray(da.values, dtype=np.float64)
        if raw.ndim == 3 and raw.shape[0] == 1:
            raw = raw[0]
        fill = da.attrs.get("fmissing_value")
        if fill is None:
            fill = da.attrs.get("missing_value")
        if fill is None:
            fill = da.encoding.get("_FillValue")
        if fill is not None:
            raw[raw == float(fill)] = np.nan
        raw[np.abs(raw) >= FILL_THRESHOLD] = np.nan
        lat = np.asarray(ds["lat"].values, dtype=float)
        lon = np.asarray(ds["lon"].values, dtype=float)
    if raw.shape != (lat.size, lon.size):
        raise ValueError(f"Unexpected {VARIABLE} shape {raw.shape} in {path.name}")
    return to_celsius(raw), lat, lon, "degC"


def season_keys(season, year):
    """``(year, month)`` pairs for one season, DJF spanning the previous year."""
    if season == "DJF":
        return ((int(year) - 1, 12), (int(year), 1), (int(year), 2))
    return tuple((int(year), int(month)) for month in SEASON_MONTHS[season])


def seasonal_series(monthly, season, years, shape=GRID_SHAPE):
    """Day-weighted seasonal stack with the complete-season rule.

    ``monthly`` maps ``(year, month)`` to a 2-D array (a missing key counts as
    a missing month).  A cell-season is valid only when every required month is
    non-fill there; weights are the actual days in each month, so February gets
    29 days in leap years.  The coverage stack is the day-weighted valid-area
    fraction, and is zero where the season is incomplete.
    """
    values, coverage = [], []
    for year in years:
        keys = season_keys(season, year)
        arrays = [monthly.get(key) for key in keys]
        if any(array is None for array in arrays):
            values.append(np.full(shape, np.nan, dtype=np.float32))
            coverage.append(np.zeros(shape, dtype=np.float32))
            continue
        stack = np.stack([np.asarray(array, dtype=np.float64) for array in arrays])
        days = np.asarray(
            [calendar.monthrange(y, m)[1] for y, m in keys], dtype=np.float64
        )[:, None, None]
        total_days = float(days.sum())
        valid = np.isfinite(stack)
        complete = valid.all(axis=0)
        weight_sum = np.sum(valid * days, axis=0)
        weighted = np.sum(np.where(valid, stack, 0.0) * days, axis=0)
        value = np.divide(
            weighted,
            weight_sum,
            out=np.full(shape, np.nan, dtype=float),
            where=complete & (weight_sum > 0),
        )
        values.append(value.astype(np.float32))
        coverage.append(
            np.where(complete, weight_sum / total_days, 0.0).astype(np.float32)
        )
    return np.stack(values), np.stack(coverage)


def _native_edges(coords):
    """Cell edges for a centre-valued coordinate vector (half spacing at ends)."""
    centres = np.asarray(coords, dtype=float)
    midpoints = (centres[:-1] + centres[1:]) / 2.0
    return np.concatenate(
        ([centres[0] - (midpoints[0] - centres[0])], midpoints,
         [centres[-1] + (centres[-1] - midpoints[-1])])
    )


def _overlap_weights(native_edges, bin_edges, use_cosine):
    """Overlap length (or area) weights between native cells and 1 degree bins.

    ``weight = cos(latitude of the overlap centre) * overlap length`` for the
    latitude direction, and ``weight = overlap length`` for longitude.  That is
    the ``cos(lat) x overlap area`` rule of docs/GRID_FORMAT.md, evaluated on
    the actual overlap so the rows on the poles still carry their small share
    instead of a zero weight at exactly +/-90.
    """
    native_lo = native_edges[:-1]
    native_hi = native_edges[1:]
    weights = np.zeros((len(bin_edges) - 1, native_lo.size), dtype=float)
    for bin_index in range(weights.shape[0]):
        lo = np.maximum(native_lo, bin_edges[bin_index])
        hi = np.minimum(native_hi, bin_edges[bin_index + 1])
        overlap = np.clip(hi - lo, 0.0, None)
        if use_cosine:
            centre = (lo + hi) / 2.0
            overlap = overlap * np.cos(np.deg2rad(centre))
        weights[bin_index] = overlap
    return weights


def regrid_weights(lat, lon):
    """Latitude and longitude weight matrices for the native MERRA-2 grid.

    Returns ``(lat_weights, lon_weights, full_area)`` where the first two are
    ``(180, len(lat))`` and ``(360, len(lon))`` and ``full_area`` is the total
    weight of every 1 degree bin with all native cells valid.
    """
    lat_weights = _overlap_weights(
        _native_edges(lat), np.arange(-90.0, 91.0, 1.0), use_cosine=True
    )
    lon_weights = _overlap_weights(
        _native_edges(lon), np.arange(-180.0, 181.0, 1.0), use_cosine=False
    )
    full_area = np.outer(lat_weights.sum(axis=1), lon_weights.sum(axis=1))
    return lat_weights, lon_weights, full_area


def regrid_to_1deg(values, weights):
    """Area-weighted bin mean of native fields onto the 1 degree grid.

    ``values`` may be ``(lat, lon)`` or ``(time, lat, lon)``.  Returns
    ``(values_1deg, coverage_1deg)``; coverage is the fraction of the bin's
    full area that had a valid native cell.  A bin with no valid native cell is
    NaN with zero coverage.
    """
    lat_weights, lon_weights, full_area = weights
    data = np.asarray(values, dtype=float)
    leading = data.shape[:-2]
    grid_shape = data.shape[-2:]
    flat = data.reshape((-1,) + grid_shape)
    valid = np.isfinite(flat)
    filled = np.where(valid, flat, 0.0)
    numerator = lat_weights @ filled @ lon_weights.T
    denominator = lat_weights @ valid.astype(float) @ lon_weights.T
    gridded = np.divide(
        numerator,
        denominator,
        out=np.full(numerator.shape, np.nan, dtype=float),
        where=denominator > 0,
    )
    coverage = np.divide(
        denominator,
        full_area[None, :, :],
        out=np.zeros(denominator.shape, dtype=float),
        where=full_area[None, :, :] > 0,
    )
    if leading:
        gridded = gridded.reshape(leading + GRID_SHAPE)
        coverage = coverage.reshape(leading + GRID_SHAPE)
        return gridded, coverage
    return gridded[0], coverage[0]


def encode_int16(value, scale=SERIES_SCALE, offset=0.0):
    """Quantize one value with the canonical round-half-to-even rule."""
    if value is None or not np.isfinite(value):
        return FILL
    return int(np.clip(np.rint((float(value) - offset) / scale), -32767, 32767))


def cell_sen(years, values):
    """Full-period Sen slope per decade, or ``None`` below ten valid years."""
    from backend.trend.stats import sen_slope_per_decade

    y = np.asarray(years, dtype=float)
    v = np.asarray(values, dtype=float)
    good = np.isfinite(v)
    if int(good.sum()) < 10:
        return None
    slope = float(sen_slope_per_decade(y[good], v[good]))
    return slope if np.isfinite(slope) else None
