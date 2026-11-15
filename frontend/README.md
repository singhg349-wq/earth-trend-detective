# Frontend

Static React + TypeScript + MapLibre app for comparing seasonal regional series and
clicking any 1 degree grid cell.

## Local development

```bash
npm install
npm run dev
```

`predev` copies the series files, grid tiles and trend-map PNGs into `public/data/` and builds
`index.json`. The map uses a local GeoJSON outline, local raster layers and a plain background; it
does not request remote map tiles.

The FastAPI server is optional. When it answers on `http://localhost:8000/api/health`, the app reads
series from it; otherwise it reads the static files. Start it from the repository root:

```bash
python -m uvicorn backend.main:app --port 8000
```

## Build and deploy

```bash
npm run build
npm test
```

`prebuild` copies `../data/artifacts` and `../data/fixtures` into `public/data/`, so the build machine
needs the repository around the frontend folder. Deploy only `dist/` (Vercel settings are in
`vercel.json`). No backend is needed on the public host.

## Data paths

- `data/index.json`: generated list of series ids and labels.
- `data/series/<id>.json`: one series per the shared contract.
- `data/regions.geojson`: region outlines when the data build provides them.
- `data/timelapse/precip_DJF/`: one PNG per DJF year plus `index.json`.
- `data/grid/index.json` and `data/grid/<variable>/<season>/<lon>_<lat>.json`: 10 degree
  tiles of 1 degree cells, following `docs/GRID_FORMAT.md`.
- `data/trendmap/<variable>/<season>.png`: Sen slope map in EPSG:4326 plus a generated
  `index.json` listing available layers.
- `data/trendmap/<variable>/<season>_hatch.png` or `<season>_hatch.geojson`: optional
  false-discovery-rate mask. The catalog entry carries `hatch` or `hatch_geojson` and
  `fdr_q` (default 0.10). A PNG hatch is drawn by the map builder; a GeoJSON hatch is
  built from a per-cell boolean (`passes_fdr`, `fdr_pass`, `significant`, `sig` or
  `hatch`) when the grid tiles provide one.
- `regions.geojson`: fallback outlines used by the fixture series.

Result cards read `trend.inference` (`status`, `p_value`, `ci`, `method`,
`strict_check_pass`, `strict_check_p`, `lag1`, `caution`, `ci_note`, `n`). The main
test is Mann-Kendall with the Hamed-Rao correction at 3 lags; the strict check is
Yue-Wang prewhitening. Sub-period slopes computed from the stored series never get a
p-value.

All data access goes through `src/data/seriesSource.ts`. Switch its `MODE` constant to `static` or
`api` to pin the series source. Grid tile access also goes through `seriesSource` (the tile lookup
and int16 decoding live in `src/lib/tiles.ts`).
