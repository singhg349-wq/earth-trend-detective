# Proposal: inference fields in the result contract

**Status: proposal only. `docs/CONTRACT.md` is unchanged; the lead edits it.**
Prepared by W3 after the user's inference decision of 14 November 2026.
The implementation is `backend/trend/stats.py:inference_block` and
`backend/trend/stats.py:trend_block`; the tests are in `tests/test_stats.py`.

The existing `trend` object keeps its four keys. The proposal only fills in the
`inference` object and freezes its semantics. No other part of the contract changes.

## Diff-style proposal for `docs/CONTRACT.md`

```diff
--- docs/CONTRACT.md   (current)
+++ docs/CONTRACT.md   (proposed)
@@ bullet list
 - `values[i]` is the seasonal value for `years[i]`. `coverage[i]` is the valid-area fraction (0–1).
-- `trend.inference.status` is `unavailable` until a validated method is selected.
+- `trend.inference` follows the inference decision of 14 November 2026: main test
+  Mann-Kendall with the Hamed-Rao variance correction at 3 lags, strict secondary
+  check Yue-Wang classic prewhitening, and the Sen slope interval always reported.
+- `trend.inference.status` is `ok` when the main test produced a finite p-value from
+  a positive variance with `n >= 8`, otherwise `unavailable`. A non-`ok` result must
+  not be shown as a significant trend.
+- `trend.inference.ci` is `[low, high]` of the Sen slope in value units per decade,
+  or `null` when the interval cannot be computed. It assumes independent years and
+  is labelled with `ci_note`.
+- `trend.inference.strict_check_pass` is `true` only when the classic prewhitening
+  p-value is also below `alpha` with the same direction of the Mann-Kendall
+  statistic; `false` when it is not; `null` when either p-value is undefined.
+- `trend.inference.caution` is `true` when the detrended lag-1 autocorrelation is
+  0.3 or more. It is a display warning, not a significance test.
+- Every inference field that is not a finite number is JSON `null`, never NaN.
 - `validation.status`: `fixture`, `pending`, `passed` or `failed`. The app labels every non-`passed` state.
 - `geometry_file` points to a GeoJSON FeatureCollection; feature `properties.id` matches `region.id`.
 - `template_summary` is plain text built only from the fields in the same file.
@@ example object
   "trend": {
-    "sen_slope_per_decade": null,
-    "intercept": null,
+    "sen_slope_per_decade": 0.1163,
+    "intercept": -13.8921,
     "method": "Sen",
     "inference": {
-      "status": "unavailable",
-      "p_value": null,
-      "ci": null,
-      "method": null
+      "status": "ok",
+      "p_value": 0.1654,
+      "ci": [-0.0487, 0.2768],
+      "method": "MK + Hamed-Rao (3 lags)",
+      "strict_check_pass": false,
+      "strict_check_p": 0.0857,
+      "lag1": 0.0054,
+      "caution": false,
+      "ci_note": "95% slope interval assumes independent years; narrower than true uncertainty when years correlate",
+      "n": 42
     }
   },
```

The numbers in that diff are only an illustration copied from a real result (see the
filled example below). They are not a required value.

## Field specification

| Field | Type | Rule |
|---|---|---|
| `status` | string | `ok` or `unavailable`. Exactly as defined below. |
| `p_value` | number or null | Two-sided p-value of Mann-Kendall with the Hamed-Rao variance correction at `max_lag=3`. `null` when unavailable. |
| `ci` | array or null | `[low, high]`, Sen slope per decade, value units. `null` only when `n < 8`. The interval is not autocorrelation-adjusted. |
| `method` | string | Fixed `MK + Hamed-Rao (3 lags)`. Present even when `status` is `unavailable`, because it names the method that was attempted. |
| `strict_check_pass` | boolean or null | `true` when `strict_check_p < alpha` **and** the classic prewhitening Mann-Kendall statistic has the same sign as the main statistic. `false` otherwise. `null` when either p-value is null. |
| `strict_check_p` | number or null | Two-sided p-value of Yue-Wang classic prewhitening (`trend_preserving=False`). `null` when it cannot be computed. |
| `lag1` | number or null | Lag-1 autocorrelation of the series after removing the Sen trend using the actual years. `null` when `n < 8`. |
| `caution` | boolean | `lag1 >= 0.3`. `false` when `lag1` is `null`. Negative persistence does not raise it; the display text is about linked consecutive seasons. |
| `ci_note` | string | Fixed sentence: `95% slope interval assumes independent years; narrower than true uncertainty when years correlate` |
| `n` | integer | Valid `(year, value)` pairs used by the main test. Pairs with a NaN or a missing year are dropped, never filled. |

`alpha` is 0.05 in the product path. It changes `p_value`, `strict_check_pass` and the
interval width, but none of the fixed labels.

### `unavailable` rule

`status` is `unavailable` when any of these holds:

1. fewer than 8 valid pairs (`n < 8`);
2. the Hamed-Rao corrected variance is not positive;
3. the resulting p-value is NaN.

In those cases `p_value` is `null` and the result is not presented as a significant
trend. `ci` may still be present (a constant series gives `[0.0, 0.0]`) because the
slope interval does not depend on the p-value. `strict_check_p` is reported when the
secondary test can be computed even if the main test cannot; `strict_check_pass` is
`null` in that case because there is no main direction to compare with.

## Filled example

This is the real Indonesia polygon artifact's series (42 DJF values, 1984-2025,
mm/day) passed through `trend_block`. Values are rounded here for readability; the
builder writes full precision.

```json
"trend": {
  "sen_slope_per_decade": 0.1163,
  "intercept": -13.892144,
  "method": "Sen",
  "inference": {
    "status": "ok",
    "p_value": 0.165385,
    "ci": [-0.048669, 0.276796],
    "method": "MK + Hamed-Rao (3 lags)",
    "strict_check_pass": false,
    "strict_check_p": 0.085708,
    "lag1": 0.005411,
    "caution": false,
    "ci_note": "95% slope interval assumes independent years; narrower than true uncertainty when years correlate",
    "n": 42
  }
}
```

Reading this example: the Sen slope is +0.116 mm/day per decade but the 95% interval
runs from -0.049 to +0.277, so it includes no change. The main p-value is 0.165 and
the strict check does not pass. Year-to-year persistence is negligible (lag-1 = 0.005),
so no caution badge appears. Under the no-trend model and test assumptions, a result
at least this extreme has probability 0.165; the data do not give strong evidence
against that model, which is not the same as proving that no trend exists.

## Notes for the lead

* The contract currently says `status` is `unavailable` until a method is selected.
  That sentence must change; otherwise the app's "inference unavailable" banner would
  fire for every real result.
* `trend.sen_slope_per_decade` and `trend.intercept` become non-null whenever
  `n >= 8`, because `trend_block` fills them. A builder that does not use
  `trend_block` should call `sen_slope_per_decade` and `sen_slope`.
* `trend.method` stays the fixed string `Sen`. It describes the slope estimator;
  `trend.inference.method` describes the test.
* App copy should use the safe wording in `docs/CONTRACT_INFERENCE_PROPOSAL.md` and
  the decision note, never "proves" or "chance this is luck". Suggested short labels:
  `p = 0.165 (MK + Hamed-Rao, 3 lags)`, `passes strict check: no`,
  `lag-1 = 0.005`, and the `ci_note` verbatim under the interval.
* The map FDR rule is separate from the per-result fields: apply
  `fdr_bh(p_values, q=0.10)` across valid cells, hatch only the passes, and keep the
  spatial-clustering caveat.
* No new dependency is needed. `fdr_bh` is implemented with numpy.
