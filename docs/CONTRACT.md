# Regional series contract

Each result is one JSON file: `data/artifacts/<variable>_<region>_<season>.json`.
Examples with fake values: `data/fixtures/`. Only the lead changes this contract.

- `values[i]` is the seasonal value for `years[i]`. `coverage[i]` is the valid-area fraction (0–1).
- `trend.inference` follows the inference decision of 14 November 2026: main test Mann-Kendall with the Hamed-Rao variance correction at 3 lags, strict secondary check Yue-Wang classic prewhitening, and the Sen slope interval always reported. See `docs/CONTRACT_INFERENCE_PROPOSAL.md` for the field table and a filled example.
- `trend.inference.status` is `ok` when the main test gave a finite p-value from a positive variance with `n >= 8`, otherwise `unavailable`. A non-`ok` result must not be shown as a significant trend.
- `trend.inference.ci` is `[low, high]` of the Sen slope in value units per decade, or `null` when it cannot be computed. It assumes independent years (see `ci_note`).
- `trend.inference.strict_check_pass` is `true` only when the classic prewhitening p-value is also below alpha with the same direction; `false` when not; `null` when either p-value is undefined.
- `trend.inference.caution` is `true` when the detrended lag-1 autocorrelation is 0.3 or more. It is a display warning, not a test.
- Every inference field that is not a finite number is JSON `null`, never NaN.
- `validation.status`: `fixture`, `pending`, `passed` or `failed`. The app labels every non-`passed` state.
- `geometry_file` points to a GeoJSON FeatureCollection; feature `properties.id` matches `region.id`.
- `template_summary` is plain text built only from the fields in the same file.
