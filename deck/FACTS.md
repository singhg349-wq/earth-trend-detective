# Verified Project Facts (`deck/FACTS.md`)

Every statistic, file count, byte size, and test result below was directly observed from files in `integrate/` or `D:\trend-detective-data` during this session. No numbers are invented or extrapolated.

## 1. Raw Source Archives & Reference Files

- **GPCP Monthly Analysis v3.3 (`GPCPMON_3.3`, variable `sat_gauge_precip`, mm/day, 0.5° × 0.5°)**
  - DOI: `https://doi.org/10.5067/MEASURES/GPCP/DATA306` (archive sidecar / `_PRODUCT.md`; note legacy `DATA304` string remains inside pre-R4 rainfall JSON files).
  - Archive on disk (`D:\trend-detective-data\raw\GPCPMON_3.3`): **1,033 files** (`516` `.nc4`, `516` JSON sidecars, `1` `_PRODUCT.md`), **4,030,169,564 bytes (~4.03 GB)**.
  - Monthly `.nc4` files processed: **516 monthly files** (`1983-01`–`2025-12`).

- **MERRA-2 `M2TMNXSLV` v5.12.4 (variable `T2M` 2 m air temperature, °C, native 0.5° × 0.625° → 1.0°)**
  - DOI: `https://doi.org/10.5067/AP1B0BA5PD2K`.
  - Archive on disk (`D:\trend-detective-data\raw\M2TMNXSLV_5.12.4`): **1,123 files** (`561` `.nc4` `1980-01`–`2026-09`, `561` sidecars, `1` `_PRODUCT.md`), **583,415,537 bytes (~583 MB)**.
  - Monthly `.nc4` files processed: **560 monthly files** (`1980-01`–`2026-08`).

- **MERRA-2 `M2TMNXAER` v5.12.4 (variable `TOTEXTTAU` total aerosol optical depth at 550 nm, unitless, native 0.5° × 0.625° → 1.0°)**
  - DOI: `https://doi.org/10.5067/FH9A0MLJPC7N`.
  - Archive on disk (`D:\trend-detective-data\raw\M2TMNXAER_5.12.4`): **1,123 files** (`561` `.nc4` `1980-01`–`2026-09`, `561` sidecars, `1` `_PRODUCT.md`), **361,873,006 bytes (~362 MB)**.
  - Monthly `.nc4` files processed: **560 monthly files** (`1980-01`–`2026-08`).

- **GLDAS Noah Land Surface Model L4 v2.1 (`GLDAS_NOAH10_M_2.1`, variable `SoilMoi0_10cm_inst`, kg/m², native 1.0° × 1.0° land-only `-59.5°..89.5°`)**
  - DOI: `https://doi.org/10.5067/LWTYSMP3VM5Z`.
  - Archive on disk (`D:\trend-detective-data\raw\GLDAS_NOAH10_M_2.1`): **639 files** (`319` `.nc4` `2000-01`–`2026-07`, `319` sidecars, `1` `_PRODUCT.md`), **662,892,398 bytes (~663 MB)**.
  - **GLDAS v2.0 → v2.1 version-change audit:** `GLDAS_NOAH10_M_2.0` (`804` `.nc4` files `1948-01`–`2014-12`, **1,657,243,933 bytes**) was tested over the `2000–2014` overlap (Jan/Jul cosine-weighted land mean): `v2.1 − v2.0 = +0.469 kg/m²` mean jump (spatial RMSE `3.75 kg/m²`, reaching `4.93 kg/m²` in `2014-01`). Because splicing across different forcing datasets creates artificial trends, **v2.0 is excluded** and ONLY `v2.1` (**319 `.nc4` files**) is used.

- **NOAA ERSST v6 (`ERSST_6`, monthly global SST, 2° × 2°)**
  - DOI / papers: Huang et al. (2025) *J. Climate*, `10.1175/JCLI-D-23-0707.1` & `10.1175/JCLI-D-24-0185.1`.
  - Archive on disk (`D:\trend-detective-data\raw\ERSST_6`): **4,245 files** (`2,122` `.nc` `1850-01`–`2026-10`), **357,641,266 bytes (~358 MB)**.
  - Monthly `.nc` files processed: **574 monthly files** (`1979-01`–`2026-10`, incl. `360` months `1991–2020` for SST climatology).

- **NOAA CPC ENSO Reference Indices (`data/reference/enso/history/`)**
  - Files in `MANIFEST.json`: **2 ASCII tables** (`RONI.ascii.txt` `14,752` bytes; `oni.ascii.txt` `23,050` bytes), **2/2 SHA-256 checksums verified**.
  - Plus `oni_jan_1984_2025.csv` & `SOURCE.md` in `data/reference/enso/` for seasonal ENSO correlation context.

- **Natural Earth Admin 0 Countries & Land v5.1.1 (`D:\trend-detective-data\raw\NaturalEarth_5.1.1`)**
  - **3 files**, **8,201,137 bytes (~8.20 MB)**. Public domain.

- **Combined raw/reference files processed across pipelines:**
  - `516` (GPCP) + `560` (T2M) + `560` (AOD) + `319` (GLDAS v2.1) + `574` (ERSST v6) + `2` (NOAA CPC) + `3` (Natural Earth) = **2,534 input files**.

## 2. Regional, 1° Grid, Timelapse & ENSO History Outputs (`data/artifacts/`)

- **Regional DJF Artifacts (`data/artifacts/index.json`):**
  - **40 regional DJF series**: 10 regions × 4 metrics (`precipitation` 1984–2025 = 42 yr; `temperature` 1981–2026 = 46 yr; `aerosol_optical_depth` 1981–2026 = 46 yr; `soil_moisture` 2001–2026 = 26 yr).
  - Method-check breakdown: **2** `passed` (`precip_coastal_peru_DJF`, `precip_indonesia_DJF` — `"Compared with NASA Giovanni"`), **8** `unchecked-same-method` (other 8 rainfall regions — `"Same pipeline; not individually compared"`), **30** `pending` (`10` temperature + `10` aerosols + `10` soil moisture).

- **1° × 1° Global Grids (`data/artifacts/grid/`):**
  - `precip`: **3,240** JSON tiles (`64,800` cells × `5` seasons, `80,549,839` bytes ≈ **80.55 MB**) + **5** static trend maps + **5** FDR hatches.
  - `t2m`: **3,240** JSON tiles (`64,800` cells × `5` seasons, `89,449,502` bytes ≈ **89.45 MB**).
  - `aod`: **3,240** JSON tiles (`64,800` cells × `5` seasons, `67,431,751` bytes ≈ **67.43 MB**).
  - `sm`: **1,335** land-only JSON tiles (`-59.5°..89.5°`, `5` seasons, `13,219,898` bytes ≈ **13.22 MB**).
  - **Total grid tiles:** **11,055 JSON tiles**, **250,650,990 bytes (~250.65 MB / 239.04 MiB)**.

- **Global Anomaly Timelapses (`data/artifacts/timelapse/`):**
  - **809 PNG frames** across **20 sets** (`4` metrics × `5` seasons `ANN, DJF, MAM, JJA, SON`), **18,797,779 bytes (`17.93 MiB`, < 25 MB budget)**.
  - Baselines: `1991–2020` for `precip`, `t2m`, `aod`; `2001–2020` for `sm` (GLDAS v2.1). Fixed symmetric color scales (`BrBG`, `RdBu_r`, `PuOr_r`).

- **El Niño History, SST & Impact Composites (`data/artifacts/enso_history/`):**
  - **Prediction model status:** **DELETED** everywhere (no forecasts, Brier scores, or hindcasts).
  - `history.json`: **921** overlapping 3-month seasons (`DJF 1950`–`ASO 2026`), **44** qualifying RONI episodes (`>= 5` consecutive seasons at `±0.5 °C`), current `ASO 2026` (`+1.97 °C`, `el_nino`).
  - `sst_global/`: **574** monthly PNG frames (`1979-01`–`2026-10`, `720×360`, transparent land/sea-ice, `−3..+3 °C RdBu_r`), **9,845,466 bytes (`9.39 MiB`, <= 12 MB budget)**, **10** chapter bookmarks (strong/very strong `1979–2026` incl. `1997–98` `+2.28 °C` and `2010–11` `−1.63 °C`, plus developing `2025–26`).
  - `sst_climatology/`: **12** monthly absolute SST frames (`1991–2020` normal year, `−2..32 °C RdYlBu_r`, `155,769` bytes / `152.1 KB`).
  - `impacts/`: **6** composite El Niño minus La Niña maps (`precip_DJF`, `t2m_DJF`, `aod_SON`, `precip_JJA`, `t2m_JJA`, `sm_DJF`), **1,870,191 bytes (`1.78 MiB` PNGs total)**, linear-detrended 1° grids, 2,000 permutations, BH FDR `q = 0.10`, 2,000-resample stratified bootstrap region CIs (`precip_DJF`: Indonesia `−1.10`, Amazon `−0.95`, Australia `−0.68`, East Africa `+0.59`, California `+0.52` mm/day; `aod_SON`: Indonesia `+0.28` AOD; `sm_DJF`: Southern Africa `−2.10`, Australia `−1.88`, East Africa `+1.38` kg/m²).

## 3. Frontend UI Integration Status (`REPORT_luna_r4.md` & `DISCUSSION.md`)

- **Product name & URL:** **TrendTrace** (`<title>` = `TrendTrace`), live at `https://trendtrace.earth-trend-detective-frontend.workers.dev` (Cloudflare Workers via `frontend/wrangler.jsonc`; `trendtrace.earth` custom domain coming).
- **UI active metrics (`frontend/src/lib/metrics.ts`):** All **4 metrics** live in the globe, investigation, timelapse (`20` seasonal anomaly sets), and ENSO impacts (`6` maps incl. `sm_DJF`) UI: **Rainfall (`precipitation`)**, **Temperature (`temperature`)**, **Aerosols (haze) (`aerosol_optical_depth`)**, and **Soil moisture (0–10 cm) (`soil_moisture`)**.
- **Browser inference parity:** Clicked 1° cells compute Sen's slope + 95% CI, Mann–Kendall + Hamed–Rao (3 lags), and Yue–Wang prewhitening sensitivity check in **0.288 ms** mean (47-year series), matching **26/26** Python parity fixtures.
- **Verification commands:** `python scripts/check_data_integrity.py` → `PASS all 5 integrity checks passed`; `python -m pytest tests -q` → `180 passed`; Luna R4 final TrendTrace frontend: `npx tsc --noEmit` PASS, `npx vitest run` → `30 files / 284 tests PASS`, `dist` = `297,944,548 bytes` across `12,592` files (`JS 1,425.95 kB` / `404.24 kB gzip`, `CSS 135.34 kB` / `22.49 kB gzip`).
