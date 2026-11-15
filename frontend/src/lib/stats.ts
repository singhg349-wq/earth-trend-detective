/**
 * Descriptive Sen (Theil-Sen) slope helpers.
 *
 * The estimator is the median of all pairwise slopes
 * `(y_j - y_i) / (x_j - x_i)` over valid observations, exactly as
 * `scipy.stats.theilslopes` computes it. The returned slope is exposed both
 * per year and per decade (calendar years are the x axis).
 *
 * No inference is produced here: no p value, confidence interval or
 * significance verdict. `docs/CONTRACT.md` keeps inference `unavailable`.
 */

/** Default fill marker used by the int16 grid tiles (see docs/GRID_FORMAT.md). */
const DEFAULT_FILL_VALUES: readonly number[] = [-32768];

export interface SenSlopeOptions {
  /**
   * Numeric values treated as missing in addition to null, undefined, NaN and
   * infinities. Defaults to the grid int16 fill marker `-32768`.
   */
  fillValues?: readonly number[];
}

export interface SenSlopeResult {
  /** Median pairwise slope in series units per calendar year, or null. */
  slopePerYear: number | null;
  /** Median pairwise slope in series units per decade, or null. */
  slopePerDecade: number | null;
  /**
   * Median-based intercept at calendar year 0:
   * `median(y) - slopePerYear * median(x)` (the scipy.stats.theilslopes
   * convention), or null when no slope could be computed.
   */
  intercept: number | null;
  /** Number of valid (year, value) observations used. */
  n: number;
  /** First and last valid year, or null when there are no valid years. */
  period: [number, number] | null;
}

function emptyResult(n = 0, period: [number, number] | null = null): SenSlopeResult {
  return {
    slopePerYear: null,
    slopePerDecade: null,
    intercept: null,
    n,
    period,
  };
}

function isMissing(value: unknown, fillValues: readonly number[]): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "number") return true;
  if (!Number.isFinite(value)) return true;
  return fillValues.includes(value);
}

/** Median of a non-empty numeric array (average of the two middles when even). */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new RangeError("median requires at least one value");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] as number;
  return ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function normaliseZero(value: number): number {
  return value === 0 ? 0 : value;
}

function computeSen(
  years: readonly number[],
  values: readonly (number | null | undefined)[],
  options: SenSlopeOptions,
): SenSlopeResult {
  const fillValues = options.fillValues ?? DEFAULT_FILL_VALUES;
  const xs: number[] = [];
  const ys: number[] = [];

  const length = Math.min(years.length, values.length);
  for (let i = 0; i < length; i += 1) {
    const year = years[i];
    const value = values[i];
    if (typeof year !== "number" || !Number.isFinite(year)) continue;
    if (isMissing(value, fillValues)) continue;
    xs.push(year);
    ys.push(value as number);
  }

  if (xs.length === 0) return emptyResult();
  const period: [number, number] = [Math.min(...xs), Math.max(...xs)];
  if (xs.length < 2) return emptyResult(xs.length, period);

  const slopes: number[] = [];
  for (let i = 0; i < xs.length; i += 1) {
    for (let j = i + 1; j < xs.length; j += 1) {
      const dx = (xs[j] as number) - (xs[i] as number);
      if (dx === 0) continue;
      slopes.push(((ys[j] as number) - (ys[i] as number)) / dx);
    }
  }

  if (slopes.length === 0) return emptyResult(xs.length, period);

  const slopePerYear = normaliseZero(median(slopes));
  const intercept = normaliseZero(median(ys) - slopePerYear * median(xs));

  return {
    slopePerYear,
    slopePerDecade: normaliseZero(slopePerYear * 10),
    intercept,
    n: xs.length,
    period,
  };
}

/**
 * Full-series Sen slope. Fill values (`-32768` by default), nulls and NaN are
 * skipped without renumbering the remaining years.
 */
export function senSlope(
  years: readonly number[],
  values: readonly (number | null | undefined)[],
  options: SenSlopeOptions = {},
): SenSlopeResult {
  return computeSen(years, values, options);
}

/**
 * Sen slope for the sub-period `[startYear, endYear]` (inclusive). Only years
 * inside the window are used; pairwise slopes still divide by the true
 * calendar-year gap, never by an index gap. This is the browser-side period
 * mode used by docs/GRID_FORMAT.md section 5.3.
 */
export function senSlopeForPeriod(
  years: readonly number[],
  values: readonly (number | null | undefined)[],
  startYear: number,
  endYear: number,
  options: SenSlopeOptions = {},
): SenSlopeResult {
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    throw new RangeError("period bounds must be finite years");
  }
  if (startYear > endYear) {
    throw new RangeError(`period start ${startYear} is after end ${endYear}`);
  }

  const periodYears: number[] = [];
  const periodValues: (number | null | undefined)[] = [];
  const length = Math.min(years.length, values.length);
  for (let i = 0; i < length; i += 1) {
    const year = years[i];
    if (typeof year !== "number" || year < startYear || year > endYear) continue;
    periodYears.push(year);
    periodValues.push(values[i]);
  }

  return computeSen(periodYears, periodValues, options);
}
