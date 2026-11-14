"""Fractional region masks on the GPCP regular grid."""
import math
import zipfile
from pathlib import Path
import numpy as np
import geopandas as gpd
from shapely.geometry import box, mapping

COUNTRY_ZIP = Path(r"D:\trend-detective-data\raw\NaturalEarth_5.1.1\ne_10m_admin_0_countries.zip")
BOXES = {"indonesia": (95, -11, 141, 6), "coastal_peru": (-82, -10, -76, -3)}

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

def build_regions(lat, lon):
    indonesia = country_geometry("Indonesia")
    peru = country_geometry("Peru")
    geoms = {"indonesia": indonesia, "coastal_peru": box(*BOXES["coastal_peru"]).intersection(peru)}
    out = {}
    for rid, geom in geoms.items():
        frac, area = fractional_mask(lat, lon, geom)
        weighted = frac * area
        out[rid] = {"geometry": geom, "fraction": frac, "area_weights": weighted,
                    "cells_used": int(np.count_nonzero(frac)), "area_km2": float(weighted.sum())}
    return out

def box_mask(lat, lon, bounds):
    return fractional_mask(lat, lon, box(*bounds))
