# T2M: 2 m air temperature (MERRA-2)

Status: data built. Validation is **pending**; see
`docs/VALIDATION_T2M.md`. The app must not present this variable as ready.

This note covers the temperature variable only. The rainfall contract and the
1 degree grid format are in `docs/CONTRACT.md` and `docs/GRID_FORMAT.md`.

## 1. Product and identifier

| Item | Value |
|---|---|
| Product | MERRA-2 `tavgM_2d_slv_Nx` (`M2TMNXSLV`), version 5.12.4 |
| DOI | 10.5067/AP1B0BA5PD2K |
| Variable | `T2M`, `long_name` = `2-meter_air_temperature` |
| Not used | `TS` (surface skin temperature), present in the same files |
| Archive | `D:\trend-detective-data\raw\M2TMNXSLV_5.12.4` (read only, not committed) |
| Record | 1980-01 to 2026-09, 561 monthly files, no missing months |
| File naming | `MERRA2_<stream>.tavgM_2d_slv_Nx.YYYYMM.nc4`, streams 100 to 400 |
| Native grid | 361 latitudes from -90 to 90 at 0.5 degree; 576 longitudes from -180 to 179.375 at 0.625 degree |

The archive description in `_PRODUCT.md` reports 561 of 561 files and a verified
status. File names do not carry a single stream prefix, so the reader discovers
the prefix instead of guessing it.

## 2. Units check and Kelvin to Celsius conversion

The `units` attribute on `T2M` was read from the files: it is `K`. The reader
raises `ValueError` for any other unit rather than guessing, so a product switch
or a pre-converted file cannot pass silently.

`_FillValue` is not in the attribute block; it is `1e+15` in the file encoding
and also appears as `fmissing_value`. The reader masks both that exact value and
any magnitude at or above `1e14`.

All values produced by `backend/trend/var_t2m.py` are in degrees Celsius:

```
T_C = T_K - 273.15
```

A change of 1 K is a change of 1 degC, so trends in degC/decade are numerically
the same as trends in K/decade. Only the level changes.

Direct check on 1980-01, read back after conversion:

| Quantity | File value (K) | After conversion (degC) |
|---|---:|---:|
| Minimum | 231.60641 | -41.54359 |
| Maximum | 307.80728 | 34.65728 |

These match the sample checks in `_PRODUCT.md`; the test suite asserts them to
0.001 degC. The global mean of the same month is 12.36 degC.

Anomalies are **not** computed. Regional artifacts carry
`"anomaly_baseline": null` and show raw DJF values in degC.

## 3. Seasons and supported years

Seasons follow `docs/GRID_FORMAT.md`: `ANN`, `DJF`, `MAM`, `JJA`, `SON`, all
weighted by the actual calendar days in each month (February has 29 days in leap
years). DJF is December of the previous year plus January and February of the
labelled year.

A cell-season is kept only when every required month is non-fill. Incomplete
seasons become missing (`-32768` in the tiles, `0` coverage), never a partial
mean over fewer months.

| Season | Months | Years | Count |
|---|---|---|---:|
| ANN | 1-12 | 1980-2025 | 46 |
| DJF | 12, 1, 2 | 1981-2026 | 46 |
| MAM | 3-5 | 1980-2026 | 47 |
| JJA | 6-8 | 1980-2026 | 47 |
| SON | 9-11 | 1980-2025 | 46 |

ANN and SON stop at 2025 because December 2026 and November 2026 are not in the
archive. MAM and JJA reach 2026 because March to August 2026 are present. DJF
1981 is the first complete season (December 1980 is available) and DJF 2026 is
the last (February 2026).

## 4. Click-anywhere grid (1 degree)

- 180 x 360 cells; cell centres at `lat_sw + 0.5`, `lon_sw + 0.5`; 10 x 10
  degree tiles named by their southwest corner, exactly as `GRID_FORMAT.md`
  specifies.
- Values are stored as `int16` with `scale = 0.01` and `offset = 0`; slopes use
  `scale = 0.001`; coverage uses `scale = 0.001`. Fill is `-32768`.
- The full-period Sen slope in each cell is computed from the quantized and
  decoded series, so the browser reproduces it exactly for the full period.
  Cells with fewer than ten valid years store `-32768` for the slope.
- `coverage` is the valid-area fraction of the 1 degree cell. It is `1000` in
  every cell because MERRA-2 `T2M` is defined over the whole globe.

Regridding is an area-weighted bin mean. For each 1 degree bin and each native
cell, the weight is `cos(latitude of the overlap centre) x overlap area`. Using
the overlap centre rather than the native cell centre keeps the two rows that
sit exactly on the poles from getting a weight of zero; those rows still carry
their small polar-cap share. The overlap is clipped to the globe, so the two
pole rows each contribute a half cell.

The pipeline bins each month first and then forms the day-weighted seasonal
mean. Both steps are linear averages, so this equals binning the seasonal mean
directly. A constant native field maps to the same constant on the 1 degree
grid, and a direct spherical-area calculation of single cells agrees with the
bin values to better than 0.0005 degC (both are asserted in the tests).

## 5. Featured regions

Featured-region numbers stay on the **native** grid and reuse the rainfall mask
code:

- masks: `backend.trend.regions.fractional_mask` (geometric cell fraction
  multiplied by spherical cell area) with `build_regions` for the ten presets;
- season: `backend.trend.seasons.aggregate_djf`, which returns both the
  day-weighted product series and an equal-month sensitivity series;
- regional mean: `backend.trend.seasons.area_mean` over the masked weights;
- trend and inference: `backend.trend.stats.trend_block`, which calls
  `inference_block` (Mann-Kendall with the Hamed-Rao correction at 3 lags, the
  Yue-Wang classic prewhitening check, and the Sen interval).

Indonesia and Coastal Peru use their polygons; the other eight regions use
boxes, the same as the rainfall cards. Coverage is the fraction of the mask's
area that had valid data; it is 1.0 for every year here because the field is
global.

Artifacts: `data/artifacts/t2m_<region>_DJF.json` for the ten regions in
`backend/trend/regions.py`, years 1981-2026, units degC. Validation status is
`pending` in every file.

## 6. Grid size

Measured after the build with `scripts/build_t2m.py grid`:

| Item | Value |
|---|---:|
| Tile files | 3,240 (648 per season) |
| Total tile size | 89,449,502 bytes (89.4 MB) |
| Largest tile | 32,922 bytes (32.2 KB) |
| Smallest tile | 20,385 bytes (19.9 KB) |

The hard limits are 300 KB per tile and 150 MB per variable; both pass with
room to spare. For the four-variable budget: the committed `precip` grid in this
branch is 65.6 MB, so `precip` plus `t2m` is 155.0 MB. `GRID_FORMAT.md` projects
about 253.8 MB for all four variables, which stays under the 260 MB cap,
but `aod` and `soil` are not measured in this worktree.

`data/artifacts/grid/index_t2m.json` is the merge fragment for the shared
`data/artifacts/grid/index.json`: it holds the `t2m` variable block, the five
season descriptors and the per-season `years` and `available_tiles` lists. The
shared index is owned by the grid integrator, so this worker does not rewrite
it.

## 7. Reproduction

```
python scripts/build_t2m.py            # grid and regional artifacts
python scripts/build_t2m.py grid       # tiles and index fragment only
python scripts/build_t2m.py artifacts  # ten regional DJF files and validation note
python -m pytest tests -q
```

The build reads about 0.58 GB from `D:\` and takes a few minutes. It never
writes outside `data/artifacts/` and `docs/`.

## 8. Known limits

- MERRA-2 is a reanalysis: it blends observations with a weather model, and the
  observing system changes over 1980-2026. A step in the series is not
  automatically a climate trend.
- `T2M` is not `TS`. Skin temperature runs warmer over land in daytime; mixing
  the two products would create a fake offset.
- Coastal cells mix ocean and steep terrain (for example the Peruvian Andes next
  to the cold upwelling). The fractional mask reduces but does not remove this.
- The pole rows are half cells by construction. Their area share is small, and
  the overlap weighting keeps them from being dropped entirely.
- No Giovanni comparison has been run. The comparison series and request
  settings are in `docs/VALIDATION_T2M.md`.
