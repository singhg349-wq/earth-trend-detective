// Copies series JSON and time-lapse frames into public/data before dev and build.
// Nothing from the raw data drive is read here.
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(here, '..');
const repoDir = path.resolve(frontendDir, '..');
const outDir = path.join(frontendDir, 'public', 'data');
const artifactsDir = path.join(repoDir, 'data', 'artifacts');
const fixturesDir = path.join(repoDir, 'data', 'fixtures');

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function listNames(directory) {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function copyDirectory(source, destination, { overwrite = true } = {}) {
  if (!(await exists(source))) return 0;
  let entries = [];
  try {
    entries = await readdir(source, { withFileTypes: true });
  } catch {
    return 0;
  }
  await mkdir(destination, { recursive: true });
  let copied = 0;
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copied += await copyDirectory(from, to, { overwrite });
    } else if (entry.isFile() && (overwrite || !(await exists(to)))) {
      await copyFile(from, to);
      copied += 1;
    }
  }
  return copied;
}

async function listPngFiles(directory, prefix = '') {
  const found = new Set();
  if (!(await exists(directory))) return found;
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      for (const nested of await listPngFiles(
        path.join(directory, entry.name),
        `${prefix}${entry.name}/`,
      )) {
        found.add(nested);
      }
    } else if (entry.isFile() && entry.name.endsWith('.png')) {
      found.add(`${prefix}${entry.name}`);
    }
  }
  return found;
}

async function prepareGrid() {
  const fixtureGrid = path.join(fixturesDir, 'grid');
  const artifactGrid = path.join(artifactsDir, 'grid');
  const destination = path.join(outDir, 'grid');

  if (await exists(fixtureGrid)) await copyDirectory(fixtureGrid, destination);
  if (await exists(artifactGrid)) await copyDirectory(artifactGrid, destination);

  const index = await readJson(path.join(destination, 'index.json'));
  if (!index) return { available: false, fixture: false };

  // Real artifacts replace the fixture index when they land; otherwise keep
  // the fixture marker so the interface can label every value as a placeholder.
  const fixture = !(await exists(path.join(artifactGrid, 'index.json')));
  index.fixture = fixture;
  await writeFile(path.join(destination, 'index.json'), JSON.stringify(index, null, 2));
  return { available: true, fixture };
}

const FDR_CELL_FIELDS = [
  'passes_fdr',
  'fdr_pass',
  'fdr_significant',
  'significant',
  'sig',
  'hatch',
];

function cellMarksFdr(cell) {
  if (!cell || typeof cell !== 'object' || Array.isArray(cell)) return false;
  return FDR_CELL_FIELDS.some((field) => cell[field] === true);
}

function cellHasFdrBoolean(cell) {
  if (!cell || typeof cell !== 'object' || Array.isArray(cell)) return false;
  return FDR_CELL_FIELDS.some((field) => typeof cell[field] === 'boolean');
}

function cellPolygon(cellId) {
  // Grid cell ids are `cell_<centre lat>_<centre lon>`, e.g. cell_-4.5_-79.5.
  const match = /^cell_(-?\d+(?:\.\d+)?)_(-?\d+(?:\.\d+)?)$/.exec(cellId);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const west = lon - 0.5;
  const east = lon + 0.5;
  const south = lat - 0.5;
  const north = lat + 0.5;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  };
}

async function buildFdrGeoJson(gridRoot, variable, season, destination) {
  // The optional per-cell boolean is named by the grid builder. When it is
  // present, write a small GeoJSON of passing cells so the map can hatch only
  // those cells. The first tile decides whether a scan is worth doing.
  const tileDir = path.join(gridRoot, variable, season);
  if (!(await exists(tileDir))) return null;

  let names = [];
  try {
    names = (await readdir(tileDir)).filter((name) => name.endsWith('.json'));
  } catch {
    return null;
  }
  if (names.length === 0) return null;

  const firstTile = await readJson(path.join(tileDir, names[0]));
  const firstCells = firstTile?.cells;
  if (!firstCells || typeof firstCells !== 'object') return null;
  const hasBoolean = Object.values(firstCells).some((cell) => cellHasFdrBoolean(cell));
  if (!hasBoolean) return null;

  const features = [];
  for (const name of names) {
    const tile = await readJson(path.join(tileDir, name));
    const cells = tile?.cells;
    if (!cells || typeof cells !== 'object') continue;
    for (const [cellId, cell] of Object.entries(cells)) {
      if (!cellMarksFdr(cell)) continue;
      const geometry = cellPolygon(cellId);
      if (!geometry) continue;
      features.push({
        type: 'Feature',
        properties: { cell_id: cellId, fdr_pass: true },
        geometry,
      });
    }
  }
  if (features.length === 0) return null;

  const fileName = `${season}_hatch.geojson`;
  const target = path.join(destination, variable, fileName);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(
    target,
    JSON.stringify({ type: 'FeatureCollection', features }),
  );
  return fileName;
}

async function importGridTrendMaps(destination, realFiles) {
  // The data worker writes full-period trend maps as
  // grid/<variable>/trend_<SEASON>.png. Copy them into the trend-map folder so
  // the app can show them, and pair an optional significance hatch mask named
  // trend_<SEASON>_fdr.png, trend_<SEASON>_hatch.png or fdr_<SEASON>.png next
  // to the slope image. A missing hatch is normal and is not reported.
  const gridRoot = path.join(artifactsDir, 'grid');
  if (!(await exists(gridRoot))) return;

  let variables = [];
  try {
    variables = await readdir(gridRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const variableEntry of variables) {
    if (!variableEntry.isDirectory()) continue;
    const variable = variableEntry.name;
    let files = [];
    try {
      files = await readdir(path.join(gridRoot, variable));
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.png')) continue;
      const slope = /^trend_(ANN|DJF|MAM|JJA|SON)\.png$/.exec(file);
      const hatch = /^trend_(ANN|DJF|MAM|JJA|SON)_hatch\.png$/.exec(file);
      const fdr =
        /^trend_(ANN|DJF|MAM|JJA|SON)_fdr\.png$/.exec(file) ??
        /^fdr_(ANN|DJF|MAM|JJA|SON)\.png$/.exec(file);
      if (!slope && !hatch && !fdr) continue;
      const season = (slope ?? hatch ?? fdr)[1];
      const targetName = slope ? `${season}.png` : `${season}_hatch.png`;
      const target = path.join(destination, variable, targetName);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(gridRoot, variable, file), target);
      realFiles.add(`${variable}/${targetName}`);
      if (slope) {
        await buildFdrGeoJson(gridRoot, variable, season, destination);
      }
    }
  }
}

async function prepareTrendMaps() {
  const fixtureMaps = path.join(fixturesDir, 'trendmap');
  const artifactMaps = path.join(artifactsDir, 'trendmap');
  const destination = path.join(outDir, 'trendmap');

  const realFiles = await listPngFiles(artifactMaps);
  if (await exists(fixtureMaps)) await copyDirectory(fixtureMaps, destination);
  if (await exists(artifactMaps)) await copyDirectory(artifactMaps, destination);
  await importGridTrendMaps(destination, realFiles);
  if (!(await exists(destination))) return [];

  const entries = [];
  for (const relative of await listPngFiles(destination)) {
    const [variable, file] = relative.split('/');
    if (!variable || !file) continue;
    if (/_hatch\.png$/i.test(file)) continue;
    const season = file.replace(/\.png$/, '');
    const hatchName = `${season}_hatch.png`;
    const hatchPath = path.join(destination, variable, hatchName);
    const hasHatch = await exists(hatchPath);
    const hatchGeoName = `${season}_hatch.geojson`;
    const hatchGeoPath = path.join(destination, variable, hatchGeoName);
    const hasHatchGeo = await exists(hatchGeoPath);
    entries.push({
      variable,
      season,
      fixture: !realFiles.has(relative),
      ...(hasHatch ? { hatch: hatchName, fdr_q: 0.1 } : {}),
      ...(hasHatchGeo ? { hatch_geojson: hatchGeoName, fdr_q: 0.1 } : {}),
    });
  }
  entries.sort(
    (a, b) =>
      a.variable.localeCompare(b.variable) || a.season.localeCompare(b.season),
  );
  await writeFile(
    path.join(destination, 'index.json'),
    JSON.stringify({ entries }, null, 2),
  );
  return entries;
}

function summarize(doc, fixture, indexEntry) {
  const region = doc.region ?? {};
  const season = doc.season ?? {};
  const source = doc.source ?? {};
  const validation = doc.validation ?? {};
  const inference = doc.trend?.inference ?? {};
  const regionLabel = region.label ?? region.id ?? 'Unknown region';
  return {
    id: doc.id,
    label: `${regionLabel}: ${season.code ?? ''} ${doc.variable ?? 'series'}`.trim(),
    variable: doc.variable ?? '',
    units: doc.units ?? '',
    region_id: region.id ?? '',
    region_label: regionLabel,
    season: season.code ?? '',
    validation_status:
      validation.status ?? indexEntry?.validation_status ?? 'unknown',
    inference_status: inference.status ?? 'unknown',
    fixture,
    source: {
      product: source.product ?? '',
      version: source.version ?? '',
    },
  };
}

await rm(outDir, { recursive: true, force: true });
await mkdir(path.join(outDir, 'series'), { recursive: true });

// Fixtures first so that real artifacts replace them when both exist.
const collected = new Map();
for (const name of await listNames(fixturesDir)) {
  if (!name.endsWith('.json')) continue;
  if (name === 'index.json' || name === 'regions.json') continue;
  const doc = await readJson(path.join(fixturesDir, name));
  if (!doc || !Array.isArray(doc.years) || !doc.region) continue;
  const id = doc.id ?? name.replace(/\.json$/, '');
  collected.set(id, { doc, fixture: true, directory: fixturesDir, name });
}

// The real artifact list is data/artifacts/index.json when it carries entries.
// Its `file` field points at the series document; ids not listed are left out.
// An empty or missing list falls back to scanning the artifact folder so the
// build still works before the index is generated.
const artifactIndex = await readJson(path.join(artifactsDir, 'index.json'));
const indexed = Array.isArray(artifactIndex?.artifacts)
  ? artifactIndex.artifacts
  : [];
if (indexed.length > 0) {
  for (const entry of indexed) {
    if (!entry || typeof entry.id !== 'string') continue;
    const fileName =
      typeof entry.file === 'string' && path.basename(entry.file) === entry.file
        ? entry.file
        : `${entry.id}.json`;
    const doc = await readJson(path.join(artifactsDir, fileName));
    if (!doc || !Array.isArray(doc.years) || !doc.region) continue;
    // The copied document must keep the id its own file declares, because the
    // client rejects a series whose id does not match the request.
    const id = typeof doc.id === 'string' && doc.id ? doc.id : entry.id;
    collected.set(id, {
      doc,
      fixture: false,
      directory: artifactsDir,
      name: fileName,
      indexEntry: entry,
    });
  }
} else {
  for (const name of await listNames(artifactsDir)) {
    if (!name.endsWith('.json')) continue;
    if (name === 'index.json' || name === 'regions.json') continue;
    const doc = await readJson(path.join(artifactsDir, name));
    if (!doc || !Array.isArray(doc.years) || !doc.region) continue;
    const id = doc.id ?? name.replace(/\.json$/, '');
    collected.set(id, { doc, fixture: false, directory: artifactsDir, name });
  }
}

for (const [id, entry] of collected) {
  await copyFile(
    path.join(entry.directory, entry.name),
    path.join(outDir, 'series', `${id}.json`),
  );
}

for (const directory of [artifactsDir, fixturesDir]) {
  const outline = path.join(directory, 'regions.geojson');
  if (await exists(outline)) {
    await copyFile(outline, path.join(outDir, 'regions.geojson'));
    break;
  }
}

// Time-lapse frames: use real artifacts first, else the fixture frames.
let timelapseNames = [];
let timelapseBytes = 0;
for (const [directory, fixture] of [
  [artifactsDir, false],
  [fixturesDir, true],
]) {
  const timelapseDir = path.join(directory, 'timelapse');
  for (const name of await listNames(timelapseDir)) {
    const source = path.join(timelapseDir, name);
    if (!(await stat(source)).isDirectory()) continue;
    const destination = path.join(outDir, 'timelapse', name);
    if (await exists(destination)) continue;
    await mkdir(destination, { recursive: true });
    for (const file of await listNames(source)) {
      if (!file.endsWith('.png') && file !== 'index.json') continue;
      await copyFile(path.join(source, file), path.join(destination, file));
      timelapseBytes += (await stat(path.join(destination, file))).size;
    }
    const indexFile = path.join(destination, 'index.json');
    const index = await readJson(indexFile);
    if (index) {
      if (fixture) index.fixture = true;
      await writeFile(indexFile, JSON.stringify(index, null, 2));
    }
    timelapseNames.push(name);
  }
}

const grid = await prepareGrid();
const trendMaps = await prepareTrendMaps();

const series = [...collected.values()]
  .map((entry) => summarize(entry.doc, entry.fixture, entry.indexEntry))
  .sort(
    (a, b) =>
      a.region_label.localeCompare(b.region_label) ||
      a.season.localeCompare(b.season) ||
      a.variable.localeCompare(b.variable),
  );

await writeFile(
  path.join(outDir, 'index.json'),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      series,
      timelapse: timelapseNames,
      grid,
      trendmap: trendMaps,
    },
    null,
    2,
  ),
);

if (timelapseBytes > 15 * 1024 * 1024) {
  console.warn(
    `[copy-data] time-lapse frames are ${(timelapseBytes / 1024 / 1024).toFixed(1)} MB, above the 15 MB budget`,
  );
}

console.log(
  `[copy-data] ${series.length} series, ${timelapseNames.length} time-lapse set(s) and ` +
    `${grid.available ? (grid.fixture ? 'fixture ' : '') + 'grid' : 'no grid'} copied to public/data ` +
    `(${(timelapseBytes / 1024 / 1024).toFixed(2)} MB of frames, ${trendMaps.length} trend map(s))`,
);
