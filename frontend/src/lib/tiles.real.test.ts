/**
 * Decode two real tile files from disk and compare them with Python.
 *
 * ``frontend/src/lib/__fixtures__/real_tiles.json`` is written by
 * ``scripts/make_stats_fixtures.py`` from the same files with
 * :func:`backend.trend.stats.sen_slope`, and
 * ``tests/test_js_python_slope.py`` re-checks it against those tiles. This test
 * closes the loop: it reads the real ``index.json`` and tile JSON from
 * ``data/artifacts/grid`` itself, runs the browser lookup and decoder, and
 * compares every decoded value, coverage and slope with the Python numbers.
 *
 * The real artifacts store ``s: -32768`` in every cell today, so the slope
 * asserted here is the documented Sen slope recomputed from the decoded series
 * by tiles.ts (see the note beside the fallback there), not a stored ``s``.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { fetchCellSeries, type FetchLike, type GridIndex } from "./tiles";
import { senSlope } from "./stats";
import realTilesFixture from "./__fixtures__/real_tiles.json";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

interface DecodedCell {
  years: number[];
  values: (number | null)[];
  coverage: number[];
  n_valid: number;
  slope_per_decade_raw: number;
  intercept: number;
}

interface RealTileExpectation {
  path: string;
  v_slug: string;
  season: string;
  tile: [number, number];
  cells: Array<{
    cell_id: string;
    click: { lon: number; lat: number };
    raw_s: number;
    decoded: DecodedCell;
  }>;
}

const realTiles = realTilesFixture as unknown as {
  note: string;
  index_path: string;
  tiles: RealTileExpectation[];
};

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8"));
}

const index = readJson(realTiles.index_path) as GridIndex;

const tilePayloads = new Map<string, unknown>();
for (const entry of realTiles.tiles) {
  tilePayloads.set(`data/artifacts/grid/precip/DJF/${entry.tile[0]}_${entry.tile[1]}.json`, readJson(entry.path));
}

const fetchFromDisk: FetchLike = async (url) => {
  if (url.endsWith("/index.json")) {
    return { ok: true, status: 200, json: async () => index };
  }
  const payload = tilePayloads.get(url);
  if (payload === undefined) {
    throw new Error(`test did not read a real tile for ${url}`);
  }
  return { ok: true, status: 200, json: async () => payload };
};

describe("real grid artifacts on disk", () => {
  it("uses the per-season available_tiles map from the real index", () => {
    const available = index.variables.precip.available_tiles;
    expect(available).toBeDefined();
    expect(Array.isArray(available)).toBe(false);
    expect(typeof available).toBe("object");
    if (typeof available === "object" && !Array.isArray(available)) {
      expect(available.DJF).toContain("-80_-10");
      expect(available.DJF).toContain("100_-10");
      expect(available.DJF).toHaveLength(648);
    }
  });

  it("reads two real tile files from disk", () => {
    expect(realTiles.tiles).toHaveLength(2);
    for (const entry of realTiles.tiles) {
      expect(readJson(entry.path)).toBeDefined();
      expect(tilePayloads.has(`data/artifacts/grid/precip/DJF/${entry.tile[0]}_${entry.tile[1]}.json`)).toBe(true);
    }
  });

  it("matches the Python decode for every expected real cell", async () => {
    let checked = 0;
    for (const entry of realTiles.tiles) {
      for (const expected of entry.cells) {
        const outcome = await fetchCellSeries(
          {
            lon: expected.click.lon,
            lat: expected.click.lat,
            variable: "precip",
            season: "DJF",
          },
          {
            index,
            basePath: "data/artifacts/grid",
            fetchImpl: fetchFromDisk,
            now: () => "2026-11-14T00:00:00.000Z",
          },
        );

        expect(outcome.status, `${entry.path} ${expected.cell_id}`).toBe("ok");
        if (outcome.status !== "ok") continue;
        const { result } = outcome;

        expect(result.region.id).toBe(expected.cell_id);
        expect(result.years).toEqual(expected.decoded.years);
        expect(result.values).toEqual(expected.decoded.values);
        expect(result.coverage).toEqual(expected.decoded.coverage);
        expect(result.trend.n_valid).toBe(expected.decoded.n_valid);
        expect(result.trend.period).toEqual([
          expected.decoded.years[0],
          expected.decoded.years[expected.decoded.years.length - 1],
        ]);

        expect(result.trend.sen_slope_per_decade).not.toBeNull();
        expect(
          Math.abs(
            (result.trend.sen_slope_per_decade as number) -
              expected.decoded.slope_per_decade_raw,
          ),
        ).toBeLessThan(1e-9);
        expect(result.trend.intercept).toBeCloseTo(expected.decoded.intercept, 6);

        // The displayed slope must be exactly the browser Sen slope of the
        // decoded series, so the period selector returns the same number for
        // the full period.
        const direct = senSlope(result.years, result.values);
        expect(direct.slopePerDecade).not.toBeNull();
        expect(result.trend.sen_slope_per_decade).toBeCloseTo(
          direct.slopePerDecade as number,
          12,
        );

        checked += 1;
      }
    }
    expect(checked).toBe(4);
  });

  it("decodes the real int16 arrays exactly as Python does", async () => {
    // Spot-check raw integers against the decoded values for one cell, using
    // the same scale/offset/decimals from index.json that Python used.
    const entry = realTiles.tiles[0];
    const expected = entry.cells[0];
    const payload = tilePayloads.get(
      `data/artifacts/grid/precip/DJF/${entry.tile[0]}_${entry.tile[1]}.json`,
    ) as { cells: Record<string, { v: number[]; c: number }> };
    const raw = payload.cells[expected.cell_id];
    const meta = index.variables.precip;
    const decoded = raw.v.map((q) =>
      q === index.fill_int16
        ? null
        : Number((q * meta.scale + meta.offset).toFixed(meta.decimals)),
    );
    expect(decoded).toEqual(expected.decoded.values);
  });
});
