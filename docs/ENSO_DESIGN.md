# Predeclared ENSO–rainfall association design

**Status:** Frozen before calculating any rainfall–ENSO association. The thresholds, preprocessing, and reporting rules below will not be changed after results are seen.

## Question and target

For Indonesia and coastal Peru, estimate whether year-to-year changes in DJF rainfall tend to move with the Oceanic Niño Index (ONI). Rainfall is the **day-weighted DJF mean rate (mm/day)** for January-year seasons 1984–2025 from the existing `backend.trend` artifacts: the GPCP 0.5-degree box-mask products in `data/artifacts/precip_indonesia_DJF.json` and `data/artifacts/precip_peru_DJF.json`. Use the `values` and `years` in those artifacts; do not recompute rainfall from grids or substitute the polygon masks.

Use CPC ONI, a three-month running mean of Niño 3.4 sea-surface temperature anomalies. Pair each DJF rainfall season labeled year Y with the **single January ONI value for Y**. That value already represents December–February; do not average multiple ONI entries. No lead, lag, or lag search will be analyzed.

The expected signs, declared before calculation, are negative for Indonesia (drier in El Niño) and positive for coastal Peru (wetter in strong El Niño). Report the observed sign and estimate even if unexpected. These are expectations, not guaranteed outcomes.

## Preprocessing and primary association

For each region, pair by year over 1984–2025 and keep only years with a valid rainfall artifact value and valid January ONI. Treat ONI missing sentinels, including `-99.9` and `-99.90`, as missing. Never interpolate or fill. List excluded years and reasons. The target span remains 1984–2025 even if some pairs are unavailable.

Detrend **both** matched series using Sen's slope from `backend.trend.stats`: subtract the fitted Sen trend from each series, then calculate Spearman rank correlation (`rs`) between the two residual series. The trend is fitted against calendar year. This detrended correlation answers **“do year-to-year swings line up?”**, NOT **“does ENSO explain the long-term trend?”** It does not remove every slow climate fluctuation.

## Dependence and uncertainty

Report the effective sample size and a two-sided p-value using the lag-1 autocorrelation of each detrended series. With n matched years and lag-1 autocorrelations r₁x and r₁y, use:

`N_eff = n * (1 - r₁x * r₁y) / (1 + r₁x * r₁y)`

Clamp `N_eff` to `[3, n]`. For the p-value, use the usual correlation t approximation with `df = N_eff - 2`: `t = rs * sqrt(df / (1 - rs²))`, two-sided Student-t tail probability. State that this is an approximate correction: it uses only lag 1, assumes the residual dependence is reasonably represented by each series' lag-1 autocorrelation, and the t approximation is not exact for rank correlation or short records. It does not establish causation.

Also report a two-sided 95% moving-block bootstrap interval from 10,000 resamples of paired detrended yearly values, using contiguous circular blocks of 3 years and fixed seed `20261114`. Do not bridge missing calendar years when forming blocks: if the matched years are not contiguous, use the longest contiguous run and report the omitted years and resulting n; if no run has at least 20 years, label the interval exploratory/unavailable. To handle duplicate sampled years, add independent tiny random jitter (seeded, scale 1e-10 times each series' nonzero standard deviation) before ranking each bootstrap sample. The interval is approximate with only 42 target seasons and reflects this block and tie-breaking scheme.

## Predeclared El Niño rainfall comparison

For each region, report a table of mean day-weighted DJF rainfall in El Niño years versus all other valid years, plus the count in each group. Define the primary El Niño group as January ONI **≥ +0.5 °C**; this is the fixed threshold selected before results. Add a second descriptive row using the stricter **≥ +1.0 °C** threshold. “Other” means valid years below the applicable threshold. These are descriptive group means, not a separate causal test.

## Reporting and eligibility

Report for each region: matched n and years, excluded years and reasons, `rs`, both lag-1 autocorrelations, `N_eff`, approximate two-sided p-value, block-bootstrap interval and settings, and both threshold comparison rows with counts. If fewer than 20 matched years remain, label inference exploratory and explain the limitation. Report signs regardless of whether they match expectations.

Use only the safe wording templates in `docs/ENSO_CRITIQUE.md` (method; clear association; weak/uncertain association; trend versus year-to-year). Avoid causal or confirmatory language. Do not display ENSO in the app until independent validation is complete.

## Independent reference check

Document exact numbered steps for a user to reproduce a correlation in KNMI Climate Explorer (`climexp.knmi.nl`): select CPC ONI / Niño 3.4 as available; upload or paste the 42-year rainfall series; select DJF and the same years; specify detrending; and state what statistic to compare. KNMI may use Pearson correlation and OLS detrending, so compare against our separately calculated Pearson/OLS matched-setting number rather than the primary Sen-detrended Spearman result. Record limitations; the reference comparison does not validate causality or uncertainty calibration.
