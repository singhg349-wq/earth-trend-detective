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

function summarize(doc, fixture) {
  const region = doc.region ?? {};
  const season = doc.season ?? {};
  const source = doc.source ?? {};
  const validation = doc.validation ?? {};
  const regionLabel = region.label ?? region.id ?? 'Unknown region';
  return {
    id: doc.id,
    label: `${regionLabel}: ${season.code ?? ''} ${doc.variable ?? 'series'}`.trim(),
    variable: doc.variable ?? '',
    units: doc.units ?? '',
    region_id: region.id ?? '',
    region_label: regionLabel,
    season: season.code ?? '',
    validation_status: validation.status ?? 'unknown',
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
for (const [directory, fixture] of [
  [fixturesDir, true],
  [artifactsDir, false],
]) {
  for (const name of await listNames(directory)) {
    if (!name.endsWith('.json')) continue;
    if (name === 'index.json' || name === 'regions.json') continue;
    const doc = await readJson(path.join(directory, name));
    if (!doc || !Array.isArray(doc.years) || !doc.region) continue;
    const id = doc.id ?? name.replace(/\.json$/, '');
    collected.set(id, { doc, fixture, directory, name });
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

const series = [...collected.values()]
  .map((entry) => summarize(entry.doc, entry.fixture))
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
  `[copy-data] ${series.length} series and ${timelapseNames.length} time-lapse set(s) copied to public/data (${(timelapseBytes / 1024 / 1024).toFixed(2)} MB of frames)`,
);
