import { describe, expect, it } from 'vitest';
import { normaliseEnsoDoc } from './enso';

/**
 * A missing ENSO field must stay missing. It was once coerced to 0, which the drawer
 * formatted as "p < 0.001" — fabricated significance from an absent number.
 */
function base(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    region: 'indonesia',
    label: 'Indonesia',
    season: 'DJF',
    matched_years: [1984, 1985],
    rs: -0.22,
    ...overrides,
  };
}

describe('normaliseEnsoDoc', () => {
  it('keeps a recorded p value', () => {
    const doc = normaliseEnsoDoc(base({ p_value_two_sided_approx: 0.161 }));
    expect(doc?.p_value_two_sided_approx).toBe(0.161);
  });

  it('returns null, not zero, when the p value is absent', () => {
    const doc = normaliseEnsoDoc(base());
    expect(doc?.p_value_two_sided_approx).toBeNull();
    expect(doc?.p_value_two_sided_approx).not.toBe(0);
  });

  it('returns null when the interval is absent or malformed', () => {
    expect(normaliseEnsoDoc(base())?.block_bootstrap_95_interval).toBeNull();
    expect(
      normaliseEnsoDoc(base({ block_bootstrap_95_interval: [0.1] }))?.block_bootstrap_95_interval,
    ).toBeNull();
    expect(
      normaliseEnsoDoc(base({ block_bootstrap_95_interval: ['a', 'b'] }))?.block_bootstrap_95_interval,
    ).toBeNull();
  });

  it('keeps a well-formed interval', () => {
    const doc = normaliseEnsoDoc(base({ block_bootstrap_95_interval: [-0.552, 0.136] }));
    expect(doc?.block_bootstrap_95_interval).toEqual([-0.552, 0.136]);
  });

  it('returns null for missing counts and means in a threshold comparison', () => {
    const doc = normaliseEnsoDoc(
      base({ el_nino_rainfall_comparison: [{ threshold_c: 0.5 }] }),
    );
    const comparison = doc?.el_nino_rainfall_comparison[0];
    expect(comparison?.el_nino_mean_rainfall_mm_day).toBeNull();
    expect(comparison?.other_mean_rainfall_mm_day).toBeNull();
    expect(comparison?.el_nino_year_count).toBeNull();
  });

  it('returns null for missing sample size and slopes', () => {
    const doc = normaliseEnsoDoc(base());
    expect(doc?.effective_sample_size).toBeNull();
    expect(doc?.rainfall_sen_slope_per_year).toBeNull();
    expect(doc?.lag1_oni_residual).toBeNull();
  });

  it('rejects a body without a usable correlation', () => {
    expect(normaliseEnsoDoc(base({ rs: undefined }))).toBeNull();
    expect(normaliseEnsoDoc(null)).toBeNull();
  });
});
