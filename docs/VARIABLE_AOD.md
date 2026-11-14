# Variable: Aerosol Optical Depth (AOD)

## Source Product
- **Product:** MERRA-2 M2TMNXAER (tavgM_2d_aer_Nx)
- **Version:** 5.12.4
- **DOI:** 10.5067/FH9A0MLJPC7N
- **Variable:** TOTEXTTAU (Total Aerosol Extinction AOT at 550 nm)
- **Type:** Model/reanalysis field with assimilated satellite observations — **NOT MODIS satellite AOD**

## Temporal Coverage
- **Archive:** January 1980 through September 2026 (561 months, complete)
- **DJF Seasons:** 1981 through 2026 (46 seasons, labeled by January year)
- **Other Seasons:**
  - ANN, SON: 1980–2025 (46 years)
  - MAM, JJA: 1980–2026 (47 years)

## Spatial Domain
- **Native Grid:** 0.5° latitude × 0.625° longitude (361 × 576)
- **Latitude:** -90 to 90 (descending, step 0.5°)
- **Longitude:** -180 to 179.375 (step 0.625°)
- **Coverage:** Global (land and ocean)
- **Regridded to 1°:** Area-weighted (cos(lat) × overlap area) to 180 × 360 grid

## Units and Scaling
- **Native Units:** Dimensionless (1) — optical depth ratio
- **Display Units:** 1 (dimensionless)
- **Slope Units:** 1/decade
- **Fill Value:** 1e+15 (replaced with NaN on read)
- **Valid Range:** ≥ 0 (negative values set to NaN)

### Grid Format Int16 Encoding (per GRID_FORMAT.md)
| Field | Scale | Offset | Decimals | Range |
|-------|-------|--------|----------|-------|
| Series values | 0.001 | 0.0 | 3 | -32.767 to 32.767 |
| Sen slope | 0.0001 | 0.0 | 4 | -3.2767 to 3.2767 |
| Coverage | 0.001 | 0.0 | 3 | 0.000 to 1.000 |
| Fill (int16) | -32768 | — | — | — |

## Seasonal Aggregation (DJF)
- **Months:** December (year-1), January (year), February (year)
- **Year Label:** January year (e.g., DJF 1981 = Dec 1980 + Jan/Feb 1981)
- **Weighting:** Day-weighted mean
  - December: 31 days
  - January: 31 days
  - February: 28 days (29 in leap years)
- **Complete Season Rule:** All three months must have valid data; otherwise the season is excluded

## Featured Regions (10)
Same regions as rainfall (see `backend/trend/regions.py`):
1. Indonesia (Natural Earth Admin 0 polygon)
2. Coastal Peru (Peru polygon clipped to 82°W–76°W, 10°S–3°S)
3. Amazon (bbox)
4. Sahel (bbox)
5. East Africa (bbox)
6. India (bbox)
7. Australia (bbox)
8. California (bbox)
9. Alberta/Prairies (bbox)
10. Southern Africa (bbox)

## Regional Averaging
- **Spatial:** Area-weighted using cos(latitude) × cell fraction (from polygon intersection)
- **Mask:** Natural Earth 5.1.1 Admin 0 polygons for flagship regions; bounding boxes for others
- **Minimum Coverage:** Not enforced in build; reported per season in `coverage` array

## Trend Inference
Per `docs/CONTRACT.md` and `backend/trend/stats.py`:
- **Main Test:** Mann-Kendall with Hamed-Rao variance correction (max_lag=3)
- **Strict Check:** Yue-Wang classic prewhitening (trend_preserving=False)
- **Sen Slope Interval:** Always reported (assumes independent years)
- **Caution Flag:** Detrended lag-1 autocorrelation ≥ 0.3
- **Status:** `ok` if n ≥ 8, finite p-value, positive variance; else `unavailable`

## Known Limitations
1. **Model/Reanalysis Product:** MERRA-2 AOD assimilates satellite observations that changed over time (e.g., MODIS entering ~2000). This can introduce artificial shifts in long-term trends.
2. **Observing System Changes:** The assimilation system and input data streams evolved. Do not treat as an unchanged satellite instrument record.
3. **Skewed Distribution:** AOD is bounded at zero with extreme spikes during wildfires/volcanic events (e.g., Pinatubo 1991), which can affect Sen's slope.
4. **Not MODIS:** This is a reanalysis field, not a direct satellite retrieval. For satellite AOD context, see MOD08_M3 (Terra) and MYD08_M3 (Aqua).

## Giovanni Validation
- **Product in Giovanni:** MERRA-2 M2TMNXAER v5.12.4
- **Variable:** TOTEXTTAU
- **Season:** DJF (December-February, labeled by January year)
- **Time Range:** 1981–2026
- **Regions to Check:** Indonesia (95E, 11S, 141E, 6N), Coastal Peru (82W, 10S, 76W, 3S) in W,S,E,N order
- **Comparison:** Box-mask area average vs. Giovanni monthly area average, then day-weighted DJF

## Grid Artifacts
- **Path:** `data/artifacts/grid/aod/<season>/<tile_lon>_<tile_lat>.json`
- **Tile Size:** 10° × 10° (100 cells max)
- **Index:** `data/artifacts/grid/index.json`
- **Total Size Budget:** ~79 MB uncompressed (all 5 seasons)

## Regional Artifacts
- **Path:** `data/artifacts/aod_<region>_DJF.json`
- **Format:** Per `docs/CONTRACT.md`
- **Geometry:** `data/artifacts/regions.geojson`

## Build Scripts
- `scripts/build_aod.py` — builds grid tiles and regional artifacts
- `backend/trend/var_aod.py` — I/O, regridding, constants