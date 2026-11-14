/**
 * Two-period comparison helper.
 *
 * This module deliberately reports only the two individual descriptive
 * Sen slopes plus their date ranges, overlap and counts. It never computes a
 * slope difference, interval or significance claim. Build gates require
 * "individual trend estimates only" until a validated inference method is
 * chosen, so there is no difference field to display by accident.
 */

import {
  senSlopeForPeriod,
  type SenSlopeOptions,
  type SenSlopeResult,
} from "./stats";

const DEFAULT_FILL_VALUES: readonly number[] = [-32768];

export interface PeriodBounds {
  /** First calendar year, inclusive. */
  startYear: number;
  /** Last calendar year, inclusive. */
  endYear: number;
}

export interface PeriodComparisonEstimate {
  /** The requested inclusive year window `[startYear, endYear]`. */
  requested: [number, number];
  /** First and last year that actually contributed a valid value, or null. */
  dataPeriod: [number, number] | null;
  /** Number of valid observations inside the requested window. */
  n: number;
  /** Individual descriptive estimate for this period. */
  estimate: SenSlopeResult;
}

export interface PeriodOverlap {
  /** First calendar year shared by both requested windows, or null. */
  startYear: number | null;
  /** Last calendar year shared by both requested windows, or null. */
  endYear: number | null;
  /** Calendar years shared by both requested windows. */
  years: number[];
  /** Number of calendar years in the overlap. */
  count: number;
  /** Overlap years that have a valid observation in the series. */
  matchingObservations: number;
}

export interface PeriodSupport {
  /** Both requested windows span the same number of calendar years. */
  equalLength: boolean;
  /** Both periods have the same number of valid observations. */
  equalCount: boolean;
  /** The requested windows share at least one calendar year. */
  hasOverlap: boolean;
  /** Plain-language labels describing unequal support and overlap. */
  labels: string[];
}

export interface PeriodComparison {
  periods: {
    a: [number, number];
    b: [number, number];
  };
  a: PeriodComparisonEstimate;
  b: PeriodComparisonEstimate;
  overlap: PeriodOverlap;
  counts: {
    a: number;
    b: number;
    /** Overlap years with a valid observation (matching observations). */
    overlap: number;
  };
  support: PeriodSupport;
  /** Fixed reminder that only individual descriptive estimates are shown. */
  note: string;
}

const INDIVIDUAL_ONLY_NOTE =
  "Individual descriptive estimates only. No slope difference, interval or significance claim is made.";

function assertPeriod(period: PeriodBounds, label: string): void {
  if (!Number.isInteger(period.startYear) || !Number.isInteger(period.endYear)) {
    throw new RangeError(`${label} bounds must be integer years`);
  }
  if (period.startYear > period.endYear) {
    throw new RangeError(
      `${label} start ${period.startYear} is after end ${period.endYear}`,
    );
  }
}

function isMissingValue(value: unknown, fillValues: readonly number[]): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "number") return true;
  if (!Number.isFinite(value)) return true;
  return fillValues.includes(value);
}

function estimatePeriod(
  years: readonly number[],
  values: readonly (number | null | undefined)[],
  period: PeriodBounds,
  options: SenSlopeOptions,
): PeriodComparisonEstimate {
  const estimate = senSlopeForPeriod(
    years,
    values,
    period.startYear,
    period.endYear,
    options,
  );
  return {
    requested: [period.startYear, period.endYear],
    dataPeriod: estimate.period,
    n: estimate.n,
    estimate,
  };
}

/**
 * Compare two periods for one series. Returns the two individual Sen slope
 * estimates, their actual date support, the overlap and counts. No
 * slope-difference estimate is produced.
 */
export function comparePeriods(
  years: readonly number[],
  values: readonly (number | null | undefined)[],
  periodA: PeriodBounds,
  periodB: PeriodBounds,
  options: SenSlopeOptions = {},
): PeriodComparison {
  assertPeriod(periodA, "period A");
  assertPeriod(periodB, "period B");

  const a = estimatePeriod(years, values, periodA, options);
  const b = estimatePeriod(years, values, periodB, options);
  const fillValues = options.fillValues ?? DEFAULT_FILL_VALUES;
  const validYears = new Set<number>();
  const length = Math.min(years.length, values.length);
  for (let i = 0; i < length; i += 1) {
    const year = years[i];
    if (typeof year !== "number" || !Number.isFinite(year)) continue;
    if (isMissingValue(values[i], fillValues)) continue;
    validYears.add(year);
  }

  const overlapStart = Math.max(periodA.startYear, periodB.startYear);
  const overlapEnd = Math.min(periodA.endYear, periodB.endYear);
  const overlapYears: number[] = [];
  if (overlapStart <= overlapEnd) {
    for (let year = overlapStart; year <= overlapEnd; year += 1) {
      overlapYears.push(year);
    }
  }
  const matchingObservations = overlapYears.filter((year) =>
    validYears.has(year),
  ).length;

  const equalLength =
    periodA.endYear - periodA.startYear === periodB.endYear - periodB.startYear;
  const equalCount = a.n === b.n;
  const hasOverlap = overlapYears.length > 0;

  const labels: string[] = [INDIVIDUAL_ONLY_NOTE];
  if (hasOverlap) {
    labels.push(
      `Periods overlap for ${overlapYears.length} calendar year(s), ` +
        `${matchingObservations} with valid observations.`,
    );
  } else {
    labels.push("Periods do not overlap.");
  }
  if (!equalLength) {
    labels.push(
      `Period windows are unequal length (${periodA.endYear - periodA.startYear + 1} vs ` +
        `${periodB.endYear - periodB.startYear + 1} calendar years).`,
    );
  }
  if (!equalCount) {
    labels.push(
      `Valid-year support is unequal (n=${a.n} vs n=${b.n}); do not treat the estimates as paired.`,
    );
  }

  return {
    periods: {
      a: [periodA.startYear, periodA.endYear],
      b: [periodB.startYear, periodB.endYear],
    },
    a,
    b,
    overlap: {
      startYear: hasOverlap ? overlapStart : null,
      endYear: hasOverlap ? overlapEnd : null,
      years: overlapYears,
      count: overlapYears.length,
      matchingObservations,
    },
    counts: {
      a: a.n,
      b: b.n,
      overlap: matchingObservations,
    },
    support: {
      equalLength,
      equalCount,
      hasOverlap,
      labels,
    },
    note: INDIVIDUAL_ONLY_NOTE,
  };
}
