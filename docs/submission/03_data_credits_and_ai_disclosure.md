# Data Sources, Software Credits & AI Disclosure — TrendTrace

All data products used in **TrendTrace** are publicly released Earth science and cartography datasets. Zero endorsement by NASA, NOAA, or any agency is implied. No forecasts or predictions are included.

## 1. Scientific & Reference Data Sources

| Dataset | Role in TrendTrace | Coverage & Files Processed | Identifier / Citation |
|---|---|---|---|
| **NASA GPCP Monthly Analysis v3.3** (`GPCPMON_3.3`, `sat_gauge_precip`, `mm/day`) | Global 1° rainfall tiles (`5` seasons), `10` regional DJF series, `5` seasonal timelapses, `precip_DJF` / `precip_JJA` ENSO impact maps | `1983-01`–`2025-12` (`516` monthly `.nc4` processed; archive `1,033` files / `4.03 GB`) | `10.5067/MEASURES/GPCP/DATA306` (verified against the NASA Earthdata catalog entry for `GPCPMON` v3.3) |
| **NASA MERRA-2 `M2TMNXSLV` v5.12.4** (`T2M`, 2 m air temperature, `°C`) | Global 1° temperature tiles (`5` seasons), `10` regional DJF series, `5` seasonal timelapses, `t2m_DJF` / `t2m_JJA` ENSO impact maps | `1980-01`–`2026-08` (`560` monthly `.nc4` processed; archive `1,123` files / `583 MB`) | `10.5067/AP1B0BA5PD2K` |
| **NASA MERRA-2 `M2TMNXAER` v5.12.4** (`TOTEXTTAU`, 550 nm aerosol optical depth, unitless) | Global 1° aerosol/haze tiles (`5` seasons), `10` regional DJF series, `5` seasonal timelapses, `aod_SON` ENSO impact map | `1980-01`–`2026-08` (`560` monthly `.nc4` processed; archive `1,123` files / `362 MB`) | `10.5067/FH9A0MLJPC7N` |
| **NASA GLDAS Noah Land Surface Model L4 v2.1** (`GLDAS_NOAH10_M_2.1`, `SoilMoi0_10cm_inst`, `kg/m²`) | Global 1° land-only topsoil moisture tiles (`1,335` tiles, `-59.5°..89.5°`, `5` seasons), `10` regional DJF series, `5` timelapses (`2001–2020` baseline), `sm_DJF` ENSO impact map | `2000-01`–`2026-07` (`319` monthly `.nc4` processed; archive `639` files / `663 MB`). **`GLDAS_NOAH10_M_2.0` (`804` `.nc4` files) audited over `2000–2014` overlap and intentionally excluded** (`v2.1 − v2.0 = +0.469 kg/m²` jump, `3.75 kg/m²` spatial RMSE). | `10.5067/LWTYSMP3VM5Z` |
| **NOAA ERSST v6** (`ERSST_6`, 2° × 2° global SST, `°C`) | `574` monthly global SST anomaly rasters (`1979–2026`, `9.39 MiB` transparent-land PNGs), `12` absolute monthly climatology frames (`1991–2020`, `152.1 KB`) | `1979-01`–`2026-10` (`574` monthly `.nc` processed; archive `4,245` files / `358 MB`) | Huang et al. (2025) *J. Climate*, `10.1175/JCLI-D-23-0707.1` & `10.1175/JCLI-D-24-0185.1` |
| **NOAA CPC ENSO Indices** (`RONI.ascii.txt`, `oni.ascii.txt`, `oni_jan_1984_2025.csv`) | `921` overlapping 3-month RONI seasons (`DJF 1950`–`ASO 2026`, `44` qualifying episodes), traditional ONI comparison (`43` episodes), seasonal ENSO correlations | `data/reference/enso/history/` (`2` ASCII tables, `2/2` SHA-256 verified in `MANIFEST.json`). Outlook/forecast data deleted. | NOAA Climate Prediction Center (public domain) |
| **Natural Earth Admin 0 Countries & Land v5.1.1** | Vector country/coastline overlays (`10m` / `50m`), regional polygons, land/sea-ice masking | `3` vector archives (`8.20 MB`) | Natural Earth public domain |

**Method-check statement:** Our processing pipeline reproduced NASA Giovanni's results for two test regions (`precip_coastal_peru_DJF` and `precip_indonesia_DJF`). Every other series (`8` rainfall regions + `10` temperature + `10` aerosol + `10` soil moisture = `38` remaining regional series, plus 1° tiles) is produced by the same code but has not been compared individually.

## 2. Software & Open-Source Libraries

- **Frontend web app:** React `19.3.1`, TypeScript `5.9.3`, Vite `8.3.8`, MapLibre GL `6.18.0`, Vitest `5.1.0`. Deployed on Cloudflare Workers via `frontend/wrangler.jsonc` at `https://trendtrace.earth-trend-detective-frontend.workers.dev` (`trendtrace.earth` custom domain coming).
- **Python data & presentation pipeline:** Python `3.12.2`, `numpy 2.5.3`, `scipy 1.18.1`, `pandas 3.1.1`, `xarray 2026.9.0`, `netCDF4 1.7.5.1.post1`, `shapely 2.2.0`, `geopandas 1.2.0`, `matplotlib 3.11.2`, `Pillow 12.3.0`, `pytest 9.2.0`, `python-pptx 1.0.2`.

## 3. AI Disclosure

AI coding assistants (Claude / Codex / Gemini-family agents in the workspace) were used to draft frontend TypeScript components, Python ETL and statistical verification scripts, submission copy, and the OOXML presentation generator (`deck/build_decks.py`). Every numeric statistic, checksum, pixel sanity check, screenshot, test suite (`180` pytest + `284` Vitest + `5/5` data integrity checks), and COM-verified presentation export was executed locally and inspected by human operators prior to submission.

- **City search data:** GeoNames (geonames.org), cities15000, licensed CC BY 4.0, modified (alternate names dropped, coordinates rounded).
