"""Fractional region masks on the GPCP regular grid."""
import math
import zipfile
from pathlib import Path
import numpy as np
import geopandas as gpd
from shapely.geometry import box, mapping

COUNTRY_ZIP = Path(r"D:\trend-detective-data\raw\NaturalEarth_5.1.1\ne_10m_admin_0_countries.zip")

# Featured-region catalog. The final eight are box presets proposed for later
# build-out; Indonesia and Peru remain the only Giovanni-check candidates.
REGIONS = [
    {"id": "indonesia", "label": "Indonesia", "bbox": (95, -11, 141, 6), "polygon_source": "Natural Earth Admin 0: Indonesia"},
    {"id": "coastal_peru", "label": "Coastal Peru", "bbox": (-82, -10, -76, -3), "polygon_source": "Natural Earth Admin 0: Peru clipped to bbox"},
    {"id": "amazon", "label": "Amazon", "bbox": (-75, -15, -45, 5)},
    {"id": "sahel", "label": "Sahel", "bbox": (-18, 10, 35, 20)},
    {"id": "east_africa", "label": "East Africa", "bbox": (29, -12, 42, 12)},
    {"id": "india", "label": "India", "bbox": (68, 6, 98, 36)},
    {"id": "australia", "label": "Australia", "bbox": (112, -44, 154, -10)},
    {"id": "california", "label": "California", "bbox": (-125, 32, -114, 42)},
    {"id": "alberta_prairies", "label": "Alberta / Prairies", "bbox": (-120, 48, -96, 60)},
    {"id": "southern_africa", "label": "Southern Africa", "bbox": (11, -35, 38, -17)},
]
BOXES = {r["id"]: r["bbox"] for r in REGIONS}
FLAGSHIP_REGION_IDS = ("indonesia", "coastal_peru")

def country_geometry(name, archive=COUNTRY_ZIP):
    with zipfile.ZipFile(archive) as z:
        shp = next(n for n in z.namelist() if n.endswith(".shp"))
        uri = f"zip://{archive.as_posix()}!{shp}"
        gdf = gpd.read_file(uri)
    col = "ADMIN" if "ADMIN" in gdf else "NAME"
    row = gdf[gdf[col] == name]
    if row.empty:
        raise ValueError(f"Country polygon not found: {name}")
    return row.geometry.union_all()

def cell_edges(coords):
    c = np.asarray(coords, dtype=float)
    mids = (c[:-1] + c[1:]) / 2
    return np.r_[c[0] - (mids[0]-c[0]), mids, c[-1] + (c[-1]-mids[-1])]

def fractional_mask(lat, lon, geometry):
    """Return cell intersection fractions, geodesic area weights (spherical)."""
    lat, lon = np.asarray(lat), np.asarray(lon)
    descending = lat[0] > lat[-1]
    if descending:
        lat = lat[::-1]
    le, oe = cell_edges(lat), cell_edges(lon)
    fractions = np.zeros((len(lat), len(lon)), dtype=float)
    weights = np.zeros_like(fractions)
    r = 6371.0088
    minx, miny, maxx, maxy = geometry.bounds
    rows = [i for i in range(len(lat)) if max(le[i],le[i+1]) > miny and min(le[i],le[i+1]) < maxy]
    cols = [j for j in range(len(lon)) if max(oe[j],oe[j+1]) > minx and min(oe[j],oe[j+1]) < maxx]
    for i in rows:
        south, north = sorted((le[i], le[i+1]))
        for j in cols:
            west, east = sorted((oe[j], oe[j+1]))
            cell = box(west, south, east, north)
            fractions[i,j] = geometry.intersection(cell).area / cell.area
            weights[i,j] = r*r*math.radians(east-west)*(math.sin(math.radians(north))-math.sin(math.radians(south)))
    if descending:
        fractions = fractions[::-1]
        weights = weights[::-1]
    return fractions, weights

def build_regions(lat, lon, region_ids=FLAGSHIP_REGION_IDS):
    geoms = {}
    for spec in REGIONS:
        rid = spec["id"]
        if rid not in region_ids:
            continue
        if rid == "indonesia":
            geoms[rid] = country_geometry("Indonesia")
        elif rid == "coastal_peru":
            geoms[rid] = box(*spec["bbox"]).intersection(country_geometry("Peru"))
        else:
            geoms[rid] = box(*spec["bbox"])
    out = {}
    for rid, geom in geoms.items():
        if rid in FLAGSHIP_REGION_IDS:
            # These two presets are Natural Earth regions, so retain fractional clipping.
            frac, area = fractional_mask(lat, lon, geom)
        else:
            # The remaining presets are boxes: include whole cells by centre.
            frac, area = box_mask(lat, lon, BOXES[rid])
        weighted = frac * area
        out[rid] = {"geometry": geom, "fraction": frac, "area_weights": weighted,
                    "cells_used": int(np.count_nonzero(frac)), "area_km2": float(weighted.sum())}
    return out

def box_mask(lat, lon, bounds):
    """Select whole grid cells whose centres are inside a Giovanni-style box."""
    lat, lon = np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)
    west, south, east, north = bounds
    frac = ((lat[:, None] >= south) & (lat[:, None] <= north) &
            (lon[None, :] >= west) & (lon[None, :] <= east)).astype(float)
    _, area = fractional_mask(lat, lon, box(*bounds))
    return frac, area
