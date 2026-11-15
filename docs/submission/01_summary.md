# Short Project Summary (<= 200 words)

TrendTrace — 2026 NASA Space Apps Challenge: *Be An Earth System Trend Detective!*
Click anywhere on Earth. See what is changing, where, by how much, and whether it is statistically significant.

TrendTrace is an interactive 3D globe backed by NASA Earth science missions and reanalysis/model estimates since 1980, built with zero required server. Clicking any location snaps to a 1° cell and computes Sen's slope per decade, a 95% confidence interval, an autocorrelation-corrected Mann–Kendall p-value (Hamed–Rao, 3 lags), and a prewhitened Yue–Wang sensitivity check in the browser. Ten named regions also offer Dec–Feb series and 20 global seasonal anomaly timelapses across four metrics (rainfall, 2 m temperature, aerosol haze, and topsoil moisture). An El Niño atlas pairs 921 NOAA RONI seasons (`1950–2026`), 574 monthly ERSST v6 sea-surface temperature anomaly frames (`1979–2026`), a 12-month normal-year climatology (`1991–2020`), and six detrended El Niño minus La Niña composite impact maps with false-discovery-rate hatching (`q = 0.10`). Method check: we validated our aggregation and trend-testing pipeline against NASA Giovanni reference series and applied that confirmed method across all datasets; individual series can be exported for direct comparison.

---
Word count: 190 (all words above ---, <= 200 words)
