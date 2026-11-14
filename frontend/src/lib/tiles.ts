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
 *   5. copies the optional per-cell inference block and FDR flag when the tile
 *      carries them,
 *   6. returns a CONTRACT.md-shaped result with
 *      `validation.status = "unchecked-same-method"`.
 *
 * Expected no-data cases (missing tile, ocean/land-only gap, cell absent from a
 * partial tile) are returned as `{ status: "no-data", reason, message }` and do
 * not throw.
 *
 * Tile cells may optionally carry two forward-compatible fields (W3 owns the
 * final schema proposal):
 *
 * - `inference`: an object with the same field names as `trend.inference`
 *   (status, p_value, ci, method, strict_check_pass, strict_check_p, lag1,
 *   caution, ci_note, n). Values are already in display units (slope per
 *   decade), not int16-scaled. A block that is malformed, claims `ok` below
 *   n = 8, or carries a p-value outside [0, 1] or a reversed interval is
 *   replaced by the unavailable shape instead of showing untrustworthy numbers.
 * - `fdr_significant`: boolean Benjamini-Hochberg flag at q = 0.10, copied to
 *   `trend.fdr_significant`; any other type becomes null.
 *
 * Neither field is required. When absent, inference is `unavailable` and the
 * FDR flag is null, exactly as the base contract behaves today.
 */

import { median, senSlope } from "./stats";
import type {
  CellSeriesOutcome,
  ContractResult,
  NoDataReason,
  TrendInference,
} from "./types";

export type {
  CellResult,
  CellSeriesOutcome,
  ContractInference,
  ContractRegion,
  ContractResult,
  ContractSeason,
  ContractSource,
  ContractTrend,
  ContractValidation,
  InferenceStatus,
  NoDataReason,
  TrendInference,
} from "./types";

const DEFAULT_BASE_PATH = "data/artifacts/grid";
const TILE_SIZE_DEG = 10;
const EARTH_RADIUS_KM = 6371.0088;
const DEFAULT_FILL_INT16 = -32768;
/**
 * docs/GRID_FORMAT.md section 5.3: a cell needs at least 10 valid years before
 * a full-period Sen slope is stored. The same threshold gates the fallback
 * below, so a browser-computed slope never appears where the writer would have
 * written fill on purpose.
 */
const SLOPE_MIN_VALID_YEARS = 10;

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
  /**
   * `"ALL_648"`, one flat list for every season, or the per-season map the
   * real pipeline writes (`{ "DJF": ["-80_-10", ...], ... }`). A missing season
   * entry means "not known here", so the fetch is attempted and a 404 still
   * becomes a no-data result.
   */
  available_tiles?: "ALL_648" | string[] | Record<string, string[]>;
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
  /** Optional contract-shaped inference block; see the module comment. */
  inference?: unknown;
  /** Optional Benjamini-Hochberg q = 0.10 flag for map hatching. */
  fdr_significant?: unknown;
}

interface RawTile {
  v_slug: string;
  season: string;
  tile: [number, number];
  cells: Record<string, unknown>;
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

/** Fixed label for the Sen slope interval; assumptions are in the wording. */
export const SLOPE_CI_NOTE =
  "95% slope interval (assumes independent years; narrower than true uncertainty when years correlate)";

/** Main inference test description used when a tile does not name one. */
export const INFERENCE_METHOD = "MK + Hamed-Rao (3 lags)";

/** Show the caution badge when the detrended lag-1 correlation reaches this. */
export const INFERENCE_CAUTION_LAG1 = 0.3;

/** Below this many valid years the agreed science rule reports unavailable. */
export const INFERENCE_MIN_OBSERVATIONS = 8;

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

/**
 * Whether `index.json` says a tile exists for this season.
 *
 * The format allows three spellings: `"ALL_648"`, a flat string array, or the
 * per-season object the real pipeline writes. If the season has no entry we
 * return true and let the HTTP request decide; a 404 is already handled as a
 * clean no-data result.
 */
function isTileListed(
  available: GridVariableMeta["available_tiles"],
  season: string,
  tileKey: string,
): boolean {
  if (available === undefined || available === "ALL_648") return true;
  if (Array.isArray(available)) return available.includes(tileKey);
  if (isObject(available)) {
    const seasonTiles = available[season];
    if (Array.isArray(seasonTiles)) return seasonTiles.includes(tileKey);
  }
  return true;
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
    inference: value.inference,
    fdr_significant: value.fdr_significant,
  };
}

function unavailableInference(): TrendInference {
  return {
    status: "unavailable",
    p_value: null,
    ci: null,
    method: null,
    strict_check_pass: null,
    strict_check_p: null,
    lag1: null,
    caution: false,
    ci_note: SLOPE_CI_NOTE,
    n: null,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isProbability(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value <= 1;
}

/**
 * Copy one optional tile inference block into the contract shape.
 *
 * A block is only accepted with `status: "ok"` when every displayed number is
 * usable: a p-value in [0, 1], an ordered finite `ci` pair, a finite lag-1
 * value, and at least `INFERENCE_MIN_OBSERVATIONS` valid years. Anything else
 * becomes `unavailable`, so the UI never shows half-valid inference.
 *
 * `caution` is always derived from `lag1` (>= 0.3) and never trusted from the
 * file, so it cannot disagree with the number shown beside the badge.
 */
function parseInference(raw: unknown, nValid: number): TrendInference {
  if (!isObject(raw) || raw.status !== "ok") return unavailableInference();
  if (!isProbability(raw.p_value)) return unavailableInference();

  const ci = raw.ci;
  if (!Array.isArray(ci) || ci.length !== 2) return unavailableInference();
  const low = ci[0];
  const high = ci[1];
  if (!isFiniteNumber(low) || !isFiniteNumber(high) || low > high) {
    return unavailableInference();
  }
  if (!isFiniteNumber(raw.lag1)) return unavailableInference();

  const n = isFiniteNumber(raw.n) ? Math.round(raw.n) : nValid;
  if (n < INFERENCE_MIN_OBSERVATIONS) return unavailableInference();

  const method =
    typeof raw.method === "string" && raw.method.trim() !== ""
      ? raw.method
      : INFERENCE_METHOD;
  const ciNote =
    typeof raw.ci_note === "string" && raw.ci_note.trim() !== ""
      ? raw.ci_note
      : SLOPE_CI_NOTE;

  return {
    status: "ok",
    p_value: raw.p_value,
    ci: [low, high],
    method,
    strict_check_pass:
      typeof raw.strict_check_pass === "boolean"
        ? raw.strict_check_pass
        : null,
    strict_check_p: isProbability(raw.strict_check_p)
      ? raw.strict_check_p
      : null,
    lag1: raw.lag1,
    caution: raw.lag1 >= INFERENCE_CAUTION_LAG1,
    ci_note: ciNote,
    n,
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
  inference: TrendInference,
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
    `(inference status: ${inference.status}; validation: unchecked-same-method).`
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
  if (!isTileListed(availableTiles, request.season, location.tileKey)) {
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

  const storedSlope = decodeInt16(
    cell.s,
    variableMeta.slope_scale,
    variableMeta.slope_offset,
    variableMeta.slope_decimals,
    fillInt16,
  );
  // Some real artifacts carry `s: -32768` in every cell even when the values
  // run for 42 years. The stored slope is the Sen slope over the decoded series
  // (docs/GRID_FORMAT.md section 5.3), so recomputing that same estimator from
  // the decoded values restores the documented number instead of showing no
  // trend. The 10-year gate is the section 5.3 threshold for storing a slope.
  const slope =
    storedSlope === null && validValues.length >= SLOPE_MIN_VALID_YEARS
      ? senSlope(validYears, validValues).slopePerDecade
      : storedSlope;
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

  const inference = parseInference(cell.inference, validValues.length);
  const fdrSignificant =
    typeof cell.fdr_significant === "boolean" ? cell.fdr_significant : null;

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
      inference,
    ),
    trend: {
      sen_slope_per_decade: slope,
      intercept: intercept === null ? null : Number(intercept.toFixed(6)),
      method: "Sen",
      slope_units: variableMeta.slope_units,
      n_valid: validValues.length,
      period,
      inference,
      fdr_significant: fdrSignificant,
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
