# ENSO and DJF rainfall: results

We compared day-weighted DJF rainfall from the existing GPCP 0.5° box-mask artifacts with CPC ONI. For each January-year season from 1984–2025, the predictor is the January ONI value, which already averages December–February. Both series were detrended separately with Sen's slope, then compared with Spearman rank correlation. This answers **“do year-to-year swings line up?”**, not **“does ENSO explain the long-term trend?”**

Both regions have all 42 paired years (1984–2025); no years were excluded. Each estimate has an approximate effective-sample-size p-value and a 95% interval from 10,000 paired circular 3-year block resamples using seed `20261114`, with tiny random tie-breaking jitter. The interval is approximate for a 42-year record. The effective-sample-size method uses `N_eff = n(1-r₁x r₁y)/(1+r₁x r₁y)`, clamped to `[3,n]`, and a two-sided t approximation with `df=N_eff-2`; it uses only lag-1 memory and is not an exact rank-correlation test.

| Region | Detrended Spearman rs | N_eff | Approx. p | 95% block-bootstrap interval | Observed sign |
|---|---:|---:|---:|---:|---|
| Indonesia | -0.229 | 42.0 | 0.144 | [-0.466, 0.041] | Negative, matching expected direction |
| Coastal Peru | -0.220 | 42.0 | 0.161 | [-0.552, 0.136] | Negative, opposite to expected direction |

Across 1984–2025 (`n = 42`), the overall rank correlation between detrended DJF rainfall in Indonesia and ONI is weak and uncertain (`rs = -0.229`, 95% interval `[-0.466, 0.041]`, approximate `p = 0.144`). For coastal Peru it is also weak and uncertain (`rs = -0.220`, 95% interval `[-0.552, 0.136]`, approximate `p = 0.161`). A weak overall rank correlation does not rule out an ENSO effect, especially where rainfall can spike in only a few strong coastal El Niño events. The observed coastal Peru sign is negative despite the predeclared positive expectation.

## Predeclared El Niño rainfall comparison

Means below use the day-weighted rainfall artifact values. “Other” includes valid years below the stated January ONI threshold. Counts are shown explicitly; these are descriptive comparisons.

| Region | January ONI threshold | El Niño mean DJF rainfall (mm/day) | El Niño years | Other mean DJF rainfall (mm/day) | Other years |
|---|---:|---:|---:|---:|---:|
| Indonesia | ≥ +0.5 °C | 9.405 | 14 | 9.553 | 28 |
| Indonesia | ≥ +1.0 °C | 9.079 | 6 | 9.574 | 36 |
| Coastal Peru | ≥ +0.5 °C | 4.520 | 14 | 4.768 | 28 |
| Coastal Peru | ≥ +1.0 °C | 4.648 | 6 | 4.691 | 36 |

The descriptive means also show lower average rainfall in the El Niño groups for both regions at these thresholds. These comparisons and correlations describe year-to-year co-variation; they do not attribute the long-term rainfall trend to ENSO.

## Interpretation limits

ONI represents Niño 3.4 in the central Pacific. A weak association does not rule out local coastal ocean effects, especially near Peru. These results do not explain the long-term rainfall trend. See the machine-readable region details in `data/artifacts/enso_indonesia_DJF.json` and `data/artifacts/enso_peru_DJF.json`.
