import { COUNTRIES, OCEANS } from './placeData';
/**
 * Place search for the globe.
 *
 * Sources, in order of specificity:
 *   - the ten study regions (they carry a `regionId`, so choosing one opens the
 *     region's stored series);
 *   - ~45 well-known cities (own list, real coordinates; hidden once the full
 *     list below has loaded and covers them);
 *   - ~25,000 world cities from GeoNames (CC BY 4.0), lazy-loaded from
 *     `assets/gazetteer/cities.json` the first time someone types;
 *   - countries, oceans and seas from `lib/placeData.ts` (owned by the globe
 *     worker; while that file is absent a small local set is used);
 *   - typed coordinates, e.g. `53.55, -113.49` or `53.55N 113.49W`.
 *
 * Matching is case- and diacritic-insensitive. Order: exact match, then
 * prefix, then word-prefix, then substring; shorter names first within a tier.
 */

export type PlaceKind = 'country' | 'ocean' | 'sea' | 'region' | 'city' | 'coords';

export interface PlaceResult {
  name: string;
  kind: PlaceKind;
  lon: number;
  lat: number;
  regionId?: string;
}

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  country: 'Country',
  ocean: 'Ocean',
  sea: 'Sea',
  region: 'Study region',
  city: 'City',
  coords: 'Coordinates',
};

/** The ten named study regions, with a sensible camera point inside each. */
export interface StudyRegion {
  id: string;
  label: string;
  lon: number;
  lat: number;
}

export const STUDY_REGIONS: readonly StudyRegion[] = [
  { id: 'alberta_prairies', label: 'Alberta / Prairies', lon: -108, lat: 54 },
  { id: 'amazon', label: 'Amazon', lon: -60, lat: -5 },
  { id: 'australia', label: 'Australia', lon: 133, lat: -25 },
  { id: 'california', label: 'California', lon: -119.5, lat: 37 },
  { id: 'coastal_peru', label: 'Coastal Peru', lon: -79, lat: -6.5 },
  { id: 'east_africa', label: 'East Africa', lon: 35.5, lat: 0 },
  { id: 'india', label: 'India', lon: 83, lat: 21 },
  { id: 'indonesia', label: 'Indonesia', lon: 117, lat: -2 },
  { id: 'sahel', label: 'Sahel', lon: 8.5, lat: 15 },
  { id: 'southern_africa', label: 'Southern Africa', lon: 24.5, lat: -26 },
];

interface NamedPlace {
  name: string;
  lon: number;
  lat: number;
  kind: Exclude<PlaceKind, 'region' | 'coords'>;
}

// Country/ocean/sea names come from `lib/placeData.ts` when it exists.
// Until then a small fallback keeps search useful.
const NAMED_PLACES: readonly NamedPlace[] = [...COUNTRIES, ...OCEANS];

// Well-known cities with representative coordinates (lon, lat).
const CITIES: ReadonlyArray<{ name: string; lon: number; lat: number }> = [
  { name: 'Edmonton', lon: -113.49, lat: 53.55 },
  { name: 'Calgary', lon: -114.07, lat: 51.05 },
  { name: 'Vancouver', lon: -123.12, lat: 49.28 },
  { name: 'Toronto', lon: -79.38, lat: 43.65 },
  { name: 'Montreal', lon: -73.57, lat: 45.5 },
  { name: 'New York', lon: -74.01, lat: 40.71 },
  { name: 'Los Angeles', lon: -118.24, lat: 34.05 },
  { name: 'Chicago', lon: -87.63, lat: 41.88 },
  { name: 'Mexico City', lon: -99.13, lat: 19.43 },
  { name: 'Lima', lon: -77.04, lat: -12.05 },
  { name: 'Bogotá', lon: -74.07, lat: 4.71 },
  { name: 'Santiago', lon: -70.67, lat: -33.45 },
  { name: 'Buenos Aires', lon: -58.38, lat: -34.6 },
  { name: 'São Paulo', lon: -46.63, lat: -23.55 },
  { name: 'Rio de Janeiro', lon: -43.17, lat: -22.91 },
  { name: 'Manaus', lon: -60.02, lat: -3.12 },
  { name: 'Lagos', lon: 3.38, lat: 6.52 },
  { name: 'Nairobi', lon: 36.82, lat: -1.29 },
  { name: 'Cairo', lon: 31.24, lat: 30.04 },
  { name: 'Cape Town', lon: 18.42, lat: -33.92 },
  { name: 'Johannesburg', lon: 28.05, lat: -26.2 },
  { name: 'Addis Ababa', lon: 38.76, lat: 9.01 },
  { name: 'Mumbai', lon: 72.88, lat: 19.08 },
  { name: 'Delhi', lon: 77.21, lat: 28.61 },
  { name: 'Kolkata', lon: 88.36, lat: 22.57 },
  { name: 'Dhaka', lon: 90.41, lat: 23.81 },
  { name: 'Bangkok', lon: 100.5, lat: 13.76 },
  { name: 'Singapore', lon: 103.82, lat: 1.35 },
  { name: 'Jakarta', lon: 106.85, lat: -6.21 },
  { name: 'Manila', lon: 120.98, lat: 14.6 },
  { name: 'Beijing', lon: 116.41, lat: 39.9 },
  { name: 'Shanghai', lon: 121.47, lat: 31.23 },
  { name: 'Tokyo', lon: 139.69, lat: 35.68 },
  { name: 'Seoul', lon: 126.98, lat: 37.57 },
  { name: 'Sydney', lon: 151.21, lat: -33.87 },
  { name: 'Melbourne', lon: 144.96, lat: -37.81 },
  { name: 'Perth', lon: 115.86, lat: -31.95 },
  { name: 'Auckland', lon: 174.76, lat: -36.85 },
  { name: 'London', lon: -0.13, lat: 51.51 },
  { name: 'Paris', lon: 2.35, lat: 48.86 },
  { name: 'Berlin', lon: 13.4, lat: 52.52 },
  { name: 'Madrid', lon: -3.7, lat: 40.42 },
  { name: 'Rome', lon: 12.5, lat: 41.9 },
  { name: 'Moscow', lon: 37.62, lat: 55.76 },
  { name: 'Istanbul', lon: 28.98, lat: 41.01 },
  { name: 'Dubai', lon: 55.27, lat: 25.2 },
  { name: 'Anchorage', lon: -149.9, lat: 61.22 },
];

function regionPlace(region: StudyRegion): PlaceResult {
  return {
    name: region.label,
    kind: 'region',
    lon: region.lon,
    lat: region.lat,
    regionId: region.id,
  };
}

function namespacedPlace(place: NamedPlace): PlaceResult | null {
  if (!Number.isFinite(place.lon) || !Number.isFinite(place.lat)) return null;
  if (Math.abs(place.lat) > 90 || Math.abs(place.lon) > 180) return null;
  return { name: place.name, kind: place.kind, lon: place.lon, lat: place.lat };
}

/** Everything searchable, built once. */
export function allPlaces(): PlaceResult[] {
  const places: PlaceResult[] = [];
  for (const region of STUDY_REGIONS) places.push(regionPlace(region));
  for (const place of NAMED_PLACES) {
    const result = namespacedPlace(place);
    if (result) places.push(result);
  }
  for (const city of CITIES) {
    if (!Number.isFinite(city.lon) || !Number.isFinite(city.lat)) continue;
    if (Math.abs(city.lat) > 90 || Math.abs(city.lon) > 180) continue;
    places.push({ name: city.name, kind: 'city', lon: city.lon, lat: city.lat });
  }
  return places;
}

/** Lowercase, no diacritics, single spaces. */
export function normalizeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 0 exact, 1 prefix, 2 word prefix, 3 substring; null when no match.
 * Word-prefix means any word in the name starts with the query.
 */
export function matchTier(name: string, query: string): number | null {
  if (!query) return null;
  const haystack = normalizeQuery(name);
  if (haystack === query) return 0;
  if (haystack.startsWith(query)) return 1;
  if (haystack.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 2;
  if (haystack.includes(query)) return 3;
  return null;
}

const COORD_PAIR = /^([+-]?\d{1,3}(?:\.\d+)?)\s*(?:,|\s)\s*([+-]?\d{1,3}(?:\.\d+)?)$/;
const HEMISPHERE_TRAILING =
  /^(\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEW])\s*(?:,|\s)?\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*([NSEW])$/;
const HEMISPHERE_LEADING =
  /^([NSEW])\s*(\d{1,3}(?:\.\d+)?)\s*°?\s*(?:,|\s)?\s*([NSEW])\s*(\d{1,3}(?:\.\d+)?)\s*°?$/;

function coord(lon: number, lat: number): PlaceResult | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const labelLat = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const labelLon = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return { name: `${labelLat}, ${labelLon}`, kind: 'coords', lon, lat };
}

/**
 * Parse typed coordinates. Accepts `53.55, -113.49`, `53.55 -113.49`,
 * `53.55N 113.49W` and `N53.55 W113.49`. Latitudes need N/S, longitudes E/W.
 */
export function parseCoordinates(raw: string): PlaceResult | null {
  const text = raw
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/[º˚]/g, '°')
    .trim();
  if (!text) return null;

  const pair = COORD_PAIR.exec(text);
  if (pair) {
    const lat = Number(pair[1]);
    const lon = Number(pair[2]);
    // Plain pairs are latitude first, as in the placeholder.
    return coord(lon, lat);
  }

  const trailing = HEMISPHERE_TRAILING.exec(text);
  if (trailing) {
    const first = Number(trailing[1]);
    const firstName = trailing[2].toUpperCase();
    const second = Number(trailing[3]);
    const secondName = trailing[4].toUpperCase();
    if (firstName === secondName) return null;
    return firstName === 'N' || firstName === 'S'
      ? coord(secondName === 'W' ? -second : second, firstName === 'S' ? -first : first)
      : coord(firstName === 'W' ? -first : first, secondName === 'S' ? -second : second);
  }

  const leading = HEMISPHERE_LEADING.exec(text);
  if (leading) {
    const firstName = leading[1].toUpperCase();
    const first = Number(leading[2]);
    const secondName = leading[3].toUpperCase();
    const second = Number(leading[4]);
    if (firstName === secondName) return null;
    return firstName === 'N' || firstName === 'S'
      ? coord(secondName === 'W' ? -second : second, firstName === 'S' ? -first : first)
      : coord(firstName === 'W' ? -first : first, secondName === 'S' ? -second : second);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Lazy-loaded GeoNames cities
// ---------------------------------------------------------------------------

/** [name, asciiName ('' = same as name), admin1, country, lat, lon, population] */
export type CityRow = [string, string, string, string, number, number, number];

interface CityEntry {
  place: PlaceResult;
  /** Normalized city name (diacritics stripped). */
  norm: string;
  /** Normalized `name admin1 country`, for queries like "red deer alberta". */
  full: string;
  population: number;
}

export type CityLoadState = 'idle' | 'loading' | 'ready' | 'failed';

let cityState: CityLoadState = 'idle';
let cityEntries: CityEntry[] = [];
let cityCoverage = new Map<string, Array<[number, number]>>();
let cityPromise: Promise<boolean> | null = null;

export function getCityLoadState(): CityLoadState {
  return cityState;
}

function cityLabel(row: CityRow): string {
  const [name, , admin1, country] = row;
  return [name, admin1 && admin1 !== name ? admin1 : '', country].filter(Boolean).join(', ');
}

/** Install a city list (used by the loader and by tests). Bad rows are skipped. */
export function setCities(rows: readonly CityRow[]): void {
  const entries: CityEntry[] = [];
  const coverage = new Map<string, Array<[number, number]>>();
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || !row[0]) continue;
    const [name, ascii, admin1, country, lat, lon, population] = row;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const norm = normalizeQuery(name);
    const asciiNorm = ascii ? normalizeQuery(ascii) : norm;
    entries.push({
      place: { name: cityLabel(row), kind: 'city', lon, lat },
      norm,
      full: normalizeQuery(`${asciiNorm} ${admin1} ${country}`),
      population: Number(population) || 0,
    });
    const list = coverage.get(norm);
    if (list) list.push([lon, lat]);
    else coverage.set(norm, [[lon, lat]]);
  }
  entries.sort((a, b) => b.population - a.population);
  cityEntries = entries;
  cityCoverage = coverage;
  cityState = 'ready';
}

/** Forget any loaded cities (tests, or to retry after a failure). */
export function resetCities(): void {
  cityState = 'idle';
  cityEntries = [];
  cityCoverage = new Map();
  cityPromise = null;
}

/**
 * Fetch the city list once and cache it. Resolves true when cities are ready,
 * false when the fetch failed (the other sources keep working). A failed load
 * may be retried by calling again.
 */
export function loadCities(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  url = `${import.meta.env.BASE_URL}assets/gazetteer/cities.json`,
): Promise<boolean> {
  if (cityState === 'ready') return Promise.resolve(true);
  if (cityPromise) return cityPromise;
  cityState = 'loading';
  const pending = (async () => {
    try {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error('unexpected city data');
      setCities(rows as CityRow[]);
      return true;
    } catch {
      cityState = 'failed';
      return false;
    } finally {
      cityPromise = null;
    }
  })();
  // `finally` may already have run for a synchronous failure; only keep the
  // promise while the load is still in flight.
  if (cityState === 'loading') cityPromise = pending;
  return pending;
}

/** A hand-written city is redundant when a loaded city of that name is nearby. */
function coveredByLoaded(place: PlaceResult): boolean {
  if (cityState !== 'ready') return false;
  const near = cityCoverage.get(normalizeQuery(place.name));
  return !!near?.some(
    ([lon, lat]) => Math.abs(lon - place.lon) < 1.5 && Math.abs(lat - place.lat) < 1.5,
  );
}

function cityTier(entry: CityEntry, query: string): number | null {
  const { norm } = entry;
  if (norm === query) return 0;
  if (norm.startsWith(query)) return 1;
  if (norm.split(/[^a-z0-9]+/).some((word) => word.startsWith(query))) return 2;
  if (norm.includes(query)) return 3;
  // "red deer alberta", "paris texas": fall back to the full label.
  if (query.includes(' ') && entry.full.includes(query)) return 3;
  return null;
}

/**
 * Search places by name. Default limit 8. A typed coordinate pair is returned
 * first, on its own, because it is unambiguous.
 *
 * Order: match tier (exact, prefix, word prefix, substring); within a tier the
 * study regions, then countries/oceans/seas, then cities by population.
 */
export function searchPlaces(query: string, limit = 8): PlaceResult[] {
  const raw = query.trim();
  if (!raw) return [];
  const max = Math.max(1, Math.trunc(limit));

  const coordinates = parseCoordinates(raw);
  if (coordinates) return [coordinates];

  const normalized = normalizeQuery(raw);
  // group: 0 region, 1 country/ocean/sea, 2 city
  const scored: Array<{ place: PlaceResult; tier: number; group: number; population: number }> = [];
  for (const place of allPlaces()) {
    if (place.kind === 'city' && coveredByLoaded(place)) continue;
    const tier = matchTier(place.name, normalized);
    if (tier === null) continue;
    const group = place.kind === 'region' ? 0 : place.kind === 'city' ? 2 : 1;
    scored.push({ place, tier, group, population: 0 });
  }
  for (const entry of cityEntries) {
    const tier = cityTier(entry, normalized);
    if (tier !== null) scored.push({ place: entry.place, tier, group: 2, population: entry.population });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.group !== b.group) return a.group - b.group;
    if (a.population !== b.population) return b.population - a.population;
    const lengthDiff = a.place.name.length - b.place.name.length;
    if (lengthDiff !== 0) return lengthDiff;
    return a.place.name.localeCompare(b.place.name, 'en', { sensitivity: 'base' });
  });

  const seen = new Set<string>();
  const results: PlaceResult[] = [];
  for (const { place } of scored) {
    const key = `${place.kind}:${normalizeQuery(place.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(place);
    if (results.length >= max) break;
  }
  return results;
}
