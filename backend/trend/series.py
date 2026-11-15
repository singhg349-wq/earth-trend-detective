"""Build contract-shaped rainfall series for a preset or geographic box."""
from datetime import datetime, timezone

import numpy as np
from shapely.geometry import box, mapping

from backend.trend.io import read_month
from backend.trend.regions import FLAGSHIP_REGION_IDS, REGIONS, country_geometry, fractional_mask, box_mask
from backend.trend.seasons import djf_months


def build_series(bbox_or_region, start_year, end_year, equal_month=False) -> dict:
    """Return the DJF contract result for a preset id/spec or [W,S,E,N] box."""
    if isinstance(bbox_or_region, str):
        spec = next((r for r in REGIONS if r["id"] == bbox_or_region), None)
        if spec is None:
            raise ValueError(f"Unknown region: {bbox_or_region}")
        rid, label, bbox = spec["id"], spec["label"], tuple(spec["bbox"])
        if rid == "indonesia":
            geom = country_geometry("Indonesia")
            geometry_label = "Natural Earth Admin 0 polygon"
        elif rid == "coastal_peru":
            geom = box(*bbox).intersection(country_geometry("Peru"))
            geometry_label = "Natural Earth Peru polygon clipped to box"
        else:
            geom, geometry_label = box(*bbox), "BBOX"
    elif isinstance(bbox_or_region, dict):
        bbox = tuple(bbox_or_region["bbox"])
        rid = str(bbox_or_region.get("id", "custom_box"))
        label = str(bbox_or_region.get("label", "Custom box"))
        geom, geometry_label = box(*bbox), "BBOX"
    else:
        bbox = tuple(bbox_or_region)
        if len(bbox) != 4:
            raise ValueError("Bounding box must be [west, south, east, north]")
        rid, label, geom, geometry_label = "custom_box", "Custom box", box(*bbox), "BBOX"

    if len(bbox) != 4 or bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
        raise ValueError("Bounding box must be [west, south, east, north] with positive area")

    first, lat, lon, _ = read_month(start_year - 1, 12)
    if rid in FLAGSHIP_REGION_IDS and isinstance(bbox_or_region, str):
        # Indonesia and Peru use their Natural Earth polygon geometry with fractional cells.
        frac, area = fractional_mask(lat, lon, geom)
    else:
        # Box presets and custom boxes use complete native cells selected by centre.
        frac, area = box_mask(lat, lon, bbox)
    weights = frac * area
    years, values, coverage = [], [], []
    for year in range(start_year, end_year + 1):
        maps = []
        for y, m in djf_months(year):
            arr = first if (y, m) == (start_year - 1, 12) else read_month(y, m)[0]
            maps.append(np.asarray(arr, dtype=float))
        if len(maps) != 3:
            continue
        stack = np.stack(maps)
        import calendar
        valid_month = np.isfinite(stack)
        if equal_month:
            seasonal = np.nansum(stack, axis=0) / np.sum(valid_month, axis=0)
        else:
            days = np.asarray([calendar.monthrange(y, m)[1] for y, m in djf_months(year)], dtype=float)[:, None, None]
            seasonal = np.nansum(stack * days, axis=0) / np.sum(valid_month * days, axis=0)
        valid = np.isfinite(seasonal) & (weights > 0)
        den = float(weights[valid].sum())
        if den <= 0:
            value, cover = None, 0.0
        else:
            value = float(np.sum(seasonal[valid] * weights[valid]) / den)
            cover = den / float(weights.sum())
        years.append(year)
        values.append(value)
        coverage.append(cover)

    try:
        from backend.trend.stats import sen_slope
        slope = sen_slope(years, values)
    except (ImportError, ValueError, TypeError):
        slope = None
    vals = [v if v is not None and np.isfinite(v) else None for v in values]
    payload = {
        "id": f"precip_{rid}_DJF", "variable": "precipitation", "units": "mm/day",
        "source": {"product": "GPCPMON", "version": "3.3", "var": "sat_gauge_precip", "doi_or_url": "https://doi.org/10.5067/MEASURES/GPCP/DATA304"},
        "region": {"id": rid, "label": label, "geometry": geometry_label, "bbox": list(bbox),
                   "cells_used": int(np.count_nonzero(weights)), "area_km2": round(float(weights.sum()), 2)},
        "season": {"code": "DJF", "year_label": "January year", "months": [12, 1, 2], "aggregation": "day-weighted mean of 3 monthly rates"},
        "years": years, "values": vals, "coverage": [float(c) for c in coverage], "anomaly_baseline": None,
        "geometry_file": "data/artifacts/regions.geojson",
        "template_summary": f"{label} DJF precipitation series for {start_year}-{end_year} has {len(years)} seasons.",
        "trend": {"sen_slope_per_decade": slope, "intercept": None, "method": "Sen",
                  "inference": {"status": "unavailable", "p_value": None, "ci": None, "method": None}},
        "validation": {"reference": "Giovanni GPCPMON 3.3 box request", "status": "pending", "notes": "Validation comparison pending; inference unavailable."},
        "generated": datetime.now(timezone.utc).isoformat(), "code_version": "w1-data",
    }
    return payload
