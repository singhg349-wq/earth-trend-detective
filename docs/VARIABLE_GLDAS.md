# Variable: Soil Moisture and Snow Water Equivalent (GLDAS 2.1)

## Source Product
- **Product:** GLDAS Noah Land Surface Model L4 Monthly (GLDAS_NOAH10_M)
- **Version:** 2.1
- **DOI:** 10.5067/SXAVCZFAQLNO
- **Variables:**
  - `SoilMoi0_10cm_inst` — Top 0–10 cm soil moisture (instantaneous monthly average)
  - `SWE_inst` — Snow Water Equivalent (instantaneous monthly average)
- **Note:** `Evap_tavg` (evaporation) also available but not used here.

## Temporal Coverage
- **Archive:** January 2000 through July 2026 (319 months)
- **DJF Seasons:** 2001 through 2026 (26 seasons, labeled by January year)
  - DJF 2000 is incomplete (missing December 1999)
- **Other Seasons:**
  - ANN, JJA, SON: 2000–2025 (26 years)
  - MAM: 2000–2026 (27 years)

## Spatial Domain
- **Native Grid:** 1.0° × 1.0° (already 1-degree) — **no regridding needed**
- **Latitude:** -59.5 to 89.5 (150 rows, ascending, cell centers at half-degrees)
- **Longitude:** -179.5 to 179.5 (360 columns, cell centers at half-degrees)
- **Coverage:** Land-only (excludes oceans and Antarctica)
- **Valid Fraction:** ~28% of global grid cells (land fraction)
- **Cell Area:** ~12,300 km² at equator, decreasing poleward

## Units and Scaling
- **Native Units:** kg m⁻² (equivalent to mm water depth)
- **Display Units:** kg/m2
- **Slope Units:** kg/m2/decade
- **Fill Value:** -9999.0 (replaced with NaN on read)
- **Valid Range:**
  - Soil moisture: 0–100 kg/m² (0–10 cm layer saturation ~100 kg/m²)
  - SWE: 0–100,000+ kg/m² (can be large over ice sheets)

### Grid Format Int16 Encoding (per GRID_FORMAT.md)
| Field | Scale | Offset | Decimals | Range |
|-------|-------|--------|----------|-------|
| Series values | 0.01 | 0.0 | 2 | -327.67 to 327.67 |
| Sen slope | 0.001 | 0.0 | 3 | -32.767 to 32.767 |
| Coverage | 0.001 | 0.0 | 3 | 0.000 to 1.000 |
| Fill (int16) | -32768 | — | — | — |

## Seasonal Aggregation (DJF)
- **Months:** December (year-1), January (year), February (year)
- **Year Label:** January year (e.g., DJF 2001 = Dec 2000 + Jan/Feb 2001)
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
- **Land-Only:** Only GLDAS land cells (finite soil moisture) are included; ocean cells are fill
- **Minimum Coverage:** Not enforced in build; reported per season in `coverage` array
- **Coastal Warning:** Coastal regions with only a few land cells (e.g., Coastal Peru) have weak representativeness due to coarse 1.0° resolution. Cell count and area_km² are reported in each artifact.

## Anomalies
**Open question for the lead.** Raw values (kg m⁻²) are reported by default. A 2001–2020 baseline could be used but is not standard for GLDAS 2.1 which starts in 2000 (first complete DJF is 2001). Do not mix with GLDAS 2.0.

## SWE (Snow Water Equivalent)
- Reported alongside soil moisture for all regions
- Near-zero in tropical/lowland regions (Indonesia, Coastal Peru, Amazon, Sahel, East Africa, India, Australia, Southern Africa)
- Meaningful in mid/high-latitude and mountain regions (California, Alberta/Prairies, Northern Europe, Western Canada)
- Same units (kg/m²), same aggregation, same trend inference

## Trend Inference
Per `docs/CONTRACT.md` and `backend/trend/stats.py`:
- **Main Test:** Mann-Kendall with Hamed-Rao variance correction (max_lag=3)
- **Strict Check:** Yue-Wang classic prewhitening (trend_preserving=False)
- **Sen Slope Interval:** Always reported (assumes independent years)
- **Caution Flag:** Detrended lag-1 autocorrelation ≥ 0.3
- **Status:** `ok` if n ≥ 8, finite p-value, positive variance; else `unavailable`

## Known Limitations
1. **Short Record:** 2001–2026 (26 DJF seasons) prevents direct comparison with 1984–2025 rainfall/temperature unless subset.
2. **Coarse Resolution:** 1.0° grid means narrow regions (e.g., Coastal Peru: 6° × 7°) contain only a handful of land cells (~10-20).
3. **Version Separation:** GLDAS 2.0 (1948–2014) and 2.1 (2000–2026) have different forcing. Do not stitch.
4. **SWE Over Ice:** Large SWE values over Greenland/Antarctica ice sheets need ice mask for analysis.
5. **Negative Evaporation:** Can represent condensation (not used here).
6. **2025 Radiation Forcing Change:** GLDAS 2.1 switched to GALWEM radiation forcing from 9 June 2025.

## Giovanni Validation
- **Product in Giovanni:** GLDAS Noah Land Surface Model L4 Monthly v2.1 (GLDAS_NOAH10_M)
- **Variables:** SoilMoi0_10cm_inst, SWE_inst
- **Units:** kg m⁻²
- **Season:** DJF (December-February, labeled by January year)
- **Time Range:** 2001–2026 (or 2001–2025 to match GPCP end year)
- **Regions to Check:** Indonesia (95, -11, 141, 6), Coastal Peru (-82, -10, -76, -3) in W,S,E,N order
- **Comparison:** Box-mask area average vs. Giovanni monthly area average, then day-weighted DJF
- **Note:** Verify how Giovanni treats coastal ocean fill values inside land/ocean bounding boxes

## Grid Artifacts
- **Path:** `data/artifacts/grid/soil/<season>/<tile_lon>_<tile_lat>.json`
- **Tile Size:** 10° × 10° (100 cells max)
- **Land-Only:** Tiles with zero land cells omitted (e.g., ocean, Antarctica)
- **Index:** `data/artifacts/grid/index.json`
- **Total Size Budget:** ~13 MB uncompressed (all 5 seasons, land-only)

## Regional Artifacts
- **Soil Moisture:** `data/artifacts/soil_<region>_DJF.json`
- **SWE:** `data/artifacts/swe_<region>_DJF.json`
- **Format:** Per `docs/CONTRACT.md`
- **Geometry:** `data/artifacts/regions.geojson`
- **Template Summary:** Includes coastal warning and anomaly note

## Build Scripts
- `scripts/build_gldas.py` — builds grid tiles and regional artifacts
- `backend/trend/var_gldas.py` — I/O, land mask, constants