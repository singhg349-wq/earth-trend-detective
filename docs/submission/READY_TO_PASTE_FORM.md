# NASA Space Apps Challenge 2026 — Ready-to-Paste Submission Form

This document contains every official field required by the NASA Space Apps Challenge project submission portal, filled out completely and verified against character/word limits.

---

### Field 1: Project Name
```text
TrendTrace
```

---

### Field 2: Challenge Selected
```text
Be An Earth System Trend Detective!
```

---

### Field 3: Team Name
```text
Team One
```

---

### Field 4: High-Level Project Summary
*Limit: Strictly <= 200 words. Word count below: 184 words.*

```text
TrendTrace — 2026 NASA Space Apps Challenge: Be An Earth System Trend Detective!
Click anywhere on Earth. See what is changing, where, by how much, and whether it is statistically significant.

TrendTrace is an interactive 3D globe backed by NASA Earth science missions and reanalysis/model records since 1980, requiring zero backend server. Clicking any location snaps to a 1° cell and computes Sen's slope per decade, a 95% confidence interval, an autocorrelation-corrected Mann–Kendall p-value (Hamed–Rao, 3 lags), and a prewhitened Yue–Wang sensitivity check in the browser (~0.3 ms).

Ten focus regions offer long-term series and 20 global seasonal anomaly timelapses across four metrics: GPCP v3.3 rainfall, MERRA-2 2 m temperature, MERRA-2 aerosol haze, and GLDAS v2.1 soil moisture. An El Niño atlas pairs 921 NOAA RONI seasons (1950–2026), 574 monthly ERSST v6 SST anomaly frames, a 12-month normal-year climatology, and six detrended ENSO composite impact maps with Benjamini–Hochberg FDR hatching (q = 0.10).

Method check: our pipeline aggregation was validated against NASA Giovanni reference series. Evaluators can click the "Present" button on the live site for a guided interactive walkthrough alongside our 7-slide deck.
```

---

### Field 5: Link to Project Demo
*Slide presentation deck (7 slides) and interactive guided walkthrough:*

- **Primary Slide Deck (GitHub raw/blob link):**  
  `https://github.com/singhg349-wq/earth-trend-detective/blob/main/deck/TrendTrace.pdf`  
  *(Local repository path: `deck/TrendTrace.pdf` — 7 slides, English)*
- **Interactive Live Present Mode (Web Walkthrough):**  
  `https://trendtrace.earth-trend-detective-frontend.workers.dev/?present=1`  
  *(Judges can click the **Present** button directly in the top navigation of the live web app to experience an interactive, 7-scene presentation with live 3D globe camera choreography, data highlights, and statistical diagnostics synchronized with the slide deck).*

---

### Field 6: Detailed Project Description
*Limit: Strictly <= 3,000 characters. Character count below: 2,794 characters.*

```markdown
## What TrendTrace Is

Built for 2026 NASA Space Apps: Be An Earth System Trend Detective!, TrendTrace is a 3D globe backed by static climate archives (zero server required). Select NASA Earth-science mission and model variables, visualize change over time, and see what is changing, where, by how much, and whether it is statistically significant. Click any point or region for its seasonal series, decadal trend, uncertainty, and provenance across five seasons (ANN, DJF, MAM, JJA, SON) and four metrics: Rainfall (GPCP v3.3, mm/day, 1983–2025), 2 m Temperature (MERRA-2 reanalysis, °C, 1980–2026), Aerosols (MERRA-2 TOTEXTTAU, 550 nm AOD, 1980–2026), and Topsoil moisture (GLDAS Noah v2.1 model, kg/m², 2000–2026), plus 20 global anomaly timelapses. Evaluators can click the Present button on the live site (?present=1) for a guided interactive demo alongside our 7-slide deck.

## How We Decide Whether a Trend Is Real

A short noisy line on a chart proves nothing on its own. Every full-period record shows Sen's slope per decade, a 95% interval, a 3-lag Hamed–Rao autocorrelation-corrected Mann–Kendall p-value, and a classic Yue–Wang prewhitening sensitivity check in plain language. Every chart defines p-value as how unusual a trend this large would be if there were no real trend. Global trend overlays hatch false-discovery-rate significant cells at Benjamini–Hochberg q = 0.10. Sub-period slices (Option A Custom Year Range) display descriptive Sen slopes and means only, withholding p-values to prevent sub-period p-hacking.

## El Niño History & Composite Associations (No Forecasting)

TrendTrace includes no weather or ENSO forecasts. Instead, its El Niño page walks through 921 overlapping three-month NOAA Relative Oceanic Niño Index (RONI) seasons (1950–2026, 44 qualifying episodes; peak RONI +2.40 °C in 1982–83, +2.28 °C in 1997–98, +2.25 °C in 2015–16), 574 monthly ERSST v6 sea-surface temperature anomaly rasters (1979–2026), a 12-month 1991–2020 absolute temperature normal year, and six linear-detrended El Niño minus La Niña winter composite maps (associated with, not caused by) verified by 2,000 permutations and Benjamini–Hochberg FDR (precip_DJF, t2m_DJF, aod_SON, precip_JJA, t2m_JJA, sm_DJF).

## Method Check & Scientific Limits

We validated our aggregation and trend-testing pipeline against NASA Giovanni reference series and verified 26/26 Python-vs-browser statistical parity tests; individual series export as CSV/JSON. For MERRA-2 aerosols, MODIS assimilation began c. 2000 (earlier land AOD is largely model-driven). For soil moisture, we audited 2000–2014 GLDAS v2.0 vs v2.1 (+0.469 kg/m² jump, 3.75 kg/m² RMSE) and withheld v2.0. Live site: https://trendtrace.earth-trend-detective-frontend.workers.dev (zero agency endorsement implied).
```

---

### Field 7: Final Project Link (Live Web App & Code Repository)
```text
Live Web Application:
https://trendtrace.earth-trend-detective-frontend.workers.dev

Source Code Repository:
https://github.com/singhg349-wq/earth-trend-detective
```

---

### Field 8: NASA Data & Resources Used
*(Include dataset names, short names, spatial/temporal coverage, and official DOIs)*

```text
1. NASA GPCP Monthly Analysis v3.3 (GPCPMON_3.3)
   - Parameter: sat_gauge_precip (Satellite-Gauge Combined Precipitation, mm/day)
   - Coverage: 1983-01 to 2025-12 (516 monthly files processed; 4.03 GB raw archive)
   - DOI: 10.5067/MEASURES/GPCP/DATA306
   - Role: Global 1° rainfall tiles (5 seasons), 10 regional DJF series, 5 seasonal timelapses, DJF/JJA ENSO composite maps.

2. NASA MERRA-2 2D Atmospheric Reanalysis (M2TMNXSLV v5.12.4)
   - Parameter: T2M (2-meter air temperature, °C)
   - Coverage: 1980-01 to 2026-08 (560 monthly files processed; 583 MB raw archive)
   - DOI: 10.5067/AP1B0BA5PD2K
   - Role: Global 1° temperature tiles, 10 regional DJF series, 5 seasonal timelapses, DJF/JJA ENSO composite maps.

3. NASA MERRA-2 2D Aerosol Reanalysis (M2TMNXAER v5.12.4)
   - Parameter: TOTEXTTAU (Total Extinction Aerosol Optical Depth at 550 nm, unitless)
   - Coverage: 1980-01 to 2026-08 (560 monthly files processed; 362 MB raw archive)
   - DOI: 10.5067/FH9A0MLJPC7N
   - Role: Global 1° aerosol haze tiles, 10 regional DJF series, 5 seasonal timelapses, SON ENSO composite map.
   - Scientific note: Post-2000 assimilates NASA MODIS observations; pre-2000 land AOD is predominantly model-driven.

4. NASA GLDAS Noah Land Surface Model L4 Monthly v2.1 (GLDAS_NOAH10_M_2.1)
   - Parameter: SoilMoi0_10cm_inst (Topsoil moisture, 0–10 cm depth, kg/m²)
   - Coverage: 2000-01 to 2026-07 (319 monthly files processed; 663 MB raw archive)
   - DOI: 10.5067/LWTYSMP3VM5Z
   - Role: 1,335 global 1° land tiles, 10 regional DJF series, 5 timelapses (2001–2020 baseline), DJF ENSO map.
   - Scientific note: GLDAS v2.0 was audited over 2000–2014 overlap and intentionally excluded due to a +0.469 kg/m² calibration discontinuity.

5. NASA Giovanni (Goddard Earth Sciences Data and Information Services Center)
   - Role: Reference benchmark extractions for regional rainfall series in Coastal Peru and Indonesia to independently cross-check aggregation and area-weighting algorithms.
```

---

### Field 9: External Resources, Tools & Software Credits
```text
External Scientific Datasets:
- NOAA Extended Reconstructed Sea Surface Temperature v6 (ERSST v6): 574 monthly global SST anomaly rasters (1979–2026) and 12-month normal year climatology (1991–2020). DOI: 10.1175/JCLI-D-23-0707.1.
- NOAA Climate Prediction Center ENSO Indices: 921 overlapping 3-month Relative Oceanic Niño Index (RONI) seasons (1950–2026) and traditional ONI records.
- Natural Earth v5.1.1: Public domain vector country boundaries and land polygons.
- GeoNames: cities15000 geographic search database (CC BY 4.0).

Scientific Literature & Statistical Methods:
- Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. J. Amer. Statist. Assoc.
- Mann, H. B. (1945) & Kendall, M. G. (1975). Non-parametric tests for monotonic trends.
- Hamed, K. H., & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. J. Hydrol., 204(1-4), 182-196.
- Yue, S., & Wang, C. (2004). The Mann-Kendall test modified by effective sample size to detect trend in serially correlated hydrological series. Water Resour. Manage., 18(3), 201-218.
- Benjamini, Y., & Hochberg, Y. (1995). Controlling the false discovery rate. J. R. Stat. Soc. B, 57(1), 289-300.

Software & Frameworks:
- Frontend: React 19.3.1, TypeScript 5.9.3, Vite 8.3.8, MapLibre GL 6.18.0, Vitest 5.1.0, Lucide React.
- Cloud Hosting: Cloudflare Workers edge network.
- Data Processing & Pipeline: Python 3.12, NumPy 2.5, SciPy 1.18, Pandas 3.1, xarray 2026.9, netCDF4 1.7.5, Shapely 2.2, Pillow 12.3, python-pptx 1.0.2.
```

---

### Field 10: AI Disclosure
```text
AI coding assistants (Claude, Codex, and Gemini-family LLM agents) were used to assist in scaffolding React frontend components, drafting Python ETL scripts, formatting submission documentation, and building the automated PowerPoint XML generation script (deck/build_decks.py).

Every statistical formula, algorithm implementation, unit test (317 Vitest tests + 180 Pytest tests), data parity cross-check, numerical calculation, and scientific claim was independently verified, run locally, and audited by human team members prior to submission.
```
