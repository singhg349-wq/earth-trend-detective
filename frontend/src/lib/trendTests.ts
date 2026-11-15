/** Direct port of backend/trend/stats.py: inference_block, fixed alpha=0.05. */
import { median } from './stats';
import type { TrendInference } from './types';

const Z95 = 1.959963984540054;
const NOTE = '95% slope interval assumes independent years; narrower than true uncertainty when years correlate';
const finite = (x: number) => Number.isFinite(x) ? x : null;

function acf(v: number[], lag: number): number {
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const c = v.map(x => x - mean);
  const denominator = c.reduce((a, x) => a + x * x, 0);
  return denominator <= 0 ? 0 : c.slice(lag).reduce((sum, x, i) => sum + x * c[i], 0) / denominator;
}
function ranks(v: number[]): number[] {
  const sorted = [...v].sort((a, b) => a - b);
  const map = new Map<number, number>();
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && sorted[j] === sorted[i]) j++;
    map.set(sorted[i], (i + j + 1) / 2); i = j;
  }
  return v.map(x => map.get(x)!);
}
function statistic(v: number[]): { s: number; variance: number } {
  let s = 0;
  const counts = new Map<number, number>();
  v.forEach((x, i) => { counts.set(x, (counts.get(x) ?? 0) + 1); for (let j = i + 1; j < v.length; j++) s += Math.sign(v[j] - x); });
  const n = v.length;
  const tie = [...counts.values()].reduce((sum, t) => sum + t * (t - 1) * (2 * t + 5), 0);
  return { s, variance: (n * (n - 1) * (2 * n + 5) - tie) / 18 };
}
// Normal survival probability through a convergent incomplete-gamma series / fraction.
// This avoids the tail precision loss of 1 - erf(z).
function pValue(s: number, variance: number): number {
  if (!(variance > 0)) return NaN;
  const z = s === 0 ? 0 : (Math.abs(s) - 1) / Math.sqrt(variance);
  const x = z * z / 2;
  if (x === 0) return 1;
  const factor = Math.exp(-x + 0.5 * Math.log(x) - 0.5723649429247001);
  if (x < 1.5) {
    let term = 2, sum = term;
    for (let i = 1; i < 200; i++) { term *= x / (i + 0.5); sum += term; if (Math.abs(term) < Math.abs(sum) * 1e-16) break; }
    return Math.max(0, 1 - factor * sum);
  }
  let b = x + 0.5, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 200; i++) {
    const a = -i * (i - 0.5); b += 2;
    d = a * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + a / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.min(1, factor * h);
}
function roundEven(x: number): number {
  const lower = Math.floor(x);
  return x - lower === 0.5 ? lower + (lower % 2) : Math.round(x);
}
export function computeInference(years: number[], values: (number | null)[]): TrendInference {
  if (years.length !== values.length) throw new Error('years and values must have the same length');
  const y: number[] = [], v: number[] = [];
  values.forEach((x, i) => { if (x !== null && Number.isFinite(x) && Number.isFinite(years[i])) { y.push(years[i]); v.push(x); } });
  if (new Set(y).size !== y.length) throw new Error('years must be unique');
  const n = v.length;
  const result: TrendInference = { status: 'unavailable', p_value: null, ci: null, method: 'MK + Hamed-Rao (3 lags)', strict_check_pass: null, strict_check_p: null, lag1: null, caution: false, ci_note: NOTE, n };
  if (n < 8) return result;
  const slopes: number[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) slopes.push((v[j] - v[i]) / (y[j] - y[i]));
  slopes.sort((a, b) => a - b);
  const slope = median(slopes);
  const detrended = v.map((x, i) => x - slope * (y[i] - y[0]));
  const rank = ranks(detrended);
  let total = 0;
  for (let k = 1; k <= Math.min(3, n - 1); k++) {
    const rho = acf(rank, k);
    if (Math.abs(rho) > Z95 / Math.sqrt(n)) total += (n-k) * (n-k-1) * (n-k-2) * rho;
  }
  const main = statistic(v);
  const p = pValue(main.s, main.variance * (1 + 2 * total / (n * (n-1) * (n-2))));
  const rho = acf(v, 1);
  const strict = statistic(v.slice(1).map((x, i) => x - rho * v[i]));
  const ps = pValue(strict.s, strict.variance);
  const c = Z95 * Math.sqrt(main.variance);
  const clamp = (i: number) => Math.max(0, Math.min(slopes.length - 1, i));
  result.ci = [slopes[clamp(roundEven((slopes.length-c)/2)-1)] * 10, slopes[clamp(roundEven((slopes.length+c)/2))] * 10];
  result.p_value = finite(p); result.strict_check_p = finite(ps);
  result.strict_check_pass = Number.isFinite(p) && Number.isFinite(ps) ? ps < 0.05 && Math.sign(main.s) === Math.sign(strict.s) : null;
  result.lag1 = acf(detrended, 1); result.caution = result.lag1 >= 0.3;
  result.status = Number.isFinite(p) ? 'ok' : 'unavailable';
  return result;
}
