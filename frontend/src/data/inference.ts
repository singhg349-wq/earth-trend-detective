/**
 * Reading and formatting for the result's `trend.inference` block.
 *
 * Shape agreed for the inference update:
 *   { status, p_value, ci, method, strict_check_pass, strict_check_p,
 *     lag1, caution, ci_note, n }
 *
 * The UI shows both requested tests (Hamed-Rao main test and the Yue-Wang
 * prewhitening sensitivity check), the slope interval with its independence caveat, and the
 * detrended lag-1 correlation. It never turns a p-value into a claim of proof.
 */

export const CAUTION_LAG1 = 0.3;
export const FDR_Q = 0.1;

export const CI_LABEL =
  '95% confidence interval (assumes independent years; narrower than true uncertainty when years correlate)';
export const MAIN_TEST_LABEL =
  'Mann–Kendall trend test (Hamed–Rao autocorrelation-corrected)';
export const STRICT_CHECK_LABEL = 'Prewhitening sensitivity check (Yue–Wang)';

export type InferenceStatus = 'ok' | 'unavailable';

export interface InferenceView {
  status: InferenceStatus;
  pValue: number | null;
  ci: [number, number] | null;
  method: string | null;
  strictCheckPass: boolean | null;
  strictCheckP: number | null;
  lag1: number | null;
  caution: boolean;
  ciNote: string | null;
  n: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readInterval(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const low = finiteNumber(value[0]);
  const high = finiteNumber(value[1]);
  if (low === null || high === null || low > high) return null;
  return [low, high];
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function readCount(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number === null || number < 0 || !Number.isInteger(number)) return null;
  return number;
}

/**
 * Normalise an unknown inference object. Missing or malformed values become
 * nulls; the status only becomes `ok` when the artifact says so.
 */
export function readInference(raw: unknown): InferenceView {
  const source = isRecord(raw) ? raw : {};
  const status: InferenceStatus = source.status === 'ok' ? 'ok' : 'unavailable';
  const lag1 = finiteNumber(source.lag1);
  const caution =
    source.caution === true || (lag1 !== null && lag1 >= CAUTION_LAG1);

  return {
    status,
    pValue: finiteNumber(source.p_value),
    ci: readInterval(source.ci),
    method: readText(source.method),
    strictCheckPass: readBoolean(source.strict_check_pass),
    strictCheckP: finiteNumber(source.strict_check_p),
    lag1,
    caution,
    ciNote: readText(source.ci_note),
    n: readCount(source.n),
  };
}

export function formatPValue(value: number | null): string {
  if (value === null) return 'not available';
  if (value < 0.001) return '< 0.001';
  return value.toFixed(3);
}

export function formatNumber(value: number | null, digits = 3): string {
  if (value === null) return 'not available';
  return value.toFixed(digits);
}

export function formatInterval(
  ci: [number, number] | null,
  slopeUnits: string,
): string {
  if (ci === null) return 'not available';
  return `${ci[0].toFixed(3)} to ${ci[1].toFixed(3)} ${slopeUnits}`;
}

export function strictCheckVerdict(view: InferenceView): string {
  if (view.strictCheckPass === true) return 'Statistically significant at the 5% level, with the same direction';
  if (view.strictCheckPass === false) return 'Does not confirm significance in the same direction';
  return 'Prewhitening sensitivity check not available';
}

export function cautionText(view: InferenceView): string | null {
  if (!view.caution) return null;
  const lag1 = view.lag1 === null ? 'at or above 0.30' : formatNumber(view.lag1);
  return (
    `Detrended lag-1 correlation is ${lag1} (caution threshold 0.30). ` +
    'Correlated years can make p-values and the slope interval optimistic; ' +
    'read both with that in mind.'
  );
}
