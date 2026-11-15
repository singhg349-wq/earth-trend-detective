import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/inference_parity.json';
import { computeInference } from './trendTests';

describe('Python inference parity', () => {
  for (const fixture of fixtures.cases) it(fixture.name, () => {
    const actual = computeInference(fixture.years, fixture.values);
    const expected = fixture.inference;
    expect(actual.status).toBe(expected.status);
    expect(actual.strict_check_pass).toBe(expected.strict_check_pass);
    expect(actual.caution).toBe(expected.caution);
    expect(actual.n).toBe(expected.n);
    for (const key of ['p_value', 'strict_check_p', 'lag1'] as const) {
      const value = expected[key];
      if (value === null) expect(actual[key]).toBeNull();
      else expect(Math.abs(actual[key]! - value)).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(value) * 1e-6));
    }
    if (expected.ci) expected.ci.forEach((value, i) => expect(actual.ci![i]).toBeCloseTo(value, 9));
    else expect(actual.ci).toBeNull();
  });
  it('computes a 47-year cell well under 50ms', () => {
    const years = Array.from({ length: 47 }, (_, i) => 1980+i);
    const values = years.map((_, i) => Math.sin(i) + i / 100);
    computeInference(years, values);
    const start = performance.now();
    for (let i = 0; i < 100; i++) computeInference(years, values);
    const mean = (performance.now() - start) / 100;
    console.log(`47-year cell inference mean: ${mean.toFixed(3)} ms`);
    expect(mean).toBeLessThan(50);
  });
});
