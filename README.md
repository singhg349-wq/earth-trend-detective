# Earth System Trend Detective

NASA Space Apps 2026: Earth System Trend Detective

## Project Description

This application compares December–January–February (DJF) rainfall trends for two climatically sensitive regions—Indonesia and coastal Peru—using the Global Precipitation Climatology Project (GPCP) Monthly Version 3.3 satellite-gauge combined precipitation product at 0.5° resolution. The analysis covers DJF seasons from 1984 through 2025 (labelled by the January year), producing seasonal totals, linear trend estimates, and ENSO-contextualized anomalies for each region. The goal is to provide a transparent, reproducible comparison of how wet-season rainfall has evolved in these two teleconnected regions over the satellite era.

## How to Run

### Backend (FastAPI)
```bash
uvicorn backend.main:app --reload
```
The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev
```
The development server will be available at `http://localhost:5173` (or the port shown in the terminal).

## Data Note

All primary data files (GPCP Monthly v3.3 NetCDF, Natural Earth polygons, MERRA-2 temperature, NOAA Niño 3.4 index) are **not included in this repository**. They must be downloaded separately from the sources listed in `docs/SOURCES.md` and placed in the expected locations described in the project's data preparation documentation (not in this repo). The repository contains only code, configuration, small fixture JSON files for testing, and generated result artifacts under `data/artifacts/` (each < 10 MB).

## Limits

- **Short record**: 42 DJF seasons (1984–2025) is a relatively short window for robust trend detection in climate data; trends may not be statistically distinguishable from decadal variability.
- **Autocorrelation**: Seasonal rainfall time series exhibit serial correlation, which inflates the apparent significance of ordinary least-squares trend tests if not accounted for.
- **Correlation is not causation**: Any correspondence between regional rainfall and ENSO indices (Niño 3.4) describes association, not a proven physical mechanism.
- **Inference method still being validated**: The statistical inference framework (trend significance testing, uncertainty quantification) is under active development and has not been independently validated. Results labeled with `inference.status: unavailable` or `validation.status: pending` should be treated as exploratory.
- **Spatial representation**: Coastal Peru is defined by a polygon mask; the 0.5° GPCP grid may not fully resolve narrow coastal gradients.
- **Data version dependence**: Results are specific to GPCP v3.3; other precipitation products (e.g., IMERG, ERA5) may yield different trend magnitudes or signs.

---

*No results or numerical findings are presented in this README. See `data/artifacts/` for generated JSON outputs once the pipeline runs.*