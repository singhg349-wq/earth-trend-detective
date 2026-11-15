import { metricById } from './metrics';
/**
 * Ranking for the right-hand region list.
 *
 * Regions are ordered by statistical significance: the smallest Hamed–Rao
 * Mann–Kendall p-value first. Regions whose artifact recorded no inference
 * result come last and are labelled "No test available" rather than being
 * given a rank number.
 *
 * Pure functions only, so the ordering and the number formatting can be tested
 * without a browser or a network.
 */
import { formatPValue } from '../data/inference';

export type RankedSignificance = 'significant' | 'not-significant' | 'unavailable';
export type SlopeDirection = 'up' | 'down' | 'flat' | 'none';

/** The 5% level used by the pipeline for the main test. */
export const SIGNIFICANCE_LEVEL = 0.05;

export interface RankCandidate {
  regionId: string;
  regionLabel: string;
  /** Sen's slope per decade, in `units`. Null when the artifact has none. */
  slopePerDecade: number | null;
  /** Unit of the slope, e.g. `mm/day` or `°C`. Always shown with the value. */
  units: string;
  /** Hamed–Rao p-value; null when the artifact recorded no inference. */
  pValue: number | null;
  /** Raw `trend.inference.status` from the artifact (`ok` or `unavailable`). */
  inferenceStatus: string;
}

export interface RankedRegion extends RankCandidate {
  /** 1-based rank among regions with a test; null for no-test regions. */
  rank: number | null;
  significance: RankedSignificance;
  direction: SlopeDirection;
  /** |slope| relative to the largest |slope| in this list, 0–1. */
  barFraction: number;
}

function finite(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A region has a test only when the artifact says so and carries a p-value. */
export function hasTest(candidate: RankCandidate): boolean {
  return candidate.inferenceStatus === 'ok' && finite(candidate.pValue);
}

export function significanceOf(candidate: RankCandidate): RankedSignificance {
  if (!hasTest(candidate)) return 'unavailable';
  return (candidate.pValue as number) < SIGNIFICANCE_LEVEL
    ? 'significant'
    : 'not-significant';
}

export function directionOf(slope: number | null): SlopeDirection {
  if (!finite(slope)) return 'none';
  if (slope > 0) return 'up';
  if (slope < 0) return 'down';
  return 'flat';
}

/** The marker text next to each p-value. Never colour alone, never all caps. */
export function significanceLabel(significance: RankedSignificance): string {
  if (significance === 'significant') return 'Significant at 5%';
  if (significance === 'not-significant') return 'Not significant';
  return 'No test available';
}

export function variableLabel(variable: string): string {
  return metricById(variable)?.label ?? variable;
}

const SEASONS: Record<string, string> = {
  ANN: 'Annual',
  DJF: 'Winter (DJF)',
  MAM: 'Spring (MAM)',
  JJA: 'Summer (JJA)',
  SON: 'Autumn (SON)',
};

export function seasonLabel(season: string): string {
  const key = season.trim().toUpperCase();
  return SEASONS[key] ?? (season || 'Season');
}

/** Header subtitle, e.g. `Rainfall · Winter (DJF)`. */
export function rankSubtitle(variable: string, season: string): string {
  return `${variableLabel(variable)} · ${seasonLabel(season)}`;
}

/**
 * `−0.09 mm/day per decade` — U+2212 for the minus sign, always with units.
 * A slope of exactly zero is shown without a sign. Small slopes keep a third
 * decimal so a real but small trend does not round to zero.
 */
export function formatSlope(
  slope: number | null,
  units: string,
  digits?: number,
): string {
  if (!finite(slope)) return 'not available';
  const places =
    digits ?? (Math.abs(slope) > 0 && Math.abs(slope) < 0.01 ? 3 : 2);
  const rounded = Number(slope.toFixed(places));
  const magnitude = Math.abs(rounded).toFixed(places);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '\u2212' : '';
  const unit = displayUnits(units);
  return `${sign}${magnitude} ${unit ? `${unit} ` : ''}per decade`;
}

/** Artifacts store temperature units as `degC`; show them as `°C`. */
export function displayUnits(units: string): string {
  const text = units.trim();
  if (/^deg\s*C$/i.test(text)) return '°C';
  if (/^deg\s*F$/i.test(text)) return '°F';
  return text;
}

/** p-value text with the shared formatting rules (`< 0.001`, 3 decimals). */
export function formatRankPValue(pValue: number | null): string {
  return formatPValue(finite(pValue) ? pValue : null);
}

/**
 * Order: tested regions by p-value ascending, then no-test regions.
 * Ties on p-value fall back to the larger |slope|, then the label, so the order
 * never depends on the input order.
 */
export function rankRegions(candidates: readonly RankCandidate[]): RankedRegion[] {
  const slopes = candidates
    .map((candidate) => candidate.slopePerDecade)
    .filter(finite)
    .map((slope) => Math.abs(slope));
  const maxAbs = slopes.length > 0 ? Math.max(...slopes) : 0;

  const ordered = [...candidates].sort((a, b) => {
    const aTest = hasTest(a);
    const bTest = hasTest(b);
    if (aTest !== bTest) return aTest ? -1 : 1;
    if (aTest) {
      const pDiff = (a.pValue as number) - (b.pValue as number);
      if (pDiff !== 0) return pDiff;
    }
    const slopeDiff =
      Math.abs(finite(b.slopePerDecade) ? b.slopePerDecade : 0) -
      Math.abs(finite(a.slopePerDecade) ? a.slopePerDecade : 0);
    if (slopeDiff !== 0) return slopeDiff;
    const labelDiff = a.regionLabel.localeCompare(b.regionLabel, 'en', {
      sensitivity: 'base',
    });
    return labelDiff !== 0 ? labelDiff : a.regionId.localeCompare(b.regionId);
  });

  let rank = 0;
  return ordered.map((candidate) => {
    const significance = significanceOf(candidate);
    const tested = significance !== 'unavailable';
    if (tested) rank += 1;
    const slope = finite(candidate.slopePerDecade) ? Math.abs(candidate.slopePerDecade) : 0;
    return {
      ...candidate,
      rank: tested ? rank : null,
      significance,
      direction: directionOf(candidate.slopePerDecade),
      barFraction: maxAbs > 0 ? Math.min(1, slope / maxAbs) : 0,
    };
  });
}
