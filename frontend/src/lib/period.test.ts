import { describe, expect, it } from "vitest";

import { comparePeriods } from "./period";
import { senSlopeForPeriod } from "./stats";

const years = Array.from({ length: 42 }, (_, index) => 1984 + index);
const values = years.map((_, index) => 1.0 + 0.01 * index);

describe("comparePeriods", () => {
  it("reports two individual estimates for non-overlapping periods", () => {
    const comparison = comparePeriods(years, values, { startYear: 1984, endYear: 2000 }, {
      startYear: 2001,
      endYear: 2020,
    });

    expect(comparison.a.requested).toEqual([1984, 2000]);
    expect(comparison.b.requested).toEqual([2001, 2020]);
    expect(comparison.a.n).toBe(17);
    expect(comparison.b.n).toBe(20);
    expect(comparison.a.estimate.slopePerDecade).toBeCloseTo(0.1, 12);
    expect(comparison.b.estimate.slopePerDecade).toBeCloseTo(0.1, 12);
    expect(comparison.a.estimate).toEqual(
      senSlopeForPeriod(years, values, 1984, 2000),
    );
    expect(comparison.b.estimate).toEqual(
      senSlopeForPeriod(years, values, 2001, 2020),
    );

    expect(comparison.overlap).toEqual({
      startYear: null,
      endYear: null,
      years: [],
      count: 0,
      matchingObservations: 0,
    });
    expect(comparison.counts).toEqual({ a: 17, b: 20, overlap: 0 });
    expect(comparison.support.hasOverlap).toBe(false);
    expect(comparison.support.labels).toContain("Periods do not overlap.");
  });

  it("computes overlap and unequal support without pairing the estimates", () => {
    const comparison = comparePeriods(years, values, { startYear: 1984, endYear: 2000 }, {
      startYear: 1990,
      endYear: 2005,
    });

    expect(comparison.overlap.startYear).toBe(1990);
    expect(comparison.overlap.endYear).toBe(2000);
    expect(comparison.overlap.count).toBe(11);
    expect(comparison.overlap.matchingObservations).toBe(11);
    expect(comparison.counts).toEqual({ a: 17, b: 16, overlap: 11 });
    expect(comparison.support.hasOverlap).toBe(true);
    expect(comparison.support.equalLength).toBe(false);
    expect(comparison.support.equalCount).toBe(false);
    expect(comparison.support.labels.join(" ")).toContain("unequal length");
    expect(comparison.support.labels.join(" ")).toContain("support is unequal");
  });

  it("flags equal-length periods with no overlap", () => {
    const comparison = comparePeriods(years, values, { startYear: 1984, endYear: 1999 }, {
      startYear: 2000,
      endYear: 2015,
    });

    expect(comparison.support.equalLength).toBe(true);
    expect(comparison.support.equalCount).toBe(true);
    expect(comparison.support.hasOverlap).toBe(false);
    expect(comparison.overlap.count).toBe(0);
  });

  it("counts matching observations when fill values sit in the overlap", () => {
    const gappy: (number | null)[] = [...values];
    gappy[years.indexOf(1990)] = null;
    gappy[years.indexOf(1995)] = -32768;

    const comparison = comparePeriods(years, gappy, { startYear: 1984, endYear: 2000 }, {
      startYear: 1990,
      endYear: 2000,
    });

    expect(comparison.a.n).toBe(15);
    expect(comparison.b.n).toBe(9);
    expect(comparison.overlap.count).toBe(11);
    expect(comparison.overlap.matchingObservations).toBe(9);
    expect(comparison.counts.overlap).toBe(9);
    expect(comparison.support.equalCount).toBe(false);
  });

  it("does not produce any slope-difference field", () => {
    const comparison = comparePeriods(years, values, { startYear: 1984, endYear: 2000 }, {
      startYear: 2001,
      endYear: 2020,
    });

    expect(comparison).not.toHaveProperty("difference");
    expect(comparison).not.toHaveProperty("slopeDifference");
    expect(comparison).not.toHaveProperty("slope_difference");
    expect(comparison).not.toHaveProperty("inference");
    expect(comparison.note).toContain("No slope difference");
  });

  it("rejects reversed or non-integer period bounds", () => {
    expect(() =>
      comparePeriods(years, values, { startYear: 2000, endYear: 1990 }, {
        startYear: 2001,
        endYear: 2010,
      }),
    ).toThrow(RangeError);
    expect(() =>
      comparePeriods(years, values, { startYear: 2000.5, endYear: 2010 }, {
        startYear: 2001,
        endYear: 2010,
      }),
    ).toThrow(RangeError);
  });
});
