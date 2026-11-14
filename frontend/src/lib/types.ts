/**
 * Shared TypeScript shapes for CONTRACT.md results and the trend inference block.
 *
 * Authoritative JSON contract: docs/CONTRACT.md. The inference fields follow the
 * user's inference decision (2026-11-14):
 *
 * - main test: Mann-Kendall with a 3-lag Hamed-Rao variance correction,
 * - strict check: Yue-Wang classic prewhitening (trend not restored),
 * - slope interval: Sen 95% interval, which assumes independent years,
 * - caution badge when the detrended lag-1 correlation is 0.3 or more.
 *
 * W3 owns the final field proposal in docs/CONTRACT_INFERENCE_PROPOSAL.md. These
 * types use the agreed shape from the brief until that file lands, then only the
 * field names need checking against it.
 *
 * This module only describes data. It never computes inference, p-values or
 * intervals. Browser-side sub-period comparisons stay descriptive and keep
 * using `SenSlopeResult` from ./stats, which has no inference fields at all.
 */

export type InferenceStatus = "ok" | "unavailable";

export interface TrendInference {
  /** `ok` only when every field below is present; otherwise `unavailable`. */
  status: InferenceStatus;
  /**
   * Main two-sided p-value from Mann-Kendall with a 3-lag Hamed-Rao variance
   * correction, or null when status is `unavailable`.
   *
   * This is not the probability that the trend is real and must not be
   * described as "chance this is luck".
   */
  p_value: number | null;
  /**
   * 95% Sen slope interval `[low, high]` in slope units per decade, or null.
   * The interval assumes independent years; it is narrower than the true
   * uncertainty when years correlate. Always label it with `ci_note`.
   */
  ci: [number, number] | null;
  /** Test description, for example `MK + Hamed-Rao (3 lags)`, or null. */
  method: string | null;
  /**
   * Whether the trend also passes the strict check (Yue-Wang classic
   * prewhitening), or null when that check was not computed. The UI shows both
   * tests: the main p-value and this strict-check verdict.
   */
  strict_check_pass: boolean | null;
  /** p-value of the strict check, or null when it was not computed. */
  strict_check_p: number | null;
  /**
   * Detrended lag-1 autocorrelation, or null. Show it next to the caution
   * badge; a value at or above 0.3 means the series is persistent enough that
   * the main test may be optimistic.
   */
  lag1: number | null;
  /** True when `lag1 >= 0.3`; false when lag1 is null or smaller. */
  caution: boolean;
  /** Fixed wording for the slope interval; see `SLOPE_CI_NOTE` in ./tiles. */
  ci_note: string;
  /** Number of valid observations used by the inference test, or null. */
  n: number | null;
}

/** Older name kept so existing imports keep compiling. */
export type ContractInference = TrendInference;

export interface ContractSource {
  product: string;
  version: string;
  var: string;
  doi_or_url: string;
}

export interface ContractRegion {
  id: string;
  label: string;
  geometry: string;
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

export interface ContractTrend {
  /** Full-period Sen slope per decade, or null when it cannot be computed. */
  sen_slope_per_decade: number | null;
  /**
   * Median-based intercept at calendar year 0
   * (`median(y) - slopePerYear * median(x)`, scipy convention), or null.
   */
  intercept: number | null;
  /** Slope method label, for example `Sen`. */
  method: string;
  /** Units of the slope, for example `mm/day/decade`. */
  slope_units: string;
  /** Number of valid years used by the slope. */
  n_valid: number;
  /** First and last valid year, or null when there are none. */
  period: [number, number] | null;
  inference: TrendInference;
  /**
   * Per-cell Benjamini-Hochberg flag at q = 0.10 for map hatching, when the
   * tile carries it: true means hatch, false means do not hatch, null (or
   * absent) means the tile has no flag. Map hatching uses this field only;
   * every valid cell is still coloured by Sen slope. Significant cells can
   * cluster in space, so hatching is not a set of independent hot spots.
   */
  fdr_significant?: boolean | null;
}

export interface ContractValidation {
  reference: string;
  status: "fixture" | "pending" | "passed" | "failed" | "unchecked-same-method";
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

/** A single cell decoded into the common CONTRACT.md result shape. */
export type CellResult = ContractResult;

/** One clicked 1-degree cell, decoded into a CONTRACT.md-shaped result. */
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
