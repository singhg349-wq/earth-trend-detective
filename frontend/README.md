# Frontend

Static React + TypeScript + MapLibre app for comparing DJF regional series.

## Local development

```bash
npm install
npm run dev
```

`predev` copies the series files into `public/data/` and builds `index.json`. The map uses a local
GeoJSON outline and a plain background; it does not request remote map tiles.

The FastAPI server is optional. When it answers on `http://localhost:8000/api/health`, the app reads
series from it; otherwise it reads the static files. Start it from the repository root:

```bash
python -m uvicorn backend.main:app --port 8000
```

## Build and deploy

```bash
npm run build
```

`prebuild` copies `../data/artifacts` and `../data/fixtures` into `public/data/`, so the build machine
needs the repository around the frontend folder. Deploy only `dist/` (Vercel settings are in
`vercel.json`). No backend is needed on the public host.

## Data paths

- `data/index.json`: generated list of series ids and labels.
- `data/series/<id>.json`: one series per the shared contract.
- `data/regions.geojson`: region outlines when the data build provides them.
- `data/timelapse/precip_DJF/`: one PNG per DJF year plus `index.json`.
- `regions.geojson`: fallback outlines used by the fixture series.

All data access goes through `src/data/seriesSource.ts`. Switch its `MODE` constant to `static` or
`api` to pin the source.
