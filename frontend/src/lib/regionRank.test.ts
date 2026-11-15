import { describe, expect, it } from 'vitest';
import {
  formatSlope,
  rankRegions,
  rankSubtitle,
  seasonLabel,
  significanceLabel,
  type RankCandidate,
} from './regionRank';

function candidate(over: Partial<RankCandidate> = {}): RankCandidate {
  return {
    regionId: 'sahel',
    regionLabel: 'Sahel',
    slopePerDecade: 0.02,
    units: 'mm/day',
    pValue: 0.2,
    inferenceStatus: 'ok',
    ...over,
  };
}

describe('rankRegions', () => {
  it('orders by p-value ascending', () => {
    const ranked = rankRegions([
      candidate({ regionId: 'a', regionLabel: 'A', pValue: 0.4 }),
      candidate({ regionId: 'b', regionLabel: 'B', pValue: 0.01 }),
      candidate({ regionId: 'c', regionLabel: 'C', pValue: 0.049 }),
    ]);
    expect(ranked.map((row) => row.regionId)).toEqual(['b', 'c', 'a']);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('puts regions without a test last, unranked, labelled not available', () => {
    const ranked = rankRegions([
      candidate({ regionId: 'none', regionLabel: 'No test', pValue: null, inferenceStatus: 'unavailable' }),
      candidate({ regionId: 'tested', regionLabel: 'Tested', pValue: 0.3 }),
      candidate({ regionId: 'zero', regionLabel: 'Zero slope', pValue: null, inferenceStatus: 'ok' }),
    ]);
    expect(ranked.map((row) => row.regionId)).toEqual(['tested', 'none', 'zero']);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBeNull();
    expect(ranked[1].significance).toBe('unavailable');
    expect(significanceLabel(ranked[1].significance)).toBe('No test available');
    // `status: ok` without a p-value is still not a test we can rank.
    expect(ranked[2].rank).toBeNull();
  });

  it('breaks p-value ties by the larger |slope| and stays input-order independent', () => {
    const rows = [
      candidate({ regionId: 'small', regionLabel: 'Small', pValue: 0.5, slopePerDecade: 0.01 }),
      candidate({ regionId: 'big', regionLabel: 'Big', pValue: 0.5, slopePerDecade: -0.4 }),
      candidate({ regionId: 'mid', regionLabel: 'Mid', pValue: 0.5, slopePerDecade: 0.1 }),
    ];
    const forward = rankRegions(rows).map((row) => row.regionId);
    const backward = rankRegions([...rows].reverse()).map((row) => row.regionId);
    expect(forward).toEqual(['big', 'mid', 'small']);
    expect(backward).toEqual(forward);
  });

  it('uses the 5% level', () => {
    const ranked = rankRegions([
      candidate({ regionId: 'just-under', regionLabel: 'Under', pValue: 0.0499 }),
      candidate({ regionId: 'at-level', regionLabel: 'At', pValue: 0.05 }),
    ]);
    expect(ranked[0].significance).toBe('significant');
    expect(significanceLabel(ranked[0].significance)).toBe('Significant at 5%');
    expect(ranked[1].significance).toBe('not-significant');
    expect(significanceLabel(ranked[1].significance)).toBe('Not significant');
  });

  it('scales the bar to the largest |slope| in the list', () => {
    const ranked = rankRegions([
      candidate({ regionId: 'a', regionLabel: 'A', slopePerDecade: 0.2, pValue: 0.01 }),
      candidate({ regionId: 'b', regionLabel: 'B', slopePerDecade: -0.1, pValue: 0.02 }),
      candidate({ regionId: 'c', regionLabel: 'C', slopePerDecade: null, pValue: 0.03, inferenceStatus: 'ok' }),
    ]);
    expect(ranked[0].barFraction).toBeCloseTo(1, 12);
    expect(ranked[1].barFraction).toBeCloseTo(0.5, 12);
    expect(ranked[2].barFraction).toBe(0);
    expect(ranked[1].direction).toBe('down');
    expect(ranked[2].direction).toBe('none');
  });

  it('handles an empty list', () => {
    expect(rankRegions([])).toEqual([]);
  });
});

describe('formatSlope', () => {
  it('writes the minus sign and the units', () => {
    expect(formatSlope(-0.094, 'mm/day')).toBe('\u22120.09 mm/day per decade');
    expect(formatSlope(0.126, 'degC')).toBe('+0.13 °C per decade');
  });

  it('keeps a third decimal for small slopes', () => {
    expect(formatSlope(-0.0094, 'mm/day')).toBe('\u22120.009 mm/day per decade');
    expect(formatSlope(0.003, 'mm/day')).toBe('+0.003 mm/day per decade');
  });

  it('omits the sign at zero and keeps the unit gap', () => {
    expect(formatSlope(0, 'mm/day')).toBe('0.00 mm/day per decade');
  });

  it('says not available without a slope', () => {
    expect(formatSlope(null, 'mm/day')).toBe('not available');
  });
});

describe('labels', () => {
  it('names seasons and the subtitle', () => {
    expect(seasonLabel('DJF')).toBe('Winter (DJF)');
    expect(seasonLabel('JJA')).toBe('Summer (JJA)');
    expect(rankSubtitle('precipitation', 'DJF')).toBe('Rainfall · Winter (DJF)');
    expect(rankSubtitle('temperature', 'ANN')).toBe('Temperature · Annual');
  });
});
