/**
 * ENSO (El Nino / Southern Oscillation) context for a region's DJF rainfall.
 *
 * These are real artifacts built by the pipeline (backend.trend) pairing each
 * region's DJF rainfall series with the CPC ONI index. They are not part of
 * `index.json`; only a handful of regions have one. The module fails quiet on
 * a missing file so the inspector can simply omit the ENSO section.
 */

const DATA_ROOT = `${import.meta.env.BASE_URL}data/`;

/** Region id -> artifact file name. Only these regions have an ENSO artifact. */
const ENSO_FILES: Record<string, string> = {
  indonesia: 'enso_indonesia_DJF.json',
  coastal_peru: 'enso_peru_DJF.json',
};

export interface EnsoThresholdComparison {
  threshold_c: number;
  /** Null when the artifact omits the value: "not recorded" is not zero. */
  el_nino_mean_rainfall_mm_day: number | null;
  el_nino_year_count: number | null;
  other_mean_rainfall_mm_day: number | null;
  other_year_count: number | null;
}

export interface EnsoDoc {
  region: string;
  label: string;
  season: string;
  years_target: [number, number] | null;
  rainfall_source: string;
  oni_source: string;
  n: number | null;
  matched_years: number[];
  excluded_years: number[];
  detrending: string;
  rainfall_sen_slope_per_year: number | null;
  oni_sen_slope_per_year: number | null;
  /** Spearman (rank) correlation between detrended rainfall and ONI. */
  rs: number;
  lag1_rainfall_residual: number | null;
  lag1_oni_residual: number | null;
  effective_sample_size: number | null;
  p_value_two_sided_approx: number | null;
  effective_sample_size_formula: string;
  lag1_note: string;
  p_value_method: string;
  block_bootstrap_95_interval: [number, number] | null;
  bootstrap: {
    resamples: number | null;
    block_years: number | null;
    circular: boolean;
    seed: number | null;
    note: string;
  };
  el_nino_rainfall_comparison: EnsoThresholdComparison[];
  eligibility: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readComparison(raw: unknown): EnsoThresholdComparison | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (!isFiniteNumber(value.threshold_c)) return null;
  return {
    threshold_c: value.threshold_c,
    el_nino_mean_rainfall_mm_day: isFiniteNumber(
      value.el_nino_mean_rainfall_mm_day,
    )
      ? value.el_nino_mean_rainfall_mm_day
      : null,
    el_nino_year_count: isFiniteNumber(value.el_nino_year_count)
      ? value.el_nino_year_count
      : null,
    other_mean_rainfall_mm_day: isFiniteNumber(value.other_mean_rainfall_mm_day)
      ? value.other_mean_rainfall_mm_day
      : null,
    other_year_count: isFiniteNumber(value.other_year_count)
      ? value.other_year_count
      : null,
  };
}

/** Safe normalisation of an unknown JSON body into an EnsoDoc or null. */
/**
 * Exported so a missing numeric field can be tested directly. A missing value must
 * normalise to null ("not recorded"); coercing it to 0 once rendered a fabricated
 * p < 0.001 in the drawer.
 */
export function normaliseEnsoDoc(raw: unknown): EnsoDoc | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.matched_years)) return null;
  const rs = value.rs;
  if (!isFiniteNumber(rs)) return null;

  const bootstrap = value.bootstrap;
  const bootstrapView =
    typeof bootstrap === 'object' && bootstrap !== null
      ? {
          resamples: isFiniteNumber((bootstrap as Record<string, unknown>).resamples)
            ? ((bootstrap as Record<string, unknown>).resamples as number)
            : null,
          block_years: isFiniteNumber((bootstrap as Record<string, unknown>).block_years)
            ? ((bootstrap as Record<string, unknown>).block_years as number)
            : null,
          circular: (bootstrap as Record<string, unknown>).circular === true,
          seed: isFiniteNumber((bootstrap as Record<string, unknown>).seed)
            ? ((bootstrap as Record<string, unknown>).seed as number)
            : null,
          note:
            typeof (bootstrap as Record<string, unknown>).note === 'string'
              ? ((bootstrap as Record<string, unknown>).note as string)
              : '',
        }
      : {
          resamples: null,
          block_years: null,
          circular: false,
          seed: null,
          note: '',
        };

  const comparisons = Array.isArray(value.el_nino_rainfall_comparison)
    ? value.el_nino_rainfall_comparison
        .map(readComparison)
        .filter((item): item is EnsoThresholdComparison => item !== null)
    : [];

  return {
    region: typeof value.region === 'string' ? value.region : '',
    label: typeof value.label === 'string' ? value.label : '',
    season: typeof value.season === 'string' ? value.season : '',
    years_target:
      Array.isArray(value.years_target) &&
      isFiniteNumber(value.years_target[0]) &&
      isFiniteNumber(value.years_target[1])
        ? [value.years_target[0], value.years_target[1]]
        : null,
    rainfall_source:
      typeof value.rainfall_source === 'string' ? value.rainfall_source : '',
    oni_source: typeof value.oni_source === 'string' ? value.oni_source : '',
    n: isFiniteNumber(value.n) ? value.n : null,
    matched_years: value.matched_years.filter(
      (year): year is number => typeof year === 'number',
    ),
    excluded_years: Array.isArray(value.excluded_years)
      ? value.excluded_years.filter(
          (year): year is number => typeof year === 'number',
        )
      : [],
    detrending: typeof value.detrending === 'string' ? value.detrending : '',
    rainfall_sen_slope_per_year: isFiniteNumber(
      value.rainfall_sen_slope_per_year,
    )
      ? value.rainfall_sen_slope_per_year
      : null,
    oni_sen_slope_per_year: isFiniteNumber(value.oni_sen_slope_per_year)
      ? value.oni_sen_slope_per_year
      : null,
    rs,
    lag1_rainfall_residual: isFiniteNumber(value.lag1_rainfall_residual)
      ? value.lag1_rainfall_residual
      : null,
    lag1_oni_residual: isFiniteNumber(value.lag1_oni_residual)
      ? value.lag1_oni_residual
      : null,
    effective_sample_size: isFiniteNumber(value.effective_sample_size)
      ? value.effective_sample_size
      : null,
    p_value_two_sided_approx: isFiniteNumber(value.p_value_two_sided_approx)
      ? value.p_value_two_sided_approx
      : null,
    effective_sample_size_formula:
      typeof value.effective_sample_size_formula === 'string'
        ? value.effective_sample_size_formula
        : '',
    lag1_note: typeof value.lag1_note === 'string' ? value.lag1_note : '',
    p_value_method:
      typeof value.p_value_method === 'string' ? value.p_value_method : '',
    block_bootstrap_95_interval:
      Array.isArray(value.block_bootstrap_95_interval) &&
      isFiniteNumber(value.block_bootstrap_95_interval[0]) &&
      isFiniteNumber(value.block_bootstrap_95_interval[1])
        ? [value.block_bootstrap_95_interval[0], value.block_bootstrap_95_interval[1]]
        : null,
    bootstrap: bootstrapView,
    el_nino_rainfall_comparison: comparisons,
    eligibility:
      typeof value.eligibility === 'string' ? value.eligibility : '',
  };
}

/** Load the ENSO artifact for a region, or null when none exists. */
export async function getEnso(regionId: string): Promise<EnsoDoc | null> {
  const fileName = ENSO_FILES[regionId];
  if (!fileName) return null;
  try {
    const response = await fetch(`${DATA_ROOT}enso/${fileName}`);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return normaliseEnsoDoc(body);
  } catch {
    return null;
  }
}
