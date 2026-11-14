import type { RegionsGeoJson, SeriesDoc, SeriesSummary, TimelapseIndex } from '../types';

// The only module that fetches series or map data.
//
// Data source modes:
//   'auto'   - probe the local FastAPI server once, fall back to static files
//   'api'    - always use the local FastAPI server at API_BASE
//   'static' - always use the JSON files copied into public/data at build time
//
// The online build is static only. The API is a local convenience.
const MODE: 'auto' | 'api' | 'static' = 'auto';

const API_BASE = 'http://localhost:8000';
const DATA_ROOT = `${import.meta.env.BASE_URL}data/`;
const SERIES_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TIMELAPSE_KEY = 'precip_DJF';

let apiReady: Promise<boolean> | null = null;

function probeApi(): Promise<boolean> {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!isLocal) return Promise.resolve(false);
  if (MODE === 'static') return Promise.resolve(false);
  if (MODE === 'api') return Promise.resolve(true);
  if (!apiReady) {
    apiReady = (async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 800);
      try {
        const response = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
        return response.ok;
      } catch {
        return false;
      } finally {
        window.clearTimeout(timer);
      }
    })();
  }
  return apiReady;
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return (await response.json()) as T;
}

function normalizeSummary(raw: Record<string, unknown>): SeriesSummary {
  const source = (raw.source ?? {}) as Record<string, unknown>;
  return {
    id: String(raw.id ?? ''),
    label: String(raw.label ?? raw.id ?? 'Untitled series'),
    variable: String(raw.variable ?? ''),
    units: String(raw.units ?? ''),
    region_id: String(raw.region_id ?? ''),
    region_label: String(raw.region_label ?? raw.region_id ?? 'Unknown region'),
    season: String(raw.season ?? ''),
    validation_status: String(raw.validation_status ?? 'unknown'),
    fixture: Boolean(raw.fixture),
    source: {
      product: String(source.product ?? ''),
      version: String(source.version ?? ''),
    },
  };
}

export async function listSeries(): Promise<SeriesSummary[]> {
  if (await probeApi()) {
    const body = await readJson<{ series?: Array<Record<string, unknown>> }>(
      `${API_BASE}/api/series`,
    );
    return (body.series ?? []).map(normalizeSummary);
  }

  const body = await readJson<{ series?: Array<Record<string, unknown>> }>(
    `${DATA_ROOT}index.json`,
  );
  return (body.series ?? []).map(normalizeSummary);
}

export async function getSeries(id: string): Promise<SeriesDoc> {
  if (!SERIES_ID.test(id)) {
    throw new Error(`Invalid series id: ${id}`);
  }

  const doc = await readJson<SeriesDoc>(
    (await probeApi())
      ? `${API_BASE}/api/series/${encodeURIComponent(id)}`
      : `${DATA_ROOT}series/${encodeURIComponent(id)}.json`,
  );

  if (!doc || doc.id !== id) {
    throw new Error(`Series ${id} is not valid.`);
  }
  return doc;
}

// Region outlines are local. Try the artifact outline first, then the bundled
// fallback used by the fixtures.
export async function getRegionsGeoJson(): Promise<RegionsGeoJson> {
  for (const url of [`${DATA_ROOT}regions.geojson`, `${import.meta.env.BASE_URL}regions.geojson`]) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const body = (await response.json()) as RegionsGeoJson;
      if (body && body.type === 'FeatureCollection' && Array.isArray(body.features)) {
        return body;
      }
    } catch {
      // Try the next location.
    }
  }
  return { type: 'FeatureCollection', features: [] };
}

export async function getTimelapseIndex(): Promise<TimelapseIndex | null> {
  try {
    const index = await readJson<TimelapseIndex>(
      `${DATA_ROOT}timelapse/${TIMELAPSE_KEY}/index.json`,
    );
    if (!Array.isArray(index.years) || index.years.length === 0) return null;
    return index;
  } catch {
    return null;
  }
}

export function timelapseFrameUrl(year: number): string {
  return `${DATA_ROOT}timelapse/${TIMELAPSE_KEY}/${year}.png`;
}
