/**
 * Browser lookup and decoding for the precomputed 1-degree grid.
 *
 * Authoritative format: docs/GRID_FORMAT.md. Public entry point for the app's
 * seriesSource: `fetchCellSeries`.
 *
 * The single call:
 *   1. maps a clicked lon/lat to the 1-degree cell and 10-degree tile,
 *   2. checks `available_tiles` in index.json,
 *   3. fetches `data/artifacts/grid/<variable>/<season>/<tile_lon>_<tile_lat>.json`,
 *   4. decodes int16 values/coverage/slope,
 *   5. returns a CONTRACT.md-shaped result with
 *      `validation.status = "unchecked-same-method"`.
 *
 * Expected no-data cases (missing tile, ocean/land-only gap, cell absent from a
 * partial tile) are returned as `{ status: "no-data", reason, message }` and do
 * not throw.
 */

import { median } from "./stats";

const DEFAULT_BASE_PATH = "data/artifacts/grid";
const TILE_SIZE_DEG = 10;
const EARTH_RADIUS_KM = 6371.0088;
const DEFAULT_FILL_INT16 = -32768;

export interface GridSource {
  product: string;
  version: string;
  var: string;
  doi_or_url: string;
}

export interface GridSeasonMeta {
  code: string;
  year_label: string;
  months: number[];
  aggregation: string;
}

export interface GridVariableMeta {
  variable: string;
  units: string;
  slope_units: string;
  scale: number;
  offset: number;
  decimals: number;
  slope_scale: number;
  slope_offset: number;
  slope_decimals: number;
  coverage_scale: number;
  coverage_offset: number;
  coverage_decimals: number;
  land_only?: boolean;
  regrid_note?: string;
  source: GridSource;
  years_by_season: Record<string, number[]>;
  /** `"ALL_648"` or the sorted tile keys that actually exist on disk. */
  available_tiles?: "ALL_648" | string[];
}

export interface GridIndex {
  format_version: number;
  grid_resolution_deg: number;
  tile_size_deg: number;
  fill_int16: number;
  seasons: Record<string, GridSeasonMeta>;
  variables: Record<string, GridVariableMeta>;
}

interface RawTileCell {
  s?: unknown;
  v: unknown[];
  c?: unknown;
}

interface RawTile {
  v_slug: string;
  season: string;
  tile: [number, number];
  cells: Record<string, unknown>;
}

export interface ContractSource extends GridSource {}

export interface ContractRegion {
  id: string;
  label: string;
  geometry: "BBOX";
  bbox: [number, number, number, number];
  cells_used: number;
  area_km2: number;
}

export interface ContractSeason {
  code: string;
  year_label: string;
  months: number[];
  aggregation: string;
}

export interface ContractInference {
  status: "unavailable";
  p_value: null;
  ci: null;
  method: null;
}

export interface ContractTrend {
  /** Full-period Sen slope per decade from the tile's precomputed `s`. */
  sen_slope_per_decade: number | null;
  /**
   * Median-based intercept at calendar year 0
   * (`median(y) - slopePerYear * median(x)`, scipy convention), or null.
   */
  intercept: number | null;
  method: string;
  slope_units: string;
  n_valid: number;
  period: [number, number] | null;
  inference: ContractInference;
}

export interface ContractValidation {
  reference: string;
  status: "unchecked-same-method";
  notes: string;
}

export interface ContractResult {
  id: string;
  variable: string;
  units: string;
  source: ContractSource;
  region: ContractRegion;
  season: ContractSeason;
  years: number[];
  values: (number | null)[];
  coverage: number[];
  anomaly_baseline: null;
  geometry_file: string | null;
  template_summary: string;
  trend: ContractTrend;
  validation: ContractValidation;
  generated: string;
  code_version: string;
}

export interface CellSeriesRequest {
  /** Click longitude in decimal degrees (normalised by the lookup). */
  lon: number;
  /** Click latitude in decimal degrees (clamped by the lookup). */
  lat: number;
  /** Variable directory slug, e.g. `precip`, or contract name, e.g. `precipitation`. */
  variable: string;
  /** Season code, e.g. `DJF`. */
  season: string;
}

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface CellSeriesOptions {
  /** Base path for grid files. Defaults to `data/artifacts/grid`. */
  basePath?: string;
  /** index.json already loaded at startup. If omitted it is fetched and cached. */
  index?: GridIndex;
  /** Injectable fetch for tests or non-browser hosts. Defaults to globalThis.fetch. */
  fetchImpl?: FetchLike;
  /** Injectable clock for the `generated` timestamp (tests). */
  now?: () => string;
}

export type NoDataReason =
  | "fetch-unavailable"
  | "index-unavailable"
  | "index-invalid"
  | "unknown-variable"
  | "unknown-season"
  | "no-years"
  | "no-tile"
  | "no-cell"
  | "all-fill"
  | "fetch-failed"
  | "bad-tile";

export type CellSeriesOutcome =
  | {
      status: "ok";
      result: ContractResult;
      cellId: string;
      tileKey: string;
      tileUrl: string;
    }
  | {
      status: "no-data";
      reason: NoDataReason;
      message: string;
      cellId: string;
      tileKey: string;
      tileUrl: string | null;
    };

interface CellLocation {
  lonNorm: number;
  latClamped: number;
  cellLonSw: number;
  cellLatSw: number;
  cellLon: number;
  cellLat: number;
  cellId: string;
  tileLon: number;
  tileLat: number;
  tileKey: string;
}

const indexCache = new Map<string, Promise<GridIndex>>();

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGridIndex(value: unknown): value is GridIndex {
  return (
    isObject(value) &&
    isObject(value.variables) &&
    isObject(value.seasons) &&
    typeof value.fill_int16 === "number"
  );
}

function normaliseBasePath(basePath: string): string {
  return basePath.replace(/\/+$/, "");
}

function joinUrl(basePath: string, path: string): string {
  return basePath.length === 0 ? path : `${basePath}/${path}`;
}

function locateCell(lon: number, lat: number): CellLocation {
  const lonNorm = ((((lon + 180) % 360) + 360) % 360) - 180;
  const latClamped = Math.min(89.999999, Math.max(-90.0, lat));
  const cellLonSw = Math.floor(lonNorm);
  const cellLatSw = Math.floor(latClamped);
  const cellLon = cellLonSw + 0.5;
  const cellLat = cellLatSw + 0.5;
  const tileLon = Math.floor(cellLonSw / TILE_SIZE_DEG) * TILE_SIZE_DEG;
  const tileLat = Math.floor(cellLatSw / TILE_SIZE_DEG) * TILE_SIZE_DEG;

  return {
    lonNorm,
    latClamped,
    cellLonSw,
    cellLatSw,
    cellLon,
    cellLat,
    // docs/GRID_FORMAT.md section 3.3: latitude first, always one decimal.
    cellId: `cell_${cellLat.toFixed(1)}_${cellLon.toFixed(1)}`,
    tileLon,
    tileLat,
    // docs/GRID_FORMAT.md section 3.3: longitude first, integers, no padding.
    tileKey: `${tileLon}_${tileLat}`,
  };
}

function decodeInt16(
  q: unknown,
  scale: number,
  offset: number,
  decimals: number,
  fillInt16: number,
): number | null {
  if (typeof q !== "number" || !Number.isFinite(q)) return null;
  if (q === fillInt16) return null;
  return Number((q * scale + offset).toFixed(decimals));
}

function parseTile(payload: unknown): RawTile | null {
  if (!isObject(payload)) return null;
  if (typeof payload.v_slug !== "string" || typeof payload.season !== "string") {
    return null;
  }
  const tile = payload.tile;
  if (
    !Array.isArray(tile) ||
    tile.length !== 2 ||
    typeof tile[0] !== "number" ||
    typeof tile[1] !== "number"
  ) {
    return null;
  }
  if (!isObject(payload.cells)) return null;
  return {
    v_slug: payload.v_slug,
    season: payload.season,
    tile: [tile[0], tile[1]],
    cells: payload.cells,
  };
}

function parseCell(value: unknown): RawTileCell | null {
  if (!isObject(value)) return null;
  if (!Array.isArray(value.v)) return null;
  if (
    value.c !== undefined &&
    typeof value.c !== "number" &&
    !Array.isArray(value.c)
  ) {
    return null;
  }
  return {
    s: value.s,
    v: value.v,
    c: value.c,
  };
}

function isVariableMeta(value: unknown): value is GridVariableMeta {
  if (!isObject(value)) return false;
  const numericFields = [
    "scale",
    "offset",
    "decimals",
    "slope_scale",
    "slope_offset",
    "slope_decimals",
    "coverage_scale",
    "coverage_offset",
    "coverage_decimals",
  ];
  if (!numericFields.every((field) => typeof value[field] === "number")) {
    return false;
  }
  if (typeof value.variable !== "string" || typeof value.units !== "string") {
    return false;
  }
  if (typeof value.slope_units !== "string") return false;
  if (!isObject(value.source)) return false;
  if (!isObject(value.years_by_season)) return false;
  return true;
}

function isSeasonMeta(value: unknown): value is GridSeasonMeta {
  return (
    isObject(value) &&
    typeof value.code === "string" &&
    typeof value.year_label === "string" &&
    Array.isArray(value.months) &&
    typeof value.aggregation === "string"
  );
}

function noData(
  reason: NoDataReason,
  message: string,
  location: CellLocation,
  tileUrl: string | null,
): CellSeriesOutcome {
  return {
    status: "no-data",
    reason,
    message,
    cellId: location.cellId,
    tileKey: location.tileKey,
    tileUrl,
  };
}

async function loadIndex(
  basePath: string,
  fetchImpl: FetchLike,
): Promise<GridIndex> {
  const cached = indexCache.get(basePath);
  if (cached) return cached;

  const request = (async () => {
    const response = await fetchImpl(joinUrl(basePath, "index.json"));
    if (!response.ok) {
      throw new Error(`index.json returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (!isGridIndex(payload)) {
      throw new Error("index.json has an unexpected shape");
    }
    return payload;
  })();

  indexCache.set(basePath, request);
  try {
    return await request;
  } catch (error) {
    indexCache.delete(basePath);
    throw error;
  }
}

function cellAreaKm2(cellLatSw: number): number {
  const south = (cellLatSw * Math.PI) / 180;
  const north = ((cellLatSw + 1) * Math.PI) / 180;
  const area =
    EARTH_RADIUS_KM *
    EARTH_RADIUS_KM *
    (Math.PI / 180) *
    (Math.sin(north) - Math.sin(south));
  return Number(area.toFixed(1));
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  const suffix = value < 0 ? negative : positive;
  return `${Math.abs(value).toFixed(1)}\u00b0${suffix}`;
}

function formatSigned(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return value >= 0 ? `+${fixed}` : fixed;
}

function buildTemplateSummary(
  cellId: string,
  label: string,
  season: string,
  variableName: string,
  slope: number | null,
  slopeUnits: string,
  slopeDecimals: number,
  period: [number, number] | null,
  nValid: number,
): string {
  const periodText =
    period === null ? "no valid years" : `${period[0]}-${period[1]}, n=${nValid}`;
  const slopeText =
    slope === null
      ? "no descriptive Theil-Sen slope available"
      : `a descriptive Theil-Sen slope of ${formatSigned(slope, slopeDecimals)} ${slopeUnits}`;
  return (
    `For ${cellId} (${label}) in ${season} (${periodText}), ` +
    `${variableName} has ${slopeText} ` +
    `(inference status: unavailable; validation: unchecked-same-method).`
  );
}

/**
 * Fetch and decode the 1-degree cell series for a clicked lon/lat.
 *
 * This is the only fetch entry point the frontend seriesSource needs. Pass the
 * index.json object the app already loaded (recommended) or let this function
 * load it once per base path.
 */
export async function fetchCellSeries(
  request: CellSeriesRequest,
  options: CellSeriesOptions = {},
): Promise<CellSeriesOutcome> {
  if (!Number.isFinite(request.lon) || !Number.isFinite(request.lat)) {
    throw new RangeError("click lon and lat must be finite numbers");
  }
  if (!request.variable || !request.season) {
    throw new RangeError("variable and season are required");
  }

  const location = locateCell(request.lon, request.lat);
  const basePath = normaliseBasePath(options.basePath ?? DEFAULT_BASE_PATH);
  const fetchImpl =
    options.fetchImpl ??
    (typeof globalThis.fetch === "function"
      ? (globalThis.fetch.bind(globalThis) as FetchLike)
      : null);

  if (fetchImpl === null) {
    return noData(
      "fetch-unavailable",
      "No fetch implementation is available to load grid tiles.",
      location,
      null,
    );
  }

  let index: GridIndex;
  if (options.index) {
    index = options.index;
  } else {
    try {
      index = await loadIndex(basePath, fetchImpl);
    } catch {
      return noData(
        "index-unavailable",
        "Could not load data/artifacts/grid/index.json.",
        location,
        null,
      );
    }
  }

  if (!isGridIndex(index)) {
    return noData(
      "index-invalid",
      "The grid index has an unexpected shape.",
      location,
      null,
    );
  }

  const slug = isVariableMeta(index.variables[request.variable])
    ? request.variable
    : Object.keys(index.variables).find(
        (key) => index.variables[key]?.variable === request.variable,
      );
  if (slug === undefined) {
    return noData(
      "unknown-variable",
      `Unknown grid variable "${request.variable}".`,
      location,
      null,
    );
  }

  const variableMeta = index.variables[slug];
  if (!isVariableMeta(variableMeta)) {
    return noData(
      "index-invalid",
      `Grid metadata for "${slug}" is incomplete.`,
      location,
      null,
    );
  }

  const seasonMeta = index.seasons[request.season];
  if (!isSeasonMeta(seasonMeta)) {
    return noData(
      "unknown-season",
      `Unknown season "${request.season}".`,
      location,
      null,
    );
  }

  const years = variableMeta.years_by_season[request.season];
  if (!Array.isArray(years) || years.length === 0) {
    return noData(
      "no-years",
      `No year vector is defined for ${slug}/${request.season}.`,
      location,
      null,
    );
  }

  const tileUrl = joinUrl(
    basePath,
    `${slug}/${request.season}/${location.tileKey}.json`,
  );

  const availableTiles = variableMeta.available_tiles;
  if (Array.isArray(availableTiles) && !availableTiles.includes(location.tileKey)) {
    return noData(
      "no-tile",
      "No data (ocean or outside sensor domain)",
      location,
      tileUrl,
    );
  }

  let payload: unknown;
  try {
    const response = await fetchImpl(tileUrl);
    if (response.status === 404) {
      return noData(
        "no-tile",
        "No data (ocean or outside sensor domain)",
        location,
        tileUrl,
      );
    }
    if (!response.ok) {
      return noData(
        "fetch-failed",
        `Could not load this tile (HTTP ${response.status}).`,
        location,
        tileUrl,
      );
    }
    payload = await response.json();
  } catch {
    return noData(
      "fetch-failed",
      "Could not load this tile.",
      location,
      tileUrl,
    );
  }

  const tile = parseTile(payload);
  if (
    tile === null ||
    tile.v_slug !== slug ||
    tile.season !== request.season ||
    tile.tile[0] !== location.tileLon ||
    tile.tile[1] !== location.tileLat
  ) {
    return noData(
      "bad-tile",
      "The tile file has an unexpected format.",
      location,
      tileUrl,
    );
  }

  if (!(location.cellId in tile.cells)) {
    return noData(
      "no-cell",
      "No data for this 1\u00b0 cell",
      location,
      tileUrl,
    );
  }

  const cell = parseCell(tile.cells[location.cellId]);
  if (cell === null) {
    return noData(
      "bad-tile",
      "The clicked cell has an unexpected format.",
      location,
      tileUrl,
    );
  }

  const fillInt16 =
    typeof index.fill_int16 === "number" ? index.fill_int16 : DEFAULT_FILL_INT16;

  const values: (number | null)[] = years.map((_, indexInSeries) =>
    decodeInt16(
      cell.v[indexInSeries],
      variableMeta.scale,
      variableMeta.offset,
      variableMeta.decimals,
      fillInt16,
    ),
  );

  const validValues: number[] = [];
  const validYears: number[] = [];
  values.forEach((value, indexInSeries) => {
    if (value === null) return;
    validValues.push(value);
    validYears.push(years[indexInSeries] as number);
  });

  if (validValues.length === 0) {
    return noData(
      "all-fill",
      "No data for this 1\u00b0 cell",
      location,
      tileUrl,
    );
  }

  const coverage: number[] = years.map((_, indexInSeries) => {
    const valid = values[indexInSeries] !== null;
    if (Array.isArray(cell.c)) {
      if (!valid) return 0;
      return (
        decodeInt16(
          cell.c[indexInSeries],
          variableMeta.coverage_scale,
          variableMeta.coverage_offset,
          variableMeta.coverage_decimals,
          fillInt16,
        ) ?? 0
      );
    }
    const decoded = decodeInt16(
      cell.c,
      variableMeta.coverage_scale,
      variableMeta.coverage_offset,
      variableMeta.coverage_decimals,
      fillInt16,
    );
    return valid && decoded !== null ? decoded : 0;
  });

  const slope = decodeInt16(
    cell.s,
    variableMeta.slope_scale,
    variableMeta.slope_offset,
    variableMeta.slope_decimals,
    fillInt16,
  );
  const period: [number, number] = [
    validYears[0] as number,
    validYears[validYears.length - 1] as number,
  ];
  const intercept =
    slope === null
      ? null
      : median(validValues) -
        (slope / 10) * median(validYears);

  const regionLabel = `${formatCoordinate(location.cellLat, "N", "S")}, ${formatCoordinate(
    location.cellLon,
    "E",
    "W",
  )} (1\u00b0 cell)`;

  const result: ContractResult = {
    id: `${slug}_${location.cellId}_${request.season}`,
    variable: variableMeta.variable,
    units: variableMeta.units,
    source: { ...variableMeta.source },
    region: {
      id: location.cellId,
      label: regionLabel,
      geometry: "BBOX",
      bbox: [
        location.cellLonSw,
        location.cellLatSw,
        location.cellLonSw + 1,
        location.cellLatSw + 1,
      ],
      cells_used: 1,
      area_km2: cellAreaKm2(location.cellLatSw),
    },
    season: {
      code: seasonMeta.code,
      year_label: seasonMeta.year_label,
      months: [...seasonMeta.months],
      aggregation: seasonMeta.aggregation,
    },
    years: [...years],
    values,
    coverage,
    anomaly_baseline: null,
    geometry_file: null,
    template_summary: buildTemplateSummary(
      location.cellId,
      regionLabel,
      request.season,
      variableMeta.variable,
      slope,
      variableMeta.slope_units,
      variableMeta.slope_decimals,
      period,
      validValues.length,
    ),
    trend: {
      sen_slope_per_decade: slope,
      intercept: intercept === null ? null : Number(intercept.toFixed(6)),
      method: "Sen",
      slope_units: variableMeta.slope_units,
      n_valid: validValues.length,
      period,
      inference: {
        status: "unavailable",
        p_value: null,
        ci: null,
        method: null,
      },
    },
    validation: {
      reference: "none",
      status: "unchecked-same-method",
      notes:
        "Clicked 1-degree cell; same method as other cells, not individually checked against an external reference.",
    },
    generated: options.now ? options.now() : new Date().toISOString(),
    code_version: "grid-int16-v1",
  };

  return {
    status: "ok",
    result,
    cellId: location.cellId,
    tileKey: location.tileKey,
    tileUrl,
  };
}
