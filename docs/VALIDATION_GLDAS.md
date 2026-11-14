# Data Validation Notes — Soil Moisture & SWE (GLDAS 2.1)

## Giovanni Request

**Product:** GLDAS Noah Land Surface Model L4 Monthly (GLDAS_NOAH10_M), version 2.1
**Variables:**
- SoilMoi0_10cm_inst (top 0–10 cm soil moisture)
- SWE_inst (snow water equivalent)
**Units:** kg m⁻² (equivalent to mm water depth)
**Time Range:** December 2000 through February 2026; season DJF labeled by January year, years 2001–2026
**Giovanni Area (W,S,E,N order):**
- Indonesia: 95, -11, 141, 6
- Coastal Peru: -82, -10, -76, -3
**Procedure:** Select time series → area-averaged → download CSV from results/download panel.
**Aggregation:** The product series uses day-weighted mean of monthly values (Dec=31, Jan=31, Feb=28/29). Equal-month mean retained as sensitivity comparison.

## Pass Rule (Set Before Comparison)

Compare each region's box-mask series with Giovanni's monthly area-averaged series for the same box. First compute Giovanni's monthly values, then apply the same DJF day-weighted formula. Pass only if:
- Mean bias ≤ 0.5% of Giovanni series mean
- Mean absolute error ≤ 0.5% of Giovanni series mean
- Maximum single-year absolute difference ≤ max(1% of Giovanni mean, 0.5 kg/m²)
- Sen slopes differ by ≤ max(2% of Giovanni slope magnitude, 0.05 kg/m²/decade)

No Giovanni monthly CSV has been supplied in this worktree, so neither Indonesia nor Coastal Peru passes yet. All other presets remain unlisted pending individual checks.

## Mask Diagnostics and Box Series

Cell fractions use geographic intersection; area weights are spherical cell area multiplied by the fraction (equivalent to cos(latitude) weighting on this grid). The GLDAS native grid is already 1.0° × 1.0°; no regridding is applied for regional series.

The following box-mask comparison series use the native 1.0° grid. Compare with Giovanni by taking Giovanni monthly area-averaged values first, then applying DJF: day-weighted first (the product series), equal-month second (sensitivity).

### Indonesia

Polygon mask: Natural Earth Admin 0 Indonesia; bounding box approx. 95°E to 141°E, 11°S to 6°N.
GLDAS land cells in region: **to be computed**.
Box versus polygon max absolute difference, equal-month: **to be computed**.

Box mask comparison series by January year (kg/m²):

| Year | SoilMoi0_10cm_inst (day-weighted) | SoilMoi0_10cm_inst (equal-month) | SWE_inst (day-weighted) | SWE_inst (equal-month) |
|---:|---:|---:|---:|---:|
| 2001 | *pending* | *pending* | *pending* | *pending* |
| ... | | | | |
| 2026 | *pending* | *pending* | *pending* | *pending* |

### Coastal Peru

Polygon mask: Natural Earth Admin 0 Peru clipped to 82°W–76°W, 10°S–3°S.
GLDAS land cells in region: **to be computed** (expected ~10-20 cells due to coarse 1° resolution).
Box versus polygon max absolute difference, equal-month: **to be computed**.

Box mask comparison series by January year (kg/m²):

| Year | SoilMoi0_10cm_inst (day-weighted) | SoilMoi0_10cm_inst (equal-month) | SWE_inst (day-weighted) | SWE_inst (equal-month) |
|---:|---:|---:|---:|---:|
| 2001 | *pending* | *pending* | *pending* | *pending* |
| ... | | | | |
| 2026 | *pending* | *pending* | *pending* | *pending* |

### Other Featured Regions (Box Presets)

| Region | Bounding Box (W,S,E,N) | Notes |
|---|---|---|
| Amazon | -75, -15, -45, 5 | Large region, many land cells |
| Sahel | -18, 10, 35, 20 | Semi-arid, strong seasonal cycle |
| East Africa | 29, -12, 42, 12 | Complex terrain |
| India | 68, 6, 98, 36 | Monsoon region |
| Australia | 112, -44, 154, -10 | Large, diverse climates |
| California | -125, 32, -114, 42 | Mediterranean, mountains |
| Alberta / Prairies | -120, 48, -96, 60 | Continental, snow in winter |
| Southern Africa | 11, -35, 38, -17 | Subtropical |

Box mask comparison series for these regions: **to be computed**.

## Land Mask and Coastal Cells

GLDAS 2.1 is land-only. Ocean cells and Antarctica are fill (-9999.0). The land mask is derived from the soil moisture variable (cells with finite values in at least one month).

**Coastal regions warning:** At 1.0° resolution, coastal regions like Coastal Peru (6°×7° box) contain only a handful of land grid cells. The polygon clipping further reduces this. Cell count and area_km² are reported in each artifact; interpret trends with caution for regions with <20 land cells.

## Fill Value and Units Check

- Source `_FillValue`: -9999.0 (all variables)
- Units attribute: "kg m-2" (both SoilMoi0_10cm_inst and SWE_inst)
- Scale factor / add_offset: None reported in sample files

## Known Issues for Validation

1. **Short Record:** DJF 2001–2026 (26 seasons) — cannot directly compare slopes with 1984–2025 rainfall unless rainfall is subset to 2001–2025.
2. **Coarse Resolution:** 1.0° grid cells are ~110 km at equator. Coastal regions have few cells; trends may not be representative.
3. **Version Separation:** GLDAS 2.0 (1948–2014) and 2.1 (2000–2026) have different forcing. Do not combine.
4. **SWE in Tropics:** SWE_inst is near-zero in tropical regions (Indonesia, Amazon, Sahel, etc.). Only meaningful for mid/high-latitude and mountain regions.
5. **2025 Forcing Change:** GLDAS 2.1 radiation forcing changed to GALWEM from 9 June 2025. May affect trends ending in 2026.
6. **Giovanni Coastal Handling:** Verify how Giovanni treats ocean fill values (-9999) inside a bounding box that spans land and ocean. The box average may include fill values if not properly masked.

## Anomaly Baseline (Open Question)

- **Raw values** (kg m⁻²) are reported by default.
- A 2001–2020 (20-year) baseline could be used for anomalies.
- The standard 1991–2020 baseline is **not available** in GLDAS 2.1 (record starts 2000-01).
- Do not mix GLDAS 2.0 and 2.1 for a longer baseline.
- Decision pending from science lead.