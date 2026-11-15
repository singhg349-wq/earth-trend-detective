# Long Project Description (<= 3000 characters)

## What TrendTrace Is

TrendTrace opens on a full-bleed 3D globe backed by static climate archives and zero required server. Click a region or any point on Earth to open an investigation drawer showing the seasonal record, decadal trend, uncertainty, and provenance. Global 1° tiles span five seasons (`ANN`, `DJF`, `MAM`, `JJA`, `SON`) across four active NASA datasets: Rainfall (`GPCP v3.3`, `mm/day`, `1983–2025`), 2 m Temperature (`MERRA-2`, `°C`, `1980–2026`), Aerosols/haze (`MERRA-2 TOTEXTTAU`, 550 nm AOD, `1980–2026`), and Topsoil moisture (`GLDAS Noah v2.1`, `kg/m²`, `2000–2026`). All four metrics run live in the web interface alongside 20 global anomaly timelapse layers (`1991–2020` / `2001–2020` baselines).

## How We Decide Whether a Trend Is Real

A short noisy line on a chart proves nothing on its own. Every full-period record shows Sen's slope per decade, an interval noting its independent-years assumption, a 3-lag Hamed–Rao autocorrelation-corrected Mann–Kendall p-value, and a classic Yue–Wang prewhitening sensitivity check in plain language. Every chart defines p-value as how unusual a trend this large would be if there were no real trend. Global trend overlays hatch false-discovery-rate significant cells at Benjamini–Hochberg `q = 0.10`. Sub-period slices display descriptive values only, with no p-values.

## El Niño History & Composite Associations (No Forecasting)

TrendTrace includes no weather or ENSO forecasts. Instead, its El Niño page walks through 921 overlapping three-month NOAA Relative Oceanic Niño Index (RONI) seasons (`1950–2026`, 44 qualifying episodes; peak RONI `+2.40 °C` in `1982–83`, `+2.28 °C` in `1997–98`, `+2.25 °C` in `2015–16`), 574 monthly ERSST v6 sea-surface temperature anomaly rasters (`1979–2026`), a 12-month `1991–2020` absolute temperature normal year, and six linear-detrended El Niño minus La Niña winter composite maps (associated with, not caused by) verified by 2,000 permutations and Benjamini–Hochberg FDR (`precip_DJF`, `t2m_DJF`, `aod_SON`, `precip_JJA`, `t2m_JJA`, `sm_DJF`). Matching regional reports link straight to their highlighted ENSO summary.

## Method Check & Honest Limits

Method check: our processing pipeline reproduced NASA Giovanni's results for two test regions (Coastal Peru and Indonesia rainfall, Dec–Feb). Every other series is produced by the same code but has not been compared individually. For soil moisture, we audited the `2000–2014` overlap between GLDAS v2.0 and v2.1, found a `+0.469 kg/m²` mean step jump (`3.75 kg/m²` spatial RMSE), and withheld v2.0 to avoid artificial splicing trends. Live site: `https://trendtrace.earth-trend-detective-frontend.workers.dev` (`trendtrace.earth` custom domain coming), zero agency endorsement implied.

---
Character count: 2802 (all characters above ---, <= 3000 chars)
