import { describe, expect, it } from 'vitest';
import okCaution from './__fixtures__/inference/inference_ok_caution.json';
import okStrictFail from './__fixtures__/inference/inference_ok_strict_fail.json';
import unavailable from './__fixtures__/inference/inference_unavailable.json';
import unavailableCi from './__fixtures__/inference/inference_unavailable_ci.json';
import {
  CAUTION_LAG1,
  CI_LABEL,
  cautionText,
  formatInterval,
  formatPValue,
  readInference,
  strictCheckVerdict,
} from './inference';

describe('inference block reader', () => {
  it('reads the ok shape with a strict-check pass and a caution flag', () => {
    const view = readInference(okCaution.trend.inference);

    expect(view.status).toBe('ok');
    expect(view.pValue).toBe(0.042);
    expect(view.ci).toEqual([-0.231, -0.021]);
    expect(view.method).toBe('MK + Hamed-Rao (3 lags)');
    expect(view.strictCheckPass).toBe(true);
    expect(view.strictCheckP).toBe(0.031);
    expect(view.lag1).toBe(0.41);
    expect(view.caution).toBe(true);
    expect(view.n).toBe(10);
    expect(strictCheckVerdict(view)).toBe('Statistically significant at the 5% level, with the same direction');
  });

  it('reports the prewhitening sensitivity check fail without adding a caution badge', () => {
    const view = readInference(okStrictFail.trend.inference);

    expect(view.status).toBe('ok');
    expect(view.strictCheckPass).toBe(false);
    expect(strictCheckVerdict(view)).toBe('Does not confirm significance in the same direction');
    expect(view.caution).toBe(false);
    expect(cautionText(view)).toBeNull();
  });

  it('treats the unavailable shape as unavailable and hides numbers', () => {
    const view = readInference(unavailable.trend.inference);

    expect(view.status).toBe('unavailable');
    expect(view.pValue).toBeNull();
    expect(view.ci).toBeNull();
    expect(view.strictCheckPass).toBeNull();
    expect(view.lag1).toBeNull();
    expect(view.caution).toBe(false);
  });

  it('keeps the slope interval when only the main test is unavailable', () => {
    const view = readInference(unavailableCi.trend.inference);

    expect(view.status).toBe('unavailable');
    expect(view.pValue).toBeNull();
    expect(view.ci).toEqual([-0.048, 0.276]);
    expect(view.lag1).toBe(0.35);
    expect(view.caution).toBe(true);
  });

  it('raises caution from lag-1 alone when the flag is absent', () => {
    const view = readInference({
      status: 'ok',
      p_value: 0.2,
      lag1: CAUTION_LAG1,
    });

    expect(view.caution).toBe(true);
    expect(cautionText(view)).toContain('0.300');
  });

  it('rejects a malformed interval instead of inventing one', () => {
    const view = readInference({ status: 'ok', ci: [1, -1] });
    expect(view.ci).toBeNull();
  });
});

describe('inference wording and formatting', () => {
  it('uses the exact requested interval label', () => {
    expect(CI_LABEL).toBe(
      '95% confidence interval (assumes independent years; narrower than true uncertainty when years correlate)',
    );
  });

  it('formats p-values and intervals', () => {
    expect(formatPValue(0.042)).toBe('0.042');
    expect(formatPValue(0.0004)).toBe('< 0.001');
    expect(formatPValue(null)).toBe('not available');
    expect(formatInterval([-0.231, -0.021], 'mm/day per decade')).toBe(
      '-0.231 to -0.021 mm/day per decade',
    );
    expect(formatInterval(null, 'mm/day per decade')).toBe('not available');
  });

  it('does not use forbidden certainty wording', () => {
    const view = readInference(okCaution.trend.inference);
    const text = [CI_LABEL, cautionText(view) ?? ''].join(' ').toLowerCase();
    const banned = ['pro' + 'ves', ['chance', 'this', 'is', 'luck'].join(' ')];
    for (const phrase of banned) expect(text).not.toContain(phrase);
  });
});
