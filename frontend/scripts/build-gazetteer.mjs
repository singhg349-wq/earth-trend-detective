// Build public/assets/gazetteer/cities.json from GeoNames dumps (CC BY 4.0).
// Usage: node scripts/build-gazetteer.mjs <folder with cities15000.txt, countryInfo.txt, admin1CodesASCII.txt>
// Files are parsed as plain text only.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_CITIES = 25000;
const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/build-gazetteer.mjs <geonames folder>');
  process.exit(1);
}
const lines = (file) =>
  readFileSync(join(dir, file), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));

const countries = new Map();
for (const l of lines('countryInfo.txt')) {
  const c = l.split('\t');
  countries.set(c[0], c[4]);
}
const admin1 = new Map();
for (const l of lines('admin1CodesASCII.txt')) {
  const c = l.split('\t');
  admin1.set(c[0], c[1]);
}

// Columns: 1 name, 2 asciiname, 4 lat, 5 lon, 8 country code, 10 admin1, 14 population.
const rows = [];
for (const l of lines('cities15000.txt')) {
  const c = l.split('\t');
  const lat = Number(c[4]);
  const lon = Number(c[5]);
  if (!c[1] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push([
    c[1],
    c[2] && c[2] !== c[1] ? c[2] : '', // asciiName; '' means same as name
    admin1.get(`${c[8]}.${c[10]}`) ?? '',
    countries.get(c[8]) ?? c[8],
    Math.round(lat * 1000) / 1000,
    Math.round(lon * 1000) / 1000,
    Number(c[14]) || 0,
  ]);
}
rows.sort((a, b) => b[6] - a[6]);
rows.length = Math.min(rows.length, MAX_CITIES); // keep the file small

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'gazetteer', 'cities.json');
mkdirSync(dirname(out), { recursive: true });
const text = JSON.stringify(rows);
writeFileSync(out, text);
console.log(`${rows.length} cities, ${text.length} bytes -> ${out}`);
