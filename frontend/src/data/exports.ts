/**
 * Result resolution, table cells and export payloads.
 *
 * One resolver feeds the on-screen table, the CSV row and the JSON row, so the
 * three cannot disagree. The full period copies the stored artifact's slope,
 * interval and p value. The two half windows use only the descriptive
 * browser Sen slope; their p value and interval are "not computed" by design.
 */

import { formatPValue, readInference, type InferenceView } from './inference';
import { comparisonLabel } from './validation';
import { senSlopeForPeriod } from '../lib/stats';
import type { SeriesDoc } from '../types';

export type PeriodKey = 'full' | 'first-half' | 'second-half';

export const PERIOD_OPTIONS: ReadonlyArray<{ key: PeriodKey; label: string }> = [
  { key: 'full', label: 'Full' },
  { key: 'first-half', label: 'First half' },
  { key: 'second-half', label: 'Second half' },
];

/** Stated wherever a half window is selected. */
export const SUB_PERIOD_SIGNIFICANCE_REASON = 'not computed for sub-period windows';
export const SUB_PERIOD_SIGNIFICANCE_NOTE =
  'Sub-period significance is not computed. The stored p value and 95% interval cover the full period only.';
export const SUB_PERIOD_SLOPE_NOTE =
  'The sub-period Sen slope is a browser descriptive calculation from the stored seasonal values.';
export const FULL_INFERENCE_MISSING_REASON =
  'unavailable: the artifact did not record an inference result';

export interface PeriodWindow {
  key: PeriodKey;
  start: number;
  end: number;
  /** Calendar window, e.g. `1981–2026`. */
  label: string;
}

/**
 * Concept B's split: full stored period, or the two halves of its own year
 * span with the midpoint assigned to the first half.
 */
export function periodWindow(key: PeriodKey, years: readonly number[]): PeriodWindow | null {
  if (years.length === 0) return null;
  const first = years[0];
  const last = years[years.length - 1];
  const mid = Math.floor((first + last) / 2);
  const bounds: Record<PeriodKey, [number, number]> = {
    full: [first, last],
    'first-half': [first, mid],
    'second-half': [mid + 1, last],
  };
  const [start, end] = bounds[key];
  return { key, start, end, label: `${start}–${end}` };
}

export interface ResolvedResult {
  id: string;
  /** Slot chip plus region label, e.g. `A · Sahel`. */
  seriesLabel: string;
  regionLabel: string;
  variable: string;
  units: string;
  seasonCode: string;
  seasonYearLabel: string | null;
  seasonDefinition: string | null;
  period: PeriodWindow;
  origin: 'stored artifact' | 'browser calculation';
  /** Seasons in the window with a finite value. */
  n: number;
  /** Seasons in the window that carry null. */
  missingYears: number[];
  mean: number | null;
  slopePerDecade: number | null;
  intercept: number | null;
  /** Stored inference block, read through the shared normaliser. */
  inference: InferenceView;
  inferenceAvailable: boolean;
  inferenceReason: string;
  validationStatus: string;
  validationText: string | null;
  /** Stored values inside the window, nulls kept as gaps. */
  points: Array<{ year: number; value: number | null }>;
}

export function formatSlope(value: number | null, units: string): string {
  if (value === null || !Number.isFinite(value)) return 'not recorded';
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toFixed(3)} ${units} per decade`;
}

export function formatMean(value: number | null, units: string): string {
  if (value === null || !Number.isFinite(value)) {
    return 'unavailable: no seasons with values in this window';
  }
  return `${value.toFixed(2)} ${units}`;
}

export function formatInterval(value: [number, number] | null, units: string): string {
  if (value === null) return 'not recorded';
  return `${value[0].toFixed(3)} to ${value[1].toFixed(3)} ${units} per decade`;
}

export function resolveResult(doc: SeriesDoc, key: PeriodKey, slot = 'A'): ResolvedResult {
  const period = periodWindow(key, doc.years);
  const points = period
    ? doc.years
        .map((year, index) => ({ year, value: doc.values[index] ?? null }))
        .filter((point) => point.year >= period.start && point.year <= period.end)
    : [];
  if (!period) {
    throw new Error('Cannot resolve a result for a series with no years.');
  }

  const valid = points.filter(
    (point): point is { year: number; value: number } =>
      typeof point.value === 'number' && Number.isFinite(point.value),
  );
  const mean =
    valid.length === 0
      ? null
      : valid.reduce((sum, point) => sum + point.value, 0) / valid.length;
  const inference = readInference(doc.trend?.inference);
  const validationStatus = doc.validation?.status?.trim() || 'not recorded';

  if (key === 'full') {
    const slope = typeof doc.trend?.sen_slope_per_decade === 'number'
      ? doc.trend.sen_slope_per_decade
      : null;
    const inferenceAvailable = inference.status === 'ok';
    return {
      id: doc.id,
      seriesLabel: `${slot} · ${doc.region.label}`,
      regionLabel: doc.region.label,
      variable: doc.variable,
      units: doc.units,
      seasonCode: doc.season.code,
      seasonYearLabel: doc.season.year_label ?? null,
      seasonDefinition: doc.season.aggregation ?? null,
      period,
      origin: 'stored artifact',
      n: valid.length,
      missingYears: points.filter((point) => point.value === null).map((point) => point.year),
      mean,
      slopePerDecade: Number.isFinite(slope) ? slope : null,
      intercept: typeof doc.trend?.intercept === 'number' ? doc.trend.intercept : null,
      inference,
      inferenceAvailable,
      inferenceReason: inferenceAvailable
        ? 'Stored with the artifact for the full period.'
        : FULL_INFERENCE_MISSING_REASON,
      validationStatus,
      validationText: comparisonLabel(doc),
      points,
    };
  }

  const descriptive = senSlopeForPeriod(doc.years, doc.values, period.start, period.end);
  return {
    id: doc.id,
    seriesLabel: `${slot} · ${doc.region.label}`,
    regionLabel: doc.region.label,
    variable: doc.variable,
    units: doc.units,
    seasonCode: doc.season.code,
    seasonYearLabel: doc.season.year_label ?? null,
    seasonDefinition: doc.season.aggregation ?? null,
    period,
    origin: 'browser calculation',
    n: valid.length,
    missingYears: points.filter((point) => point.value === null).map((point) => point.year),
    mean,
    slopePerDecade: descriptive.slopePerDecade,
    intercept: descriptive.intercept,
    inference,
    inferenceAvailable: false,
    inferenceReason: SUB_PERIOD_SIGNIFICANCE_NOTE,
    validationStatus,
    // The artifact's validation covers the full period only; a half window is a
    // fresh browser calculation and must not inherit that claim unscoped.
    validationText:
      comparisonLabel(doc) === null
        ? null
        : `${comparisonLabel(doc)} (full period only)`,
    points,
  };
}

export type ResultColumnKey =
  | 'series'
  | 'units'
  | 'window'
  | 'result origin'
  | 'seasons'
  | 'mean'
  | 'Sen slope per decade'
  | '95% interval'
  | 'p value'
  | 'validation status';

export const RESULT_COLUMNS: ReadonlyArray<{ key: ResultColumnKey; label: string }> = [
  { key: 'series', label: 'series' },
  { key: 'units', label: 'units' },
  { key: 'window', label: 'window' },
  { key: 'result origin', label: 'result origin' },
  { key: 'seasons', label: 'seasons' },
  { key: 'mean', label: 'mean' },
  { key: 'Sen slope per decade', label: 'Sen slope per decade' },
  { key: '95% interval', label: '95% interval' },
  { key: 'p value', label: 'p value' },
  { key: 'validation status', label: 'Method comparison' },
];

function windowText(period: PeriodWindow): string {
  if (period.key === 'full') return `${period.label} (full period)`;
  if (period.key === 'first-half') return `${period.label} (first half)`;
  return `${period.label} (second half)`;
}

function seasonText(row: ResolvedResult): string {
  const parts = [row.seasonCode];
  if (row.seasonYearLabel && row.seasonYearLabel !== 'January year') parts.push(row.seasonYearLabel);
  parts.push(`${row.n} ${row.n === 1 ? 'season' : 'seasons'}`);
  return parts.join(' · ');
}

/** Every cell the table shows; CSV reuses these strings verbatim. */
export function resultTableCells(row: ResolvedResult): Record<ResultColumnKey, string> {
  const subPeriod = row.period.key !== 'full';
  const pValue = subPeriod
    ? SUB_PERIOD_SIGNIFICANCE_REASON
    : row.inferenceAvailable
      ? formatPValue(row.inference.pValue)
      : FULL_INFERENCE_MISSING_REASON;
  const interval = subPeriod
    ? SUB_PERIOD_SIGNIFICANCE_REASON
    : row.inferenceAvailable
      ? formatInterval(row.inference.ci, row.units)
      : FULL_INFERENCE_MISSING_REASON;

  return {
    series: row.seriesLabel,
    units: row.units,
    window: windowText(row.period),
    'result origin': row.origin,
    seasons: seasonText(row),
    mean: formatMean(row.mean, row.units),
    'Sen slope per decade': formatSlope(row.slopePerDecade, row.units),
    '95% interval': interval,
    'p value': pValue,
    'validation status': row.validationText ?? row.validationStatus,
  };
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV of the currently displayed resolved rows, one header row plus one row per series. */
export function buildResultCsv(rows: readonly ResolvedResult[]): string {
  const lines = [RESULT_COLUMNS.map((column) => csvCell(column.label)).join(',')];
  for (const row of rows) {
    const cells = resultTableCells(row);
    lines.push(RESULT_COLUMNS.map((column) => csvCell(cells[column.key])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export interface ResultExportInput {
  mode: 'explore' | 'compare';
  period: PeriodKey;
  exportedAt: string;
  rows: readonly ResolvedResult[];
}

export const EXPORT_SCHEMA = 'earth-trend-detective-result-export';

/**
 * JSON mirror of the drawer: the same resolved rows, the same window, the same
 * provenance. `p_value` and `interval_95_per_decade` stay null for half
 * windows because those quantities are not computed there.
 */
export function buildResultJson(input: ResultExportInput) {
  const firstPeriod = input.rows[0]?.period ?? null;
  return {
    schema: EXPORT_SCHEMA,
    version: 1,
    exported_at: input.exportedAt,
    mode: input.mode,
    period: firstPeriod
      ? { key: firstPeriod.key, start: firstPeriod.start, end: firstPeriod.end, label: firstPeriod.label }
      : { key: input.period, start: null, end: null, label: null },
    columns: RESULT_COLUMNS.map((column) => column.label),
    note:
      'Rows are copied from stored artifacts. A half-window Sen slope is a browser descriptive calculation; its p value and interval are not computed.',
    rows: input.rows.map((row) => ({
      series: row.seriesLabel,
      series_id: row.id,
      region_label: row.regionLabel,
      variable: row.variable,
      units: row.units,
      season: {
        code: row.seasonCode,
        year_label: row.seasonYearLabel,
        definition: row.seasonDefinition,
      },
      window: {
        key: row.period.key,
        start: row.period.start,
        end: row.period.end,
        label: row.period.label,
      },
      result_origin: row.origin,
      seasons_with_values: row.n,
      missing_years: row.missingYears,
      mean: row.mean,
      sen_slope_per_decade: row.slopePerDecade,
      interval_95_per_decade: row.inferenceAvailable ? row.inference.ci : null,
      p_value: row.inferenceAvailable ? row.inference.pValue : null,
      inference: {
        available: row.inferenceAvailable,
        status: row.inference.status,
        method: row.inference.method,
        n: row.inference.n,
        note: row.inferenceReason,
      },
      validation: {
        status: row.validationStatus,
        label: row.validationText,
      },
      source: {
        product: row.variable,
        units: row.units,
      },
      values: row.points.map((point) => ({ year: point.year, value: point.value })),
    })),
  };
}

export function serializeResultJson(input: ResultExportInput): string {
  return `${JSON.stringify(buildResultJson(input), null, 2)}\n`;
}

/** Trigger a browser download. Returns false when the environment refuses it. */
export function downloadText(filename: string, text: string, mime: string): boolean {
  try {
    const blob = new Blob([text], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
