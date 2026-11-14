# Regional series contract

Each result is one JSON file: `data/artifacts/<variable>_<region>_<season>.json`.
Examples with fake values: `data/fixtures/`. Only the lead changes this contract.

- `values[i]` is the seasonal value for `years[i]`. `coverage[i]` is the valid-area fraction (0–1).
- `trend.inference.status` is `unavailable` until a validated method is selected.
- `validation.status`: `fixture`, `pending`, `passed` or `failed`. The app labels every non-`passed` state.
- `geometry_file` points to a GeoJSON FeatureCollection; feature `properties.id` matches `region.id`.
- `template_summary` is plain text built only from the fields in the same file.
