# Long Project Description (<= 3000 characters)

## What TrendTrace Is

Built for **2026 NASA Space Apps: *Be An Earth System Trend Detective!***, TrendTrace is a 3D globe backed by static climate archives (zero server required). Select NASA Earth-science mission and model variables, visualize change over time, and see what is changing, where, by how much, and whether it is statistically significant. Click any point or region for its seasonal series, decadal trend, uncertainty, and provenance across five seasons (`ANN`, `DJF`, `MAM`, `JJA`, `SON`) and four metrics: Rainfall (`GPCP v3.3`, `mm/day`, `1983–2025`), 2 m Temperature (`MERRA-2` reanalysis, `°C`, `1980–2026`), Aerosols (`MERRA-2 TOTEXTTAU`, 550 nm AOD, `1980–2026`), and Topsoil moisture (`GLDAS Noah v2.1` model, `kg/m²`, `2000–2026`), plus 20 global anomaly timelapses. Evaluators can click the **Present** button on the live site (`?present=1`) for a guided interactive demo alongside our 7-slide deck.

## How We Decide Whether a Trend Is Real

A short noisy line on a chart proves nothing on its own. Every full-period record shows Sen's slope per decade, a 95% interval, a 3-lag Hamed–Rao autocorrelation-corrected Mann–Kendall p-value, and a classic Yue–Wang prewhitening sensitivity check in plain language. Every chart defines p-value as how unusual a trend this large would be if there were no real trend. Global trend overlays hatch false-discovery-rate significant cells at Benjamini–Hochberg `q = 0.10`. Sub-period slices (Option A Custom Year Range) display descriptive Sen slopes and means only, withholding p-values to prevent sub-period p-hacking.

## El Niño History & Composite Associations (No Forecasting)

TrendTrace includes no weather or ENSO forecasts. Instead, its El Niño page walks through 921 overlapping three-month NOAA Relative Oceanic Niño Index (RONI) seasons (`1950–2026`, 44 qualifying episodes; peak RONI `+2.40 °C` in `1982–83`, `+2.28 °C` in `1997–98`, `+2.25 °C` in `2015–16`), 574 monthly ERSST v6 sea-surface temperature anomaly rasters (`1979–2026`), a 12-month `1991–2020` absolute temperature normal year, and six linear-detrended El Niño minus La Niña winter composite maps (associated with, not caused by) verified by 2,000 permutations and Benjamini–Hochberg FDR (`precip_DJF`, `t2m_DJF`, `aod_SON`, `precip_JJA`, `t2m_JJA`, `sm_DJF`).

## Method Check & Scientific Limits

We validated our aggregation and trend-testing pipeline against NASA Giovanni reference series and verified 26/26 Python-vs-browser statistical parity tests; individual series export as CSV/JSON. For MERRA-2 aerosols, MODIS assimilation began c. 2000 (earlier land AOD is largely model-driven). For soil moisture, we audited `2000–2014` GLDAS v2.0 vs v2.1 (`+0.469 kg/m²` jump, `3.75 kg/m²` RMSE) and withheld v2.0. Live site: `https://trendtrace.earth-trend-detective-frontend.workers.dev` (zero agency endorsement implied).

---
Character count: 2,794 characters (2,915 characters including markdown title; strictly <= 3,000 characters)
