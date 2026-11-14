import { describe, expect, it } from "vitest";

import { median, senSlope, senSlopeForPeriod } from "./stats";
import statsFixtures from "./__fixtures__/stats_fixtures.json";

interface ExpectedSlope {
  slope_per_year: number | null;
  slope_per_decade: number | null;
  intercept: number | null;
  n: number;
  period: [number, number] | null;
}

interface PeriodFixture {
  start_year: number;
  end_year: number;
  expected: ExpectedSlope;
}

interface StatsFixtureCase {
  name: string;
  years: number[];
  values: (number | null)[];
  expected_full: ExpectedSlope;
  periods: PeriodFixture[];
}

const fixtureData = statsFixtures as unknown as {
  source: string;
  fill_value: number;
  cases: StatsFixtureCase[];
};

function expectClose(actual: number | null, expected: number | null): void {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(actual).not.toBeNull();
  expect(Math.abs((actual as number) - expected)).toBeLessThan(1e-9);
}

function expectMatches(actual: ReturnType<typeof senSlope>, expected: ExpectedSlope): void {
  expect(actual.n).toBe(expected.n);
  expect(actual.period).toEqual(expected.period);
  expectClose(actual.slopePerYear, expected.slope_per_year);
  expectClose(actual.slopePerDecade, expected.slope_per_decade);
  expectClose(actual.intercept, expected.intercept);
}

describe("stats fixtures", () => {
  it("records the Python-side source used to build expectations", () => {
    expect(["scipy.stats.theilslopes", "backend.trend.stats.sen_slope"]).toContain(
      fixtureData.source,
    );
    expect(fixtureData.cases.length).toBeGreaterThan(5);
  });

  it("matches Python for every full series", () => {
    for (const fixture of fixtureData.cases) {
      const actual = senSlope(fixture.years, fixture.values);
      expectMatches(actual, fixture.expected_full);
    }
  });

  it("matches Python for every sub-period", () => {
    for (const fixture of fixtureData.cases) {
      for (const period of fixture.periods) {
        const actual = senSlopeForPeriod(
          fixture.years,
          fixture.values,
          period.start_year,
          period.end_year,
        );
        expectMatches(actual, period.expected);
      }
    }
  });
});

describe("senSlope", () => {
  it("uses the true calendar-year gap, not an index gap", () => {
    const result = senSlope([2000, 2010], [1.0, 2.0]);
    expect(result.slopePerYear).toBeCloseTo(0.1, 12);
    expect(result.slopePerDecade).toBeCloseTo(1.0, 12);
    expect(result.n).toBe(2);
  });

  it("skips the int16 fill value by default", () => {
    const withFill = senSlope([2000, 2001, 2002], [1.0, -32768, 3.0]);
    const without = senSlope([2000, 2001, 2002], [1.0, null, 3.0]);
    expect(withFill.n).toBe(2);
    expect(withFill.slopePerDecade).toBeCloseTo(without.slopePerDecade as number, 12);
  });

  it("accepts a custom fill value", () => {
    const result = senSlope([2000, 2001, 2002], [1.0, -9999, 3.0], {
      fillValues: [-9999],
    });
    expect(result.n).toBe(2);
    expect(result.period).toEqual([2000, 2002]);
  });

  it("returns nulls when there are fewer than two valid years", () => {
    expect(senSlope([2000], [5.0])).toEqual({
      slopePerYear: null,
      slopePerDecade: null,
      intercept: null,
      n: 1,
      period: [2000, 2000],
    });
    expect(senSlope([2000, 2001], [null, -32768])).toEqual({
      slopePerYear: null,
      slopePerDecade: null,
      intercept: null,
      n: 0,
      period: null,
    });
  });

  it("does not renumber years after a gap", () => {
    // 2000, 2001, 2010 after one missing year: slopes use 10-year gaps.
    const result = senSlope([2000, 2001, 2010], [1.0, 2.0, 11.0]);
    expect(result.slopePerYear).toBeCloseTo(1.0, 12);
    expect(result.slopePerDecade).toBeCloseTo(10.0, 12);
    expect(result.n).toBe(3);
  });
});

describe("senSlopeForPeriod", () => {
  it("only uses years inside the inclusive window", () => {
    const years = [1990, 1995, 2000, 2005, 2010];
    const values = [0, 5, 10, 15, 20];
    const result = senSlopeForPeriod(years, values, 1995, 2005);
    expect(result.period).toEqual([1995, 2005]);
    expect(result.n).toBe(3);
    expect(result.slopePerYear).toBeCloseTo(1.0, 12);
  });

  it("rejects a reversed window", () => {
    expect(() => senSlopeForPeriod([2000, 2001], [1, 2], 2001, 2000)).toThrow(
      RangeError,
    );
  });
});

describe("median", () => {
  it("averages the two middle values for even lengths", () => {
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([5, 1, 3])).toBe(3);
  });

  it("rejects an empty array", () => {
    expect(() => median([])).toThrow(RangeError);
  });
});
