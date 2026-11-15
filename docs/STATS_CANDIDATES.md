# Trend estimator candidates and the chosen inference path

**Status: the user chose the product path on 14 November 2026.** The main test is
Mann-Kendall with the Hamed-Rao variance correction limited to three lags; the strict
secondary check is Yue-Wang classic prewhitening (`trend_preserving=False`). The Sen
slope and its interval are always reported. All-lag Hamed-Rao and trend-preserving
prewhitening are dropped from the product path but stay in the candidates table below
so the measurements behind the decision can still be checked.

`backend/trend/stats.py` also exposes `inference_block`, `trend_block` and `fdr_bh`,
which implement that decision. The candidates share one input path, so the measured
comparison is reproducible rather than a rewrite.

## What is implemented

| Function | Returns | Purpose |
|---|---|---|
| `sen_slope(years, values)` | `(slope per year, intercept)` | Robust slope: median of all pairwise slopes, intercept `median(y) - slope * median(years)` |
| `sen_slope_per_decade(years, values)` | slope per decade | The same slope times ten, for the result files |
| `sen_slope_ci(years, values, alpha)` | `low`, `high`, `slope`, `n`, `n_pairs` | Rank-based (order-statistic) confidence interval for the slope |
| `mann_kendall(years, values, alpha)` | `s`, `var_s`, `z`, `p`, `n` | Plain Mann-Kendall test with tie correction |
| `mann_kendall_hamed_rao(years, values, alpha, max_lag)` | the same fields plus `var_inflation` | Hamed-Rao autocorrelation variance correction |
| `mann_kendall_yue_wang(years, values, alpha, trend_preserving)` | the same fields plus `rho1` | Prewhitening test; trend-preserving (TFPW) by default, classic prewhitening with `trend_preserving=False` |
| `inference_block(years, values, alpha)` | the `trend.inference` dict | Product path: 3-lag Hamed-Rao p-value, classic prewhitening strict check, Sen interval, detrended lag-1, caution flag |
| `trend_block(years, values, alpha)` | the `trend` dict | Sen slope per decade, intercept and the inference block |
| `fdr_bh(pvalues, q)` | boolean mask | Benjamini-Hochberg step-up for the map; NaN entries are ignored and return False |

Input handling is common to all of them: pairs with a NaN in either array are dropped
and counted in `n_dropped`; fewer than 8 valid pairs returns NaN for every statistic
instead of raising; years must be unique and a repeated year raises `ValueError`.
Only numpy and scipy are imported by `stats.py` itself.

## Product path (decided 14 November 2026)

`inference_block` writes exactly these fields, ready for the result JSON:

| Field | Meaning |
|---|---|
| `status` | `ok` when the main test gave a finite p-value from a positive variance with `n >= 8`; otherwise `unavailable` |
| `p_value` | Two-sided p-value of Mann-Kendall with the 3-lag Hamed-Rao variance correction, or `null` |
| `ci` | `[low, high]` Sen slope interval per decade, or `null` when shorter than 8 valid pairs |
| `method` | Fixed text `MK + Hamed-Rao (3 lags)` |
| `strict_check_pass` | `true` when the classic prewhitening test also gives `p < alpha` with the same direction of the Mann-Kendall statistic, `false` when it does not, `null` when either p-value is undefined |
| `strict_check_p` | Two-sided p-value of the classic prewhitening test, or `null` |
| `lag1` | Lag-1 autocorrelation after removing the Sen trend, or `null` |
| `caution` | `true` when `lag1 >= 0.3`; `false` when `lag1` is `null` or below the threshold |
| `ci_note` | `95% slope interval assumes independent years; narrower than true uncertainty when years correlate` |
| `n` | Number of valid year-value pairs used by the main test |

Numbers that cannot be computed are written as JSON `null`, never as NaN.
`trend_block` adds `sen_slope_per_decade`, `intercept` and `method: "Sen"` around the
same inference block.

The interval is always shown, with the note above, even when the p-value is
significant. The caution threshold is a display warning, not a test: it says the
42 years carry less independent information than 42 unrelated values. For the map,
every valid cell is coloured by the Sen slope and only cells that pass
`fdr_bh(..., q=0.10)` are hatched; the note on spatial clustering still applies
because neighbouring cells are not independent.

`status` is `unavailable` when the p-value is NaN, the corrected variance is not
positive, or `n < 8`. A `null` strict check is not an `unavailable` main result: the
main test can stand on its own while the secondary check cannot be evaluated.

## Simulation setup

* Synthetic stationary AR(1) series, `x_t = phi * x_(t-1) + eps_t` with
  `eps ~ N(0, 1 - phi^2)`, so the marginal variance is 1 and the first value is drawn
  from the stationary distribution. `phi` is the only dependence parameter.
* `n = 42`, the number of DJF seasons in 1984-2025 (one value per January year).
* 2000 replicates per cell, `alpha = 0.05`, two-sided tests.
* Null scenario: `phi` in {0.0, 0.3, 0.6}, no trend. The measured rate is the share of
  replicates with `p < 0.05`, i.e. a false positive.
* Alternative scenario: the same AR(1) plus a linear trend of `0.02` standard deviations
  per year, which is 0.84 sd across the 42-year record. The measured rate is power.
* Fixed seed base 20261114; the replicate seed for a cell depends only on `phi` and the
  scenario, so any cell can be reproduced alone. Re-running gives the same numbers.

Monte Carlo standard error is about 0.005 at a rate of 0.05 and about 0.010 at a rate
of 0.3, so differences below roughly 0.01-0.02 in the table are noise.

## Measured false-positive rate and power

| Method | phi | False-positive rate (no trend) | Power (0.02 sd/yr trend) |
|---|---|---|---|
| Mann-Kendall (plain) | 0.0 | 0.045 | 0.298 |
| Mann-Kendall (plain) | 0.3 | 0.138 | 0.360 |
| Mann-Kendall (plain) | 0.6 | 0.309 | 0.429 |
| Mann-Kendall + Hamed-Rao (all lags) | 0.0 | 0.087 | 0.352 |
| Mann-Kendall + Hamed-Rao (all lags) | 0.3 | 0.167 | 0.363 |
| Mann-Kendall + Hamed-Rao (all lags) | 0.6 | 0.225 | 0.329 |
| Mann-Kendall + Hamed-Rao (max_lag=3) | 0.0 | 0.066 | 0.332 |
| Mann-Kendall + Hamed-Rao (max_lag=3) | 0.3 | 0.139 | 0.326 |
| Mann-Kendall + Hamed-Rao (max_lag=3) | 0.6 | 0.166 | 0.268 |
| Mann-Kendall + Yue-Wang TFPW | 0.0 | 0.049 | 0.293 |
| Mann-Kendall + Yue-Wang TFPW | 0.3 | 0.158 | 0.375 |
| Mann-Kendall + Yue-Wang TFPW | 0.6 | 0.387 | 0.503 |
| Mann-Kendall + Yue-Wang classic PW | 0.0 | 0.043 | 0.244 |
| Mann-Kendall + Yue-Wang classic PW | 0.3 | 0.059 | 0.150 |
| Mann-Kendall + Yue-Wang classic PW | 0.6 | 0.052 | 0.087 |

These are real outputs of `python tests/sim_stats.py` (see reproduce section).
The table keeps the two dropped variants on purpose: they are the evidence for the
decision, not part of the product path.

## The three real series through the product path

The same three DJF series used for the outside-code comparison, with the chosen
inference path. Values are mm/day; the interval and slope are per decade. Produced by
`python tests/sim_stats.py --real` from the frozen copy in
`tests/real_series_fixture.py`.

| Series | n | Sen slope per decade | 95% slope interval (per decade) | p (3-lag Hamed-Rao) | strict p (classic PW) | strict passes | detrended lag-1 | caution |
|---|---|---|---|---|---|---|---|---|
| indonesia_polygon | 42 | 0.1163 | [-0.049, 0.277] | 0.1654 | 0.0857 | False | 0.005 | False |
| coastal_peru_polygon | 42 | -0.0982 | [-0.329, 0.162] | 0.5016 | 0.6452 | False | 0.136 | False |
| indonesia_box_equal_month | 42 | 0.1904 | [-0.080, 0.461] | 0.1526 | 0.0607 | False | -0.109 | False |

Read the table as arithmetic on these series, not as a physical conclusion. None of
the three main tests reaches 0.05, the intervals include zero, and no series triggers
the persistence caution. The Indonesia polygon and box series are two masks over the
same region, which is why their numbers are close but not identical. The strict check
does not confirm any of them because none of the main tests is significant to begin
with.

## What the numbers show

Read these as measurements under the stated model, not as a recommendation.

* Plain Mann-Kendall is calibrated when the series is independent (0.045) and
  over-rejects increasingly as persistence grows (0.138 at `phi = 0.3`, 0.309 at
  `phi = 0.6`). Its power figures are inflated by the same over-rejection, so they are
  not comparable at face value with the power of a better-calibrated test.
* Hamed-Rao moves the rate down but never reaches 0.05: 0.225 at `phi = 0.6` with all
  lags, 0.166 with `max_lag = 3`. It is also above nominal when there is no
  autocorrelation at all (0.087, or 0.066 with three lags). The likely reason is that
  the test keeps only lags whose estimated autocorrelation exceeds a significance
  band; with no real dependence a spurious negative lag occasionally enters the sum,
  shrinks the corrected variance and makes the test anti-conservative. With all lags,
  10 to 23 of the 2000 null replicates per dependence level (0.5-1.2%) ended with a
  non-positive corrected variance; with three lags it was 3 to 9. There `p` is NaN and
  the replicate is counted as not significant. A number computed from a non-positive
  variance would be meaningless, so the NaN is the honest outcome.
* Yue-Wang trend-preserving prewhitening is the one result that may surprise a reader:
  at `phi = 0.6` its false-positive rate (0.387) is *worse* than plain Mann-Kendall.
  The mechanism is visible in the algorithm. The test removes a Sen trend, whitens the
  residuals, then puts the *estimated* trend back before testing. For persistent noise
  the estimated trend is large compared with the whitened residuals: at `phi = 0.6`
  the re-added trend spans 0.83 whitened standard deviations at the median (0.51 at
  `phi = 0.3`), so the re-trended series looks monotone even when the generating
  process has no trend. `python tests/sim_stats.py --verify` prints those ratios. This
  is a property of the procedure, not a porting error: the same command reproduces the
  same rate with pymannkendall's own function.
* Classic prewhitening is the only variant that stays near 0.05 at every `phi`
  (0.043-0.059), but its power collapses as persistence rises (0.087 at `phi = 0.6`)
  because estimating the lag-1 coefficient from the trending series removes part of
  the trend itself. That trade-off is why it is the strict *secondary* check and not
  the main test: passing it is meaningful, while failing it is expected when the
  trend is weak. It is never the only test shown.
* Power is reported for one trend size. A different trend size would move every power
  entry, and the prewhitening variants are the ones most likely to reorder, because
  their power depends on how much of the trend survives whitening. The single
  0.02 sd/yr value is a modelling choice, not a property of the data.

## Assumptions, in plain terms

| Method | Assumes | Does not handle |
|---|---|---|
| Sen slope | Monotonic, roughly linear change; errors from any distribution; outliers are tolerated because the median of pairwise slopes is used | Abrupt breaks, non-monotonic change, or a slope that varies over the record |
| Sen slope CI | Observations independent or weakly dependent, symmetric distribution of pairwise slopes, normal approximation to `S` | Serial correlation: with persistent series the interval is too narrow |
| Mann-Kendall | Independent observations under the null; ties handled by the variance correction | Any autocorrelation, which inflates the false-positive rate |
| Hamed-Rao | Dependence is captured by the autocorrelation of the detrended ranks at the lags that pass the significance band | Dependence at lags that fail the band, or structure that is not serial correlation; can produce a non-positive variance |
| Yue-Wang TFPW | First-order autoregressive dependence; lag-1 coefficient summarises it; the trend estimate is good enough to remove and restore | Higher-order dependence, and the effect described above at strong persistence |
| Yue-Wang classic PW | The same AR(1) assumption, with the trend deliberately not restored | Real trends, which it partly removes |

Two practical points:

* `rho1` is not clipped at zero in either prewhitening variant, so a negative estimate
  reverses the whitening adjustment instead of being ignored. That matches the common
  implementation used here; some published variants clip the coefficient at zero, which
  would matter for a negatively autocorrelated series and is worth a decision during
  review.
* The Sen slope itself is unaffected by the choice of inference test. Changing the
  test changes the p-value and interval, not the reported slope.

## Verification against outside code

`tests/test_stats.py` compares every implemented statistic with another implementation,
on six different 42-value series: three synthetic (one trending, one flat, one with
rounded ties) and three real DJF series frozen in `tests/real_series_fixture.py`
(Indonesia polygon, coastal Peru polygon, Indonesia box). The artifact files are not
read by the tests.

* `sen_slope` against `pymannkendall.sens_slope`, slope and intercept (the intercept is
  converted from unit index steps to year units first).
* `mann_kendall` against `pymannkendall.original_test`.
* `mann_kendall_hamed_rao` against `pymannkendall.hamed_rao_modification_test`, both
  with every lag and with `lag=3` (the product main test).
* `mann_kendall_yue_wang` against `pymannkendall.trend_free_pre_whitening_modification_test`
  and, with `trend_preserving=False`, `pymannkendall.pre_whitening_modification_test`.
* `sen_slope_ci` against `scipy.stats.theilslopes` at `alpha = 0.05` and `0.10`.

All fields (`s`, `var_s`, `z`, `p`, and the interval bounds) agree to 1e-10 relative.
The same tests also check that `inference_block` is built from exactly those pieces,
that it round-trips through JSON without NaN, and that the unavailable states
(`n < 8`, constant series, negative corrected variance, NaN gaps) return `null`
instead of a number.

The whole simulation, not just single series, was also run through pymannkendall:

| Method | phi | This module | pymannkendall |
|---|---|---|---|
| Mann-Kendall (plain) | 0.0 / 0.3 / 0.6 | 0.045 / 0.138 / 0.309 | 0.045 / 0.138 / 0.309 |
| Mann-Kendall + Hamed-Rao (all lags) | 0.0 / 0.3 / 0.6 | 0.087 / 0.167 / 0.225 | 0.086 / 0.167 / 0.226 |
| Mann-Kendall + Hamed-Rao (max_lag=3) | 0.0 / 0.3 / 0.6 | 0.066 / 0.139 / 0.166 | 0.066 / 0.139 / 0.166 |
| Mann-Kendall + Yue-Wang TFPW | 0.0 / 0.3 / 0.6 | 0.049 / 0.158 / 0.387 | 0.049 / 0.158 / 0.387 |
| Mann-Kendall + Yue-Wang classic PW | 0.0 / 0.3 / 0.6 | 0.043 / 0.059 / 0.052 | 0.043 / 0.059 / 0.052 |

The 0.001 differences are one or two replicates out of 2000 where the detrended series
contains a floating-point tie: the two copies subtract a slightly different but
equivalent affine trend, so the rank tie-breaking can differ and the Hamed-Rao
autocorrelation sum moves a little. They are not a disagreement about the method.

## Limitations of this study

* AR(1) is a crude stand-in for DJF rainfall. Real regional series can carry
  ENSO-driven multi-year structure, negative lag-1 correlation, or a few very wet
  seasons. The three frozen real series have detrended lag-1 correlations of 0.005
  (Indonesia polygon), 0.136 (coastal Peru polygon) and -0.109 (Indonesia box), so
  they sit closest to the `phi = 0` row, with coastal Peru nearest `phi = 0.3`. One
  estimate from 42 values is itself uncertain, and the three series are not
  independent of each other.
* Power is reported for one trend size (0.02 sd/yr). Power depends on the trend, the
  record length and the persistence, so the ranking can change at other trend sizes.
* Missing years are not simulated. NaN handling is tested separately, but no
  false-positive rate is claimed for gappy series.
* The Monte Carlo uses one series per replicate. Real regional averages are spatial
  means, whose noise can be smaller and smoother than a unit-variance AR(1).
* These rates say how the tests behave under the assumed model. They say nothing about
  which physical process drove a particular observed slope.

## Reproduce

```
python -m pytest tests/test_stats.py -q     # agreement and guard tests, a few seconds
python tests/sim_stats.py --real            # the real-series table above, a second
python tests/sim_stats.py                   # the simulation table, about 40 s
python tests/sim_stats.py --verify          # plus the pymannkendall cross-check, about 70 s
```

`pymannkendall` is already listed in `requirements.txt`; the tests import it, but
`backend/trend/stats.py` does not.
