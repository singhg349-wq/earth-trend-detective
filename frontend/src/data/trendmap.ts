/**
 * Trend-map catalog entries.
 *
 * One PNG per variable and season colours every valid 1 degree cell by its
 * full-period Sen slope. A cell that passes the Benjamini-Hochberg false
 * discovery rate test (q = 0.10) may also be hatched. The hatch is a second
 * PNG mask produced by the map builder, named relative to the variable folder
 * (for example `DJF_hatch.png`). When the mask is missing the app shows the
 * slope colours only and says so.
 */

export const FDR_Q = 0.1;

export interface TrendMapEntry {
  variable: string;
  season: string;
  fixture: boolean;
  /** Optional hatch mask file, relative to the variable folder. */
  hatch?: string | null;
  /** Optional GeoJSON of cells that pass FDR, relative to the variable folder. */
  hatch_geojson?: string | null;
  /** False-discovery-rate level for the hatch. Defaults to 0.10. */
  fdr_q?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRelativeFile(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/^\.\//, '');
  if (
    trimmed === '' ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    trimmed.includes('..')
  ) {
    return null;
  }
  return trimmed;
}

export function normalizeTrendMapEntry(raw: unknown): TrendMapEntry | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.variable !== 'string' || typeof raw.season !== 'string') {
    return null;
  }
  const q =
    typeof raw.fdr_q === 'number' &&
    Number.isFinite(raw.fdr_q) &&
    raw.fdr_q > 0 &&
    raw.fdr_q < 1
      ? raw.fdr_q
      : FDR_Q;

  return {
    variable: raw.variable,
    season: raw.season,
    fixture: Boolean(raw.fixture),
    hatch: readRelativeFile(raw.hatch),
    hatch_geojson: readRelativeFile(raw.hatch_geojson),
    fdr_q: q,
  };
}

function joinEncoded(root: string, parts: string[]): string {
  const base = root.replace(/\/+$/, '');
  const encoded = parts
    .flatMap((part) => part.split('/'))
    .filter((part) => part !== '')
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `${base}/${encoded}`;
}

export function trendMapUrl(root: string, entry: TrendMapEntry): string {
  return joinEncoded(root, [entry.variable, `${entry.season}.png`]);
}

export function trendMapHatchUrl(
  root: string,
  entry: TrendMapEntry,
): string | null {
  if (!entry.hatch) return null;
  return joinEncoded(root, [entry.variable, entry.hatch]);
}

export function trendMapHatchGeoJsonUrl(
  root: string,
  entry: TrendMapEntry,
): string | null {
  if (!entry.hatch_geojson) return null;
  return joinEncoded(root, [entry.variable, entry.hatch_geojson]);
}
