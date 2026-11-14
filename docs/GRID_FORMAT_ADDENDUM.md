# Precipitation grid inference and map layers

This addendum extends the per-cell tile in `GRID_FORMAT.md` for the rainfall (`precip`) grid.

## Tile inference fields

Each stored cell includes:

| Field | JSON type | Meaning |
|---|---|---|
| `fdr_significant` | boolean | `true` when that cell's main two-sided Mann-Kendall Hamed-Rao p-value (`max_lag=3`, alpha `0.05`) passes Benjamini-Hochberg at `q=0.10` among the season's cells with a finite main p-value. Otherwise `false`. |
| `strict_check_pass` | boolean or `null` | The strict classic prewhitening check from `inference_block`; null means it could not be evaluated. |

The FDR family is computed separately for ANN, DJF, MAM, JJA, and SON over the full global grid. Cells without an eligible finite main p-value are excluded from the family and receive `fdr_significant: false`. No raw p-values are stored in tiles. The frontend reads the JSON boolean `fdr_significant` and exposes it as `trend.fdr_significant`.

## Map outputs

For each season, `trend_<season>.png` is a 360 by 180 Sen slope image in WGS 84 longitude/latitude (EPSG:4326), with a diverging `coolwarm` palette and a fixed -2 to +2 mm/day/decade display range. `trend_<season>_fdr.png` is a same-size transparent overlay; significant cells carry diagonal hatching. Each PNG has a `.pgw` world file (one-degree pixels, upper-left pixel centre at -179.5, 89.5) and a `.prj` WGS 84 geographic coordinate system file.

Tile JSON remains below 300 KB per tile; the build records the total precipitation tile JSON byte count in `index.json` as `variables.precip.total_size_bytes`.
