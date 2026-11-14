# Predeclared ENSO–rainfall association design

**Status:** Design frozen before computing or inspecting any rainfall–ENSO association. No correlation, fitted association, or relationship result has been calculated for this design.

## Question and target

For each region separately, estimate the association between CPC Oceanic Niño Index (ONI) and the day-weighted DJF rainfall-rate series for Indonesia and coastal Peru. The rainfall target is the regional seasonal mean rate in mm/day, with DJF seasons labeled by January year, for 1984–2025. This is a common calendar-season comparison; it does not assert that DJF has the same local climate meaning in both places.

Use the saved `oni.data` as recommended in `ENSO_SOURCE.md`, not the unresolved monthly `nina34.anom.data`. ONI is a three-month running mean with overlapping windows, reported in degrees Celsius anomaly. This association describes co-variation; it does not establish that ENSO caused a rainfall change.

## Time alignment, season, and lag

The primary ENSO predictor is ONI for the DJF season centered on January of the rainfall January-year label: average the three ONI entries labeled December of the prior year, January, and February of the label year. Thus rainfall DJF 1984 is paired with ONI centered on January 1984, using ONI labels Dec 1983–Feb 1984. This is the predeclared contemporaneous DJF alignment; it captures the seasonal peak convention that DJF ENSO is commonly represented by the NDJ/DJF peak period, without searching across lags.

No lag search will be performed. A one-season lead or lag may be reported only as a clearly labeled secondary sensitivity if later authorized, never selected as the primary result based on its observed strength.

## Preprocessing

For each region, retain the rainfall values and matched ONI season only where all three rainfall months are present and valid and all three required ONI entries are present and not a missing sentinel. Use the same matched years for both variables in that region. Do not interpolate or fill missing values.

Remove a separate ordinary least-squares straight-line time trend from each series over the matched years, then calculate the primary association between the two residual series. Detrending both rainfall and ONI makes the primary question about year-to-year co-variation after removing linear long-term change in each; it does not remove all slow climate variability. Also retain and report the raw-series association as a labeled descriptive sensitivity so the effect of detrending is visible. Do not change the detrending rule after seeing results.

## Association and dependence-aware uncertainty

The primary effect size is Spearman's rank correlation between the paired, linearly detrended rainfall and ONI series. It summarizes whether higher ENSO conditions tend to coincide with higher or lower rainfall, without requiring a straight-line relationship. Report the estimate and a two-sided 95% uncertainty interval from a moving-block bootstrap of the paired annual residuals, using fixed contiguous blocks of 3 years, circular wraparound, and 10,000 resamples. Resampling pairs in blocks retains short-range serial structure and the same-year pairing better than treating years as independent; the interval is approximate, especially with only about four decades of data.

Do not use the ordinary Pearson correlation p-value or an independent-year bootstrap. For a dependence-aware null check, use a circular-shift test on the detrended ONI residual sequence relative to the detrended rainfall residual sequence: evaluate every non-zero circular offset, recompute Spearman correlation, and calculate a two-sided randomization p-value as `(1 + number of offsets with |r| >= |observed r|) / (1 + number of tested offsets)`. This preserves each series' ordering and autocorrelation while breaking their observed alignment, but assumes the residual sequences are sufficiently stationary and can miss dependencies tied to nonstationary regimes. Label this assumption and the coarse resolution of the p-value. If fewer than 20 matched years remain, do not report the test or interval as reliable; show the estimate as exploratory with the actual matched count and explain the limitation.

Report matched year count, actual first and last matched years, association estimate, bootstrap interval, null-check p-value when eligible, and preprocessing/alignment in plain language. Do not translate a p-value into proof, causation, or a claim that there is “no relationship.” Report the observed sign and magnitude whether or not it matches the hypothesis.

## Missing data and eligibility

Treat ONI missing codes (including `-99.9`) as missing; never as numeric values. Require complete DJF rainfall months and all three ONI center-season months. Do not bridge missing years for block construction or silently shorten the stated 1984–2025 target. Any excluded seasons and their reason must be listed. If the matched span or count differs by region, report it separately. If fewer than 20 matched annual pairs remain, label inference unavailable/exploratory under this design.

## Expected signs, declared before results

- Indonesia: expect El Niño conditions (higher ONI) to be associated with lower DJF rainfall; expected association sign is negative.
- Coastal Peru: expect higher ONI, particularly strong El Niño conditions, to be associated with higher DJF rainfall; expected sign is positive. This is a cautious hypothesis for the project's specific coastal region, not a guaranteed local effect.

These are hypotheses only. Report the observed sign and estimate even if either is opposite to expectation, and do not revise the hypotheses after looking at results.

## External reference check

A user can independently check the broad association in KNMI Climate Explorer: select the same exact CPC ONI index/definition and the same GPCP rainfall field, restrict the rainfall field to the project's Indonesia or coastal Peru geometry and DJF 1984–2025, and request the field/index correlation for the matched DJF season. Record the selected index version, dataset/version, spatial selection, seasonal labels, missing-data overlap, and any detrending setting. KNMI's output is a reference comparison, not guaranteed to use the same masks, weighting, detrending, or dependence-aware uncertainty method. Compare estimates only after those settings and support are documented; do not treat agreement as independent validation of causation or uncertainty calibration.
