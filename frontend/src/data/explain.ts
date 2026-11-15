import type { SeriesDoc } from '../types';
import { readInference, type InferenceView, formatPValue, formatInterval, formatNumber, CAUTION_LAG1 } from './inference';

/**
 * Build the compact headline status line for the prewhitening sensitivity check verdict.
 * Returns e.g. "Prewhitening sensitivity check: pass (p = 0.031)" or "Prewhitening sensitivity check: not available".
 */
export function strictStatusLine(view: InferenceView): string {
  if (view.strictCheckPass === null || view.strictCheckP === null) {
    return 'Prewhitening sensitivity check: not available';
  }
  const meets = view.strictCheckPass ? 'statistically significant at the 5% level, with the same direction' : 'does not confirm significance in the same direction';
  const pStr = formatPValue(view.strictCheckP);
  const pClause = pStr.startsWith('<') ? `p ${pStr}` : `p = ${pStr}`;
  return `Prewhitening sensitivity check: ${pClause}, ${meets}`;
}

/**
 * Build the expanded 2–3 sentence plain-language explanation using ONLY artifact fields.
 * Includes explicit wording for non-significant results and missing inference.
 */
export function expandedExplanation(doc: SeriesDoc): string[] {
  const view = readInference(doc.trend?.inference);
  const slope = doc.trend?.sen_slope_per_decade;
  const firstYear = doc.years[0];
  const lastYear = doc.years[doc.years.length - 1];
  const sentences: string[] = [];

  // Sentence 1: Mean and sample size
  const n = view.n ?? 'not recorded';
  sentences.push(
    `The mean over the full ${firstYear}–${lastYear} period is ${formatMean(doc)} across ${n} seasons.`
  );

  // Sentence 2: Slope and p-value
  if (typeof slope === 'number' && Number.isFinite(slope)) {
    const slopeText = `${slope >= 0 ? '+' : ''}${slope.toFixed(3)} ${slopeUnits(doc)}`;
    if (view.status === 'ok' && view.method && view.pValue !== null) {
      const significant = view.pValue < 0.05;
      const pStr = formatPValue(view.pValue);
      const pClause = pStr.startsWith('<') ? `p ${pStr}` : `p = ${pStr}`;
      if (significant) {
        sentences.push(
          `The Sen slope is ${slopeText}; under the ${view.method}, a trend this strong would be uncommon if no trend were present (${pClause}).`
        );
      } else {
        sentences.push(
          `The Sen slope is ${slopeText}; under the ${view.method}, a trend this strong would not be uncommon if no trend were present (${pClause}).`
        );
      }
    } else {
      sentences.push(
        `The Sen slope is ${slopeText}; the artifact did not record an inference result, so no p value or interval is available.`
      );
    }
  }

  // Sentence 3: Interval and prewhitening sensitivity check
  if (view.ci) {
    const includesZero = view.ci[0] <= 0 && view.ci[1] >= 0;
    sentences.push(
      `The 95% confidence interval is ${formatInterval(view.ci, slopeUnits(doc))}; it ${includesZero ? 'includes zero' : 'does not include zero'}.`
    );
  }
  if (view.strictCheckPass !== null && view.method) {
    const mainSignificant = view.pValue !== null && view.pValue < 0.05;
    if (view.strictCheckPass !== mainSignificant) {
      sentences.push(
        'The prewhitening sensitivity check (Yue-Wang classic prewhitening) does not reach the same result as the main test.'
      );
    } else if (view.strictCheckPass) {
      sentences.push('The prewhitening sensitivity check (Yue-Wang classic prewhitening) is statistically significant at the 5% level.')
    } else {
      sentences.push('The prewhitening sensitivity check (Yue-Wang classic prewhitening) is not statistically significant at the 5% level.')
    }
  }

  return sentences;
}

/**
 * Build next-step suggestions for a given result.
 * All suggestions are grounded in real catalog/timelapse data — never invented.
 */
export interface SuggestionContext {
  /** Current result's variable (e.g., "temperature", "precipitation") */
  variable: string;
  /** Current result's season code (e.g., "DJF", "JJA") */
  season: string;
  /** Current result's region id */
  regionId: string;
  /** Current result's region label */
  regionLabel: string;
  /** All catalogued regions from the series source */
  catalog: Array<{ regionId: string; label: string; variable: string; season: string }>;
  /** Whether a timelapse exists for this variable+season */
  hasTimelapse: boolean;
  /** Whether the checks expander is currently open */
  checksOpen: boolean;
  /** Whether this is compare mode (affects "compare with" wording) */
  inCompareMode: boolean;
  /** Callback for compare suggestion */
  onCompareSuggestion?: (regionId: string) => void;
  /** Callback for opening timelapse */
  onOpenTimelapse?: (variable: string, season: string) => void;
  /** Callback for toggling checks expander */
  onToggleChecks?: (id: string) => void;
}

export interface Suggestion {
  id: string;
  label: string;
  /** Optional callback hint for the UI to wire up */
  action?: 'compare' | 'timelapse' | 'toggleChecks' | 'save' | 'cite';
  /** Extra data needed for the action */
  data?: Record<string, unknown>;
}

export function buildSuggestions(ctx: SuggestionContext): Suggestion[] {
  const suggestions: Suggestion[] = [];

  // 1. "Compare with …" for a region that exists in catalog and is not already in comparison
  const otherRegions = ctx.catalog.filter(
    (c) =>
      c.variable === ctx.variable &&
      c.season === ctx.season &&
      c.regionId !== ctx.regionId
  );
  if (otherRegions.length > 0) {
    // Pick the first available region as the suggestion
    const candidate = otherRegions[0];
    suggestions.push({
      id: `compare-${candidate.regionId}`,
      label: `Compare with ${candidate.label}`,
      action: 'compare',
      data: { regionId: candidate.regionId },
    });
  }

  // 2. "Watch this season as a timelapse" (only when timelapse exists)
  if (ctx.hasTimelapse) {
    suggestions.push({
      id: 'timelapse',
      label: 'Watch this season as a timelapse',
      action: 'timelapse',
      data: { variable: ctx.variable, season: ctx.season },
    });
  }

  // 3. "Add the 1-lag sensitivity check" (reveals expander section)
  if (!ctx.checksOpen) {
    suggestions.push({
      id: 'lag1-sensitivity',
      label: 'Add the 1-lag sensitivity check',
      action: 'toggleChecks',
      data: { showLag1: true },
    });
  }

  // 4. "Save this investigation"
  suggestions.push({
    id: 'save',
    label: 'Save this investigation',
    action: 'save',
  });

  // 5. "Cite these sources"
  suggestions.push({
    id: 'cite',
    label: 'Cite these sources',
    action: 'cite',
  });

  return suggestions;
}
export function slopeUnits(doc: SeriesDoc): string {
  return `${doc.units} per decade`;
}

export function formatMean(doc: SeriesDoc): string {
  const values = doc.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return 'not recorded';
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${mean.toFixed(2)} ${doc.units}`;
}

export function formatSlope(value: number | null, units: string): string {
  if (value === null || !Number.isFinite(value)) return 'not recorded';
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${Math.abs(value).toFixed(3)} ${units} per decade`;
}

/**
 * Plain-language text for the detrended lag-1 autocorrelation explanation.
 */
export function lag1SensitivityExplanation(view: InferenceView): string[] {
  const sentences: string[] = [];

  sentences.push(
    'This is a diagnostic, not a hypothesis test: it reports the detrended lag-1 autocorrelation (r1) of the series. Values above 0.30 warrant caution about serial dependence affecting the main trend test.'
  );

  if (view.lag1 !== null) {
    const caution = view.lag1 >= CAUTION_LAG1 ? ' (caution: exceeds 0.30 threshold)' : '';
    sentences.push(
      `The detrended lag-1 autocorrelation is ${formatNumber(view.lag1)}${caution}.`
    );
  } else {
    sentences.push('The detrended lag-1 autocorrelation is not recorded in the artifact.');
  }

  sentences.push(
    'The 3-lag Hamed-Rao autocorrelation correction used by the main test remains the headline; this diagnostic never replaces it and never gets its own verdict banner.'
  );

  return sentences;
}

/**
 * Plain-language text for sample size and coverage.
 */
export function sampleSizeExplanation(doc: SeriesDoc, view: InferenceView): string[] {
  const sentences: string[] = [];

  const n = view.n ?? 'not recorded';
  const coveragePct = doc.coverage.length > 0
    ? (doc.coverage.filter((c) => c === 1).length / doc.coverage.length * 100).toFixed(0)
    : 'not recorded';

  sentences.push(`Sample size: n = ${n} seasons with values.`);
  sentences.push(`Coverage: ${coveragePct}% of seasons have complete data.`);

  return sentences;
}

/**
 * Plain-language text for the prewhitening sensitivity check explanation.
 */
export function strictCheckExplanation(view: InferenceView): string[] {
  const sentences: string[] = [];

  sentences.push(
    'Prewhitening sensitivity check: Yue-Wang classic prewhitening. This method removes estimated autocorrelation before testing, which can also remove a real trend; compare it with the main test (MK + Hamed-Rao with 3 lags).'
  );

  if (view.strictCheckPass !== null && view.strictCheckP !== null) {
    const verdict = view.strictCheckPass ? 'is statistically significant at the 5% level, with the same direction' : 'does not confirm significance in the same direction';
    const pStr = formatPValue(view.strictCheckP);
    const pClause = pStr.startsWith('<') ? `p ${pStr}` : `p = ${pStr}`;
    sentences.push(
      `The prewhitening sensitivity check ${verdict} (${pClause}).`
    );
  } else {
    sentences.push('The prewhitening sensitivity check result is not available in this artifact.');
  }

  sentences.push(
    'Method calibration (from the project\'s own audit): the main test\'s false-positive rate was 0.066 at φ = 0 and 0.166 at φ = 0.6 against a nominal 0.05 under the AR(1) conditions tested.'
  );

  return sentences;
}