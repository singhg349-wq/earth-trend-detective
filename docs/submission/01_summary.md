# Short Project Summary (<= 200 words)

TrendTrace — 2026 NASA Space Apps Challenge: *Be An Earth System Trend Detective!*
Click anywhere on Earth. See what is changing, where, by how much, and whether it is statistically significant.

TrendTrace is an interactive 3D globe backed by NASA Earth science missions and reanalysis/model records since 1980, requiring zero backend server. Clicking any location snaps to a 1° cell and computes Sen's slope per decade, a 95% confidence interval, an autocorrelation-corrected Mann–Kendall p-value (Hamed–Rao, 3 lags), and a prewhitened Yue–Wang sensitivity check in the browser (~0.3 ms).

Ten focus regions offer long-term series and 20 global seasonal anomaly timelapses across four metrics: GPCP v3.3 rainfall, MERRA-2 2 m temperature, MERRA-2 aerosol haze, and GLDAS v2.1 soil moisture. An El Niño atlas pairs 921 NOAA RONI seasons (`1950–2026`), 574 monthly ERSST v6 SST anomaly frames, a 12-month normal-year climatology, and six detrended ENSO composite impact maps with Benjamini–Hochberg FDR hatching (`q = 0.10`).

Method check: our pipeline aggregation was validated against NASA Giovanni reference series. Evaluators can click the **Present** button on the live site for a guided interactive walkthrough alongside our 7-slide deck.

---
Word count: 184 (all words above ---, strictly <= 200 words)
