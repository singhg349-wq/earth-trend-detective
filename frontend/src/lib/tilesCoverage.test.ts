/**
 * Click-anywhere coverage against the real served grid.
 *
 * These tests read the actual `frontend/public/data/grid` index and tiles from
 * disk (nothing is mocked) and run `fetchCellSeries` exactly as a globe click
 * does. Every sample point must either produce a complete, finite series or a
 * well-formed `no-data` outcome; nothing may throw and no slope may be NaN.
 *
 * The grid ships 648 ten-degree tiles per season for both variables, so the
 * current artifacts answer every click. The assertions below pin that fact
 * down; if a future dataset really is partial, the no-data branch documents
 * what a well-formed gap looks like.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  fetchCellSeries,
  type CellSeriesOutcome,
  type FetchResponseLike,
  type GridIndex,
} from "./tiles";
import type { ContractResult } from "./types";

const here = path.dirname(fileURLToPath(import.meta.url));
const gridDir = path.resolve(here, "..", "..", "public", "data", "grid");

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

const REAL_INDEX = readJson<GridIndex>(path.join(gridDir, "index.json"));
const REAL_T2M_INDEX = readJson<GridIndex>(path.join(gridDir, "index_t2m.json"));

const SEASONS = ["ANN", "DJF", "MAM", "JJA", "SON"] as const;
const VARIABLES = ["precip", "t2m", "aod"] as const;

/** Reasons tiles.ts may legitimately return for a real click. */
const NO_DATA_REASONS = [
  "fetch-unavailable",
  "index-unavailable",
  "index-invalid",
  "unknown-variable",
  "unknown-season",
  "no-years",
  "no-tile",
  "fetch-failed",
  "bad-tile",
  "no-cell",
  "all-fill",
];

interface ClickPoint {
  name: string;
  lon: number;
  lat: number;
  /** Cell centre id from docs/GRID_FORMAT.md section 3.3. */
  cellId: string;
  /** Tile key from docs/GRID_FORMAT.md section 3.3. */
  tileKey: string;
}

/**
 * Equator, both poles, both sides of the dateline, the prime meridian, two
 * mid-ocean points and six land points across every continent class.
 */
const CLICK_POINTS: ClickPoint[] = [
  { name: "equator / prime meridian", lon: 0, lat: 0, cellId: "cell_0.5_0.5", tileKey: "0_0" },
  { name: "north pole", lon: 0, lat: 90, cellId: "cell_89.5_0.5", tileKey: "0_80" },
  { name: "south pole", lon: 0, lat: -90, cellId: "cell_-89.5_0.5", tileKey: "0_-90" },
  { name: "east dateline", lon: 180, lat: 0, cellId: "cell_0.5_-179.5", tileKey: "-180_0" },
  { name: "west dateline", lon: -180, lat: 0, cellId: "cell_0.5_-179.5", tileKey: "-180_0" },
  { name: "just west of the dateline", lon: 179.9, lat: 0, cellId: "cell_0.5_179.5", tileKey: "170_0" },
  { name: "mid Pacific", lon: -150, lat: -5, cellId: "cell_-4.5_-149.5", tileKey: "-150_-10" },
  { name: "mid Atlantic", lon: -25, lat: -35, cellId: "cell_-34.5_-24.5", tileKey: "-30_-40" },
  { name: "Edmonton, Canada", lon: -113.49, lat: 53.55, cellId: "cell_53.5_-113.5", tileKey: "-120_50" },
  { name: "Lima, Peru", lon: -77.04, lat: -12.05, cellId: "cell_-12.5_-77.5", tileKey: "-80_-20" },
  { name: "Jakarta, Indonesia", lon: 106.8, lat: -6.2, cellId: "cell_-6.5_106.5", tileKey: "100_-10" },
  { name: "Sahara", lon: 13.2, lat: 23.4, cellId: "cell_23.5_13.5", tileKey: "10_20" },
  { name: "Antarctica", lon: 0, lat: -75, cellId: "cell_-74.5_0.5", tileKey: "0_-80" },
  { name: "Greenland", lon: -40.2, lat: 72.1, cellId: "cell_72.5_-40.5", tileKey: "-50_70" },
];

/**
 * Minimal FetchLike backed by the real files on disk. A missing file becomes
 * the HTTP 404 that a static host would return.
 */
function diskFetch(calls: string[]): (url: string) => Promise<FetchResponseLike> {
  const prefix = `${gridDir}/`;
  return async (url: string) => {
    calls.push(url);
    const relative = url.startsWith(prefix) ? url.slice(prefix.length) : url;
    let text: string;
    try {
      text = readFileSync(path.join(gridDir, relative), "utf8");
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
}

function expectFiniteSeries(result: ContractResult, cellId: string, label: string) {
  expect(result.region.id, label).toBe(cellId);
  expect(result.years.length, label).toBeGreaterThan(0);
  expect(result.values, label).toHaveLength(result.years.length);
  expect(result.coverage, label).toHaveLength(result.years.length);

  for (let index = 0; index < result.years.length; index += 1) {
    expect(Number.isInteger(result.years[index]), `${label} year ${index}`).toBe(true);
  }
  for (let index = 1; index < result.years.length; index += 1) {
    expect(result.years[index], `${label} years sorted`).toBeGreaterThan(
      result.years[index - 1] as number,
    );
  }
  for (const value of result.values) {
    if (value !== null) {
      expect(Number.isFinite(value), `${label} finite value`).toBe(true);
    }
  }
  for (const value of result.coverage) {
    expect(Number.isFinite(value), `${label} finite coverage`).toBe(true);
    expect(value, `${label} coverage range`).toBeGreaterThanOrEqual(0);
    expect(value, `${label} coverage range`).toBeLessThanOrEqual(1);
  }

  const computedInference = result.trend.inference;
  if (result.values.filter(v => v !== null).length >= 8 && new Set(result.values.filter(v => v !== null)).size > 1) {
    expect(computedInference.status, label).toBe("ok");
    expect(computedInference.p_value, label).toBeGreaterThanOrEqual(0);
    expect(computedInference.p_value, label).toBeLessThanOrEqual(1);
    expect(Number.isFinite(computedInference.lag1), label).toBe(true);
    expect(computedInference.ci![0], label).toBeLessThanOrEqual(computedInference.ci![1]);
  }
  const slope = result.trend.sen_slope_per_decade;
  expect(
    typeof slope === "number" && Number.isFinite(slope),
    `${label} slope must be a finite number (got ${String(slope)})`,
  ).toBe(true);
  expect(result.trend.n_valid, label).toBeGreaterThan(0);
  expect(result.trend.period, label).toHaveLength(2);
  expect(Number.isFinite(result.trend.intercept), `${label} intercept`).toBe(true);

  const [west, south, east, north] = result.region.bbox;
  for (const coordinate of [west, south, east, north]) {
    expect(Number.isFinite(coordinate), `${label} bbox`).toBe(true);
  }
  expect(west, `${label} bbox west`).toBeGreaterThanOrEqual(-180);
  expect(east, `${label} bbox east`).toBeLessThanOrEqual(180);
  expect(west, `${label} bbox order`).toBeLessThan(east);
  expect(south, `${label} bbox south`).toBeGreaterThanOrEqual(-90);
  expect(north, `${label} bbox north`).toBeLessThanOrEqual(90);
  expect(south, `${label} bbox order`).toBeLessThan(north);
  expect(result.region.area_km2, label).toBeGreaterThan(0);

  expect(result.validation.status, label).toBe("unchecked-same-method");
  expect(result.template_summary, label).toContain("unchecked-same-method");
  expect(result.template_summary.length, label).toBeGreaterThan(40);

  const inference = result.trend.inference;
  expect(["ok", "unavailable"], label).toContain(inference.status);
  if (inference.status === "ok") {
    expect(inference.p_value, `${label} p-value`).toBeGreaterThanOrEqual(0);
    expect(inference.p_value, `${label} p-value`).toBeLessThanOrEqual(1);
    expect(inference.ci, `${label} interval`).toHaveLength(2);
    expect(inference.ci?.[0], `${label} interval order`).toBeLessThanOrEqual(
      inference.ci?.[1] as number,
    );
    expect(Number.isFinite(inference.lag1), `${label} lag1`).toBe(true);
  }
}

describe("real grid inventory", () => {
  it("merges both variable indexes and lists every sample tile", () => {
    expect(REAL_INDEX.variables.precip).toBeDefined();
    expect(REAL_INDEX.variables.t2m).toBeDefined();
    expect(REAL_T2M_INDEX.variables.t2m).toBeDefined();

    for (const season of SEASONS) {
      const precipTiles = REAL_INDEX.variables.precip.available_tiles;
      const t2mTiles = REAL_T2M_INDEX.variables.t2m.available_tiles;
      expect(precipTiles, `precip ${season}`).toBeTypeOf("object");
      expect(t2mTiles, `t2m ${season}`).toBeTypeOf("object");

      for (const point of CLICK_POINTS) {
        const label = `${point.name} / ${season}`;
        if (Array.isArray(precipTiles)) {
          expect(precipTiles, label).toContain(point.tileKey);
        } else if (precipTiles && typeof precipTiles === "object") {
          expect(precipTiles[season], label).toContain(point.tileKey);
        }
        if (Array.isArray(t2mTiles)) {
          expect(t2mTiles, label).toContain(point.tileKey);
        } else if (t2mTiles && typeof t2mTiles === "object") {
          expect(t2mTiles[season], label).toContain(point.tileKey);
        }

        for (const variable of VARIABLES) {
          const file = path.join(gridDir, variable, season, `${point.tileKey}.json`);
          expect(statSync(file).isFile(), `${label} ${file}`).toBe(true);
        }
      }
    }
  });
});

describe("click coverage against the real grid", () => {
  it("returns a finite series or a well-formed no-data answer for every click", async () => {
    const calls: string[] = [];
    const fetchImpl = diskFetch(calls);
    const problems: string[] = [];
    let okCount = 0;

    for (const variable of VARIABLES) {
      for (const point of CLICK_POINTS) {
        for (const season of SEASONS) {
          const label = `${variable}/${season} at ${point.name} (${point.lon}, ${point.lat})`;
          let outcome: CellSeriesOutcome;
          try {
            outcome = await fetchCellSeries(
              { lon: point.lon, lat: point.lat, variable, season },
              { index: REAL_INDEX, basePath: gridDir, fetchImpl },
            );
          } catch (error) {
            problems.push(`${label} threw ${String(error)}`);
            continue;
          }

          expect(outcome.cellId, label).toBe(point.cellId);
          expect(outcome.tileKey, label).toBe(point.tileKey);

          if (outcome.status === "no-data") {
            expect(NO_DATA_REASONS, label).toContain(outcome.reason);
            expect(typeof outcome.message, label).toBe("string");
            expect(outcome.message.trim().length, label).toBeGreaterThan(5);
            expect(outcome.message, label).toMatch(/[A-Za-z]/);
            expect(outcome.message, label).not.toContain("[object");
            continue;
          }

          okCount += 1;
          expectFiniteSeries(outcome.result, point.cellId, label);
          expect(outcome.tileUrl, label).toBe(
            `${gridDir}/${variable}/${season}/${point.tileKey}.json`,
          );
        }
      }
    }

    expect(problems).toEqual([]);
    const total = VARIABLES.length * CLICK_POINTS.length * SEASONS.length;
    expect(okCount, `${total - okCount} click(s) did not return a series`).toBe(total);
    expect(calls, "one tile read per click").toHaveLength(okCount);
  });
});

describe("coordinate edge cases on the real grid", () => {
  const index = REAL_INDEX;
  const basePath = gridDir;

  it("maps both sides of the dateline to the same wrapped tile and cell", async () => {
    const calls: string[] = [];
    const fetchImpl = diskFetch(calls);

    const east = await fetchCellSeries(
      { lon: 180, lat: 0, variable: "precip", season: "DJF" },
      { index, basePath, fetchImpl },
    );
    const west = await fetchCellSeries(
      { lon: -180, lat: 0, variable: "precip", season: "DJF" },
      { index, basePath, fetchImpl },
    );

    expect(east.cellId).toBe("cell_0.5_-179.5");
    expect(east.tileKey).toBe("-180_0");
    expect(west.cellId).toBe(east.cellId);
    expect(west.tileKey).toBe(east.tileKey);
    expect(east.status).toBe("ok");
    expect(west.status).toBe("ok");
  });

  it("clamps both poles to the outer rows and never asks for a 90-degree tile", async () => {
    const fetchImpl = diskFetch([]);

    for (const [lat, expectedCell, expectedTile] of [
      [90, "cell_89.5_0.5", "0_80"],
      [95, "cell_89.5_0.5", "0_80"],
      [-90, "cell_-89.5_0.5", "0_-90"],
      [-95, "cell_-89.5_0.5", "0_-90"],
    ] as const) {
      const outcome = await fetchCellSeries(
        { lon: 0, lat, variable: "precip", season: "DJF" },
        { index, basePath, fetchImpl },
      );
      expect(outcome.cellId, `lat ${lat}`).toBe(expectedCell);
      expect(outcome.tileKey, `lat ${lat}`).toBe(expectedTile);
      expect(outcome.status, `lat ${lat}`).toBe("ok");
    }
  });

  it("wraps longitudes beyond one full turn", async () => {
    const fetchImpl = diskFetch([]);

    for (const [lon, expectedCell, expectedTile] of [
      [540, "cell_0.5_-179.5", "-180_0"],
      [-540, "cell_0.5_-179.5", "-180_0"],
      [720.5, "cell_0.5_0.5", "0_0"],
      [-359.5, "cell_0.5_0.5", "0_0"],
    ] as const) {
      const outcome = await fetchCellSeries(
        { lon, lat: 0, variable: "precip", season: "DJF" },
        { index, basePath, fetchImpl },
      );
      expect(outcome.cellId, `lon ${lon}`).toBe(expectedCell);
      expect(outcome.tileKey, `lon ${lon}`).toBe(expectedTile);
      expect(outcome.status, `lon ${lon}`).toBe("ok");
    }
  });

  it("takes the contract variable names as well as directory slugs", async () => {
    const fetchImpl = diskFetch([]);
    const request = { lon: 106.8, lat: -6.2, season: "DJF" } as const;

    const rain = await fetchCellSeries(
      { ...request, variable: "precipitation" },
      { index, basePath, fetchImpl },
    );
    const heat = await fetchCellSeries(
      { ...request, variable: "temperature" },
      { index, basePath, fetchImpl },
    );

    expect(rain.status).toBe("ok");
    expect(heat.status).toBe("ok");
    if (rain.status === "ok") expect(rain.result.variable).toBe("precipitation");
    if (heat.status === "ok") expect(heat.result.variable).toBe("temperature");
  });
});

describe("real-grid no-data paths", () => {
  it("skips a tile missing from available_tiles without a request", async () => {
    const restricted = JSON.parse(JSON.stringify(REAL_INDEX)) as GridIndex;
    restricted.variables.precip.available_tiles = { DJF: ["0_0"] };

    const calls: string[] = [];
    const outcome = await fetchCellSeries(
      { lon: -113.49, lat: 53.55, variable: "precip", season: "DJF" },
      {
        index: restricted,
        basePath: gridDir,
        fetchImpl: diskFetch(calls),
      },
    );

    expect(outcome.status).toBe("no-data");
    if (outcome.status === "no-data") {
      expect(outcome.reason).toBe("no-tile");
      expect(outcome.message).toBe("No data (ocean or outside sensor domain)");
      expect(outcome.tileUrl).toBe(`${gridDir}/precip/DJF/-120_50.json`);
    }
    expect(calls).toHaveLength(0);
  });

  it("turns a missing tile file into a no-data answer, not an exception", async () => {
    const outcome = await fetchCellSeries(
      { lon: 106.8, lat: -6.2, variable: "precip", season: "DJF" },
      {
        index: REAL_INDEX,
        basePath: gridDir,
        fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }),
      },
    );

    expect(outcome.status).toBe("no-data");
    if (outcome.status === "no-data") {
      expect(outcome.reason).toBe("no-tile");
      expect(outcome.message).toBe("No data (ocean or outside sensor domain)");
    }
  });
});

