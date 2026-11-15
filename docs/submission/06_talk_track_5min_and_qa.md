# 5-Minute Live Talk Track & Judge Q&A — TrendTrace

Local format: **10 minutes total — 5 minutes presenting, then 5 minutes of questions.** The presentation uses the **7-slide animated build-story deck** (`deck/TrendTrace.pptx`, fallback `deck/TrendTrace_safe.pptx` / `deck/TrendTrace.pdf`) plus a ~50-second **live app walkthrough** (`https://trendtrace.earth-trend-detective-frontend.workers.dev` or local `http://127.0.0.1:4180/`). No 30-second video is used.

## Part A: Slide-by-Slide Script (~4 min 10 s)

- **Slide 1 — TrendTrace (30 s):**
  > "Every climate chart online looks the same—a noisy line going up or down, with no way to know whether it means anything. **TrendTrace** lets anyone click anywhere on Earth, see how seasonal rainfall, temperature, aerosol haze, or topsoil moisture has changed, and read the statistical checks right beside the number."

- **Slide 2 — Where the Data Came From (35 s):**
  > "Everything starts from 2,534 public archives: NASA GPCP v3.3 for rainfall, MERRA-2 for temperature and 550 nm aerosols, GLDAS v2.1 for 0–10 cm soil moisture, NOAA ERSST v6 and CPC RONI for El Niño sea-surface temperatures, and Natural Earth for boundaries. Notice one engineering choice: we checked GLDAS v2.0 against v2.1 over their 2000–2014 overlap, found a real `+0.47 kg/m²` step jump, and withheld v2.0 instead of fabricating a false trend."

- **Slide 3 — The Python Pipeline (35 s):**
  > "Reproducible Python scripts convert those archives into pure static JSON and PNG files: 11,055 quantized 10°×10° tiles totaling 239 MiB, 40 regional Dec–Feb series, 809 anomaly timelapse frames across all 20 metric-season sets in 17.93 MiB, plus 574 SST anomaly frames, 12 climatology frames, and 6 impact maps—verified by 180 Python tests and 5/5 integrity checks."

- **Slide 4 — Data Flows onto the 1° Global Globe (30 s):**
  > "All four metrics run live in the browser with zero backend server. Clicking any 1° cell decodes its tile locally and computes full trend statistics in 0.29 milliseconds—verified to match all 26 Python numerical fixtures."

- **Slide 5 — How We Decide a Trend Is Real (40 s):**
  > "We run four checks on every full record: Sen's slope with a 95% confidence interval, Hamed–Rao 3-lag autocorrelation-corrected Mann–Kendall p-values, a classic Yue–Wang prewhitening sensitivity check, and Benjamini–Hochberg FDR hatching at `q = 0.10`. A p-value here simply means how unusual a trend this large would be if there were no real trend. Method check: our processing pipeline reproduced NASA Giovanni's results for two test regions—Coastal Peru and Indonesia rainfall, Dec–Feb. Every other series uses the same code but has not been compared individually."

- **Slide 6 — El Niño History & Real Impacts (40 s):**
  > "We stripped out all speculative ENSO forecasts and built a 76-year historical atlas instead. Left is December 1997 (`+2.28 °C` RONI; historical RONI peaks reached `+2.40 °C` in `1982–83` and `+2.25 °C` in `2015–16`). Right is our detrended Dec–Feb GPCP rainfall composite (El Niño minus La Niña winters—*associated with, not caused by*): significant drying in Indonesia (`−1.10`, CI `−1.48..−0.72`), Amazon (`−0.95`), and Australia (`−0.68 mm/day`), wetter winters in East Africa (`+0.59`) and California (`+0.52`), plus Indonesia SON haze `+0.28 AOD` (`+0.16..+0.41`), Alberta DJF `+1.51 °C`, and Coastal Peru DJF temp `+1.04 °C` (while Coastal Peru DJF rainfall is not significant)."

- **Slide 7 — Limits, Method Check & What's Next (25 s):**
  > "We keep our limits front and center: 2 of 40 series compared directly against Giovanni, GLDAS v2.0 withheld, named presets DJF-only, zero forecasting, and sub-periods showing no p-values. Now let's switch to the live **TrendTrace** globe."

## Part B: Live App Walkthrough (~50 s)

1. Open `https://trendtrace.earth-trend-detective-frontend.workers.dev/` (or local `http://127.0.0.1:4180/`). Investigate Edmonton (`53.55, -113.49`), **Rainfall**, **DJF**, **Full record** → Run (or click directly on the globe). Point out slope, CI, and p-value (`(i)` → **Glossary** → Back to globe).
2. Expand **Statistical tests → Show checks** (Hamed–Rao + Prewhitening sensitivity check) and **Sources** (Giovanni method-check paragraph).
3. Switch to **Jakarta** (`-6.2, 106.8`), **Aerosols (haze)** or **Soil moisture (0–10 cm)**, click **Timelapse → Play**, toggle speed/scrub, and Close.
4. Open **Library → Indonesia rainfall DJF** → click **"See how this may be connected to El Niño"** to jump directly to its significant highlighted impact (`−1.10 mm/day`, CI `−1.48..−0.72`).
5. Cycle **Normal year (1991–2020)**, **El Niño 1997–98**, **La Niña 2010–11**, and **Full history**, briefly showing the RONI timeline and impact table, then exit back to globe.

## Part C: Anticipated Judge Q&A (Concise 20-Second Answers)

1. **Why delete the El Niño forecast / outlook?** Forecasts from simple historical regression can overstate confidence. Removing all prediction code and serving only observed NOAA RONI/ERSST v6 history + detrended El Niño minus La Niña composites (explicitly framed as associations, not causes) makes every number verifiable.
2. **Why did you withhold GLDAS v2.0 soil moisture?** Auditing the `2000–2014` overlap between GLDAS v2.0 and v2.1 revealed a `+0.469 kg/m²` mean offset (`3.75 kg/m²` spatial RMSE, peaking at `4.93 kg/m²` in 2014-01). Per NASA GES DISC guidance, stitching across different forcing datasets injects artificial slopes, so we kept pure `2000–2026` v2.1.
3. **Why say Coastal Peru and Indonesia passed NASA Giovanni, while calling the rest uncompared?** We reproduced NASA Giovanni exports only for `precip_coastal_peru_DJF` and `precip_indonesia_DJF`. Claiming "validated" globally would overstate our verification, so the UI explicitly labels 2 series `"Compared with NASA Giovanni"` and the other 38 `"Same pipeline; not individually compared"`.
4. **How fast is client-side browser math and does it match Python?** A warmed 47-year series runs Sen's slope, CI, Hamed–Rao, and Yue–Wang in `0.288 ms` mean on static `int16` tiles, matching all 26 Python reference cases within `1e-9` / `1e-6` relative tolerance.
5. **What if Hamed–Rao and Yue–Wang prewhitening disagree?** The UI marks both checks transparently in **Statistical tests → Show checks** and treats disagreement as caution rather than suppressing a borderline signal.
6. **Why no p-values on half-record slices?** Multiple slicing inflates false positives on short noisy climate records, so sub-periods show slopes cleanly without inferential p-values.
7. **Is soil moisture live right now?** Yes—all four metrics (Rainfall, Temperature, Aerosols, and Soil moisture `kg/m²` with its `2001–2020` timelapse baseline and `sm_DJF` ENSO impact map) are active in the UI and tested across 30 Vitest test files (284 passing tests).
8. **How is this hosted with 12,592 static files?** Every tile and PNG is prebuilt into `frontend/dist/` (`297.9 MB`, zero database or Python backend at runtime), deployed on Cloudflare Workers via `frontend/wrangler.jsonc` at `https://trendtrace.earth-trend-detective-frontend.workers.dev` (`trendtrace.earth` custom domain coming).
