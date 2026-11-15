# Presenter Cheat Sheet — TrendTrace

Print this (2 pages) before the evening presentation (`10 min total: 5 min talk + 5 min Q&A`).

## 1. Setup & Quick Links

- **Live site / local build:** **https://trendtrace.earth-trend-detective-frontend.workers.dev** (`trendtrace.earth` custom domain coming; Pages now deploys as Workers via `frontend/wrangler.jsonc`). Local preview: `npm run preview -- --host 127.0.0.1 --port 4180` inside `frontend/` (`dist` = `297,944,548 B`, `12,592` files).
- **Decks (`7 slides`, R5 Present-mode twin — black + grainy gradient blobs + `Instrument Serif` embedded):**
  1. Primary animated: `deck/TrendTrace.pptx` (Morph `0.72 s` across persistent `!!b0`–`!!b3` blobs + staggered fade-in text; `F5` in PowerPoint desktop — test live Morph playback first!).
  2. Fade-only fallback: `deck/TrendTrace_safe.pptx` (identical 7 slides, embedded fonts, zero XML motion).
  3. Static PDF fallback: `deck/TrendTrace.pdf`.
- **Direct browser bookmarks (pre-open in tabs if desired):**
  - Edmonton Rain DJF: `https://trendtrace.earth-trend-detective-frontend.workers.dev/?lat=53.55&lon=-113.49&metric=precipitation&season=DJF`
  - Jakarta Aerosol SON timelapse: `https://trendtrace.earth-trend-detective-frontend.workers.dev/?lat=-6.2&lon=106.8&metric=aerosol_optical_depth&season=SON&timelapse=1`
  - Indonesia DJF preset / ENSO impact: `https://trendtrace.earth-trend-detective-frontend.workers.dev/?series=precip_indonesia_DJF` & `/#enso?region=indonesia&map=precip_DJF`
  - ENSO Normal year / Glossary p-value: `/#enso?mode=normal` & `/#glossary/pValue`

## 2. Exact Live Demo Click Path (~50 s)

1. Open `https://trendtrace.earth-trend-detective-frontend.workers.dev/` (or `http://127.0.0.1:4180/`). Click **Start an investigation** → Edmonton (`53.55, -113.49`) → **Rainfall** → **DJF** → **Full record** → **Run** (or click directly on the globe).
2. Read slope, CI, and **p-value**. Click `(i)` → **Learn more** → Glossary → **Back to globe**. Expand **Statistical tests → Show checks** and **Sources**.
3. Close result → choose **Jakarta** (`-6.2, 106.8`), **Aerosols (haze)**, **SON** → click **Timelapse → Play** (toggle speed/metric/season, incl. **Soil moisture** `kg/m²`) → **Close**.
4. Open **Library → Indonesia rainfall DJF** → click **"See how this may be connected to El Niño"** to jump directly to its significant highlighted impact (`−1.10 mm/day`, CI `−1.48..−0.72`).
5. Cycle **Normal year** (`1991–2020`), **El Niño 1997–98**, **La Niña 2010–11**, and **Full history** (`574` frames). Scroll explainer/history/impacts → **Back to globe**.

## 3. Core Copy & Method-Check Rules

- **Product & Tagline:** **TrendTrace** — *"Click anywhere on Earth. See what's changing — and how sure we are."*
- **Method-check wording (say verbatim if asked):** *"Method check: our processing pipeline reproduced NASA Giovanni's results for two test regions (Coastal Peru and Indonesia rainfall, Dec–Feb). Every other series is produced by the same code but has not been compared individually."*
- **Impact framing & p-value:** Always say **El Niño minus La Niña winters, associated with, not caused by**. `p-value` = *"How unusual a trend this large would be if there were no real trend."*
- **Never claim:** Zero forecasts/predictions; Coastal Peru DJF rainfall is **not** significant (`−0.36 mm/day`, CI `−0.91..+0.30`; do NOT claim wetter Peru); sub-periods show descriptive slopes only (no p-values).

## 4. Six Key Numbers to Quote Confidently

1. **2,534 input files → 11,055 JSON tiles (`239.0 MiB`)**: `64,800` 1° global cells × `5` seasons × `4` live UI metrics (`GPCP v3.3`, `MERRA-2 T2M`, `MERRA-2 AOD`, `GLDAS Noah v2.1` land-only `1,335` tiles).
2. **0.288 ms browser inference**: Client-side Sen's slope + CI + Hamed–Rao (3 lags) + Yue–Wang check matches **26/26** Python parity cases with zero backend.
3. **20 timelapse sets (`809` PNGs, `17.93 MiB < 25 MB`)**: `4` metrics × `5` seasons (`1991–2020` baseline; `2001–2020` for soil moisture).
4. **921 RONI seasons (`1950–2026`, `44` episodes) & `574+12` SST frames**: Peak RONI events `+2.40` (`1982–83`), `+2.28` (`1997–98`), `+2.25 °C` (`2015–16`); current `ASO 2026 RONI = +1.97 °C` (`El Niño`; RONI differs from ONI).
5. **6 detrended ENSO impact maps (`1.78 MiB`)**: Significant associations: Indonesia rainfall DJF `−1.10` (`−1.48..−0.72`), Indonesia haze SON `+0.28 AOD` (`+0.16..+0.41`), Alberta DJF `+1.51 °C` (`+0.37..+2.69`), Coastal Peru temp DJF `+1.04 °C` (`+0.66..+1.41`), E. Africa `+0.59`, CA `+0.52 mm/day`.
6. **GLDAS v2.0 overlap audit (`+0.469 kg/m²`)**: Withheld `804` v2.0 files (`2000–2014` RMSE `3.75 kg/m²`) to keep soil trends artifact-free. Verified: `5/5` data integrity, `180` Python tests, `30 files / 284` Vitest tests, `tsc` PASS.

## 5. Judge Q&A Quick Cards (20-Second Answers)

1. **No ENSO forecast?** Removed all forecasting so every number on screen is verifiable observation + detrended composite associations.
2. **Why exclude GLDAS v2.0 (`1948–2014`)?** Forcing switch adds a `+0.469 kg/m²` step jump (`3.75 kg/m²` RMSE); keeping pure `v2.1` (`2000–2026`) avoids fake splicing slopes.
3. **Why say `2/40` series Giovanni-compared?** Only `precip_coastal_peru_DJF` and `precip_indonesia_DJF` were directly checked against Giovanni exports; the other `38` say `"Same pipeline; not individually compared"`.
4. **Browser speed & accuracy?** `0.288 ms` mean on warmed 47-yr tiles; matches `26/26` Python parity cases within `1e-9` / `1e-6` rel tol.
5. **Prewhitening disagreement?** Shown openly in **Statistical tests → Show checks** as a caution flag rather than hiding borderline results.
6. **Sub-periods without p-values?** Prevents p-hacking on sliced noisy subsets; half-records show descriptive slopes only.
7. **Is soil moisture live?** Yes — `kg/m²`, `2001–2020` timelapse baseline, and `sm_DJF` ENSO map are all live in the 4-metric UI.
8. **Static hosting?** `12,592` static JSON/PNG/JS files (`297.9 MB` `dist`), zero runtime server, live at `https://trendtrace.earth-trend-detective-frontend.workers.dev`.

## 6. Deploy & Pre-Talk Backup Checklist

- **Cloudflare Workers deploy (Supervisor):** Wrangler now deploys static Pages sites as Workers via `frontend/wrangler.jsonc` → live at `https://trendtrace.earth-trend-detective-frontend.workers.dev` (`trendtrace.earth` custom domain coming).
- **Phone remote (`TrendTrace` window title):** Check live animations in PowerPoint desktop (`F5` on `deck/TrendTrace.pptx`); keep `deck/TrendTrace_safe.pptx` & `deck/TrendTrace.pdf` open as instant fallback.
