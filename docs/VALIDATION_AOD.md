# Data Validation Notes — AOD (MERRA-2 M2TMNXAER)

## Giovanni Request

**Product:** MERRA-2 Monthly Mean Aerosol Diagnostics (M2TMNXAER), version 5.12.4
**Variable:** TOTEXTTAU (Total Aerosol Extinction AOT at 550 nm) — **model/reanalysis field, NOT MODIS satellite AOD**
**Units:** Dimensionless (1)
**Time Range:** December 1980 through February 2026; season DJF labeled by January year, years 1981–2026
**Giovanni Area (W,S,E,N order):**
- Indonesia: 95, -11, 141, 6
- Coastal Peru: -82, -10, -76, -3
**Procedure:** Select time series → area-averaged → download CSV from results/download panel.
**Aggregation:** The product series uses day-weighted mean of monthly values (Dec=31, Jan=31, Feb=28/29). Equal-month mean retained as sensitivity comparison.

## Pass Rule (Set Before Comparison)

Compare each region's box-mask series with Giovanni's monthly area-averaged series for the same box. First compute Giovanni's monthly values, then apply the same DJF day-weighted formula. Pass only if:
- Mean bias ≤ 0.5% of Giovanni series mean
- Mean absolute error ≤ 0.5% of Giovanni series mean
- Maximum single-year absolute difference ≤ max(1% of Giovanni mean, 0.01)
- Sen slopes differ by ≤ max(2% of Giovanni slope magnitude, 0.001 per decade)

No Giovanni monthly CSV has been supplied in this worktree, so neither Indonesia nor Coastal Peru passes yet. All other presets remain unlisted pending individual checks.

## Mask Diagnostics and Box Series

Cell fractions use geographic intersection; area weights are spherical cell area multiplied by the fraction (equivalent to cos(latitude) weighting on this grid). The MERRA-2 native grid is 0.5°×0.625°; regridded to 1° for the global tile grid, but regional series use the native grid for Giovanni comparison.

The following box-mask comparison series use the native 0.5°×0.625° grid. Compare with Giovanni by taking Giovanni monthly area-averaged values first, then applying DJF: day-weighted first (the product series), equal-month second (sensitivity).

### Indonesia

Polygon mask: Natural Earth Admin 0 Indonesia; bounding box approx. 95°E to 141°E, 11°S to 6°N.
Box versus polygon max absolute difference, equal-month: **to be computed**.

Box mask comparison series by January year (dimensionless AOD):

| Year | Day-weighted | Equal-month |
|---:|---:|---:|
| 1981 | *pending* | *pending* |
| ... | | |
| 2026 | *pending* | *pending* |

### Coastal Peru

Polygon mask: Natural Earth Admin 0 Peru clipped to 82°W–76°W, 10°S–3°S.
Box versus polygon max absolute difference, equal-month: **to be computed**.

Box mask comparison series by January year (dimensionless AOD):

| Year | Day-weighted | Equal-month |
|---:|---:|---:|
| 1981 | *pending* | *pending* |
| ... | | |
| 2026 | *pending* | *pending* |

### Other Featured Regions (Box Presets)

The following regions use simple bounding boxes (no land clipping) for initial comparison. Polygon clipping will be applied in future versions.

| Region | Bounding Box (W,S,E,N) |
|---|---|
| Amazon | -75, -15, -45, 5 |
| Sahel | -18, 10, 35, 20 |
| East Africa | 29, -12, 42, 12 |
| India | 68, 6, 98, 36 |
| Australia | 112, -44, 154, -10 |
| California | -125, 32, -114, 42 |
| Alberta / Prairies | -120, 48, -96, 60 |
| Southern Africa | 11, -35, 38, -17 |

Box mask comparison series for these regions: **to be computed**.

## Regridding Note

MERRA-2 native grid is 0.5° lat × 0.625° lon. The global 1° grid tiles use area-weighted regridding (cos(lat) × overlap area). Regional time series for validation are computed on the native grid to match Giovanni's native-grid output. The regridding is only for the click-any-spot 1° grid display.

## Fill Value and Units Check

- Source `_FillValue`: 1e+15
- Units attribute: "1" (dimensionless)
- Negative values in source: set to NaN on read
- Scale factor / add_offset: None reported in sample files

## Known Issues for Validation

1. **Observing System Changes:** MERRA-2 assimilates different satellite instruments over time (e.g., MODIS from ~2000). This may cause step changes in the record that are not geophysical.
2. **Volcanic Events:** Pinatubo (1991) and other eruptions cause extreme AOD spikes that dominate trend calculations.
3. **Model vs. Satellite:** This is a reanalysis field. Giovanni may also serve MODIS AOD (MOD08_M3, MYD08_M3) — ensure the correct product is selected.
4. **Coastal Cells:** MERRA-2 has global coverage (land + ocean). For land-only regions, the polygon clipping excludes ocean cells, but coastal cells are fractional.