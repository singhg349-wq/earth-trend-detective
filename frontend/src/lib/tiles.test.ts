import { describe, expect, it } from "vitest";

import {
  INFERENCE_METHOD,
  SLOPE_CI_NOTE,
  fetchCellSeries,
  type CellSeriesOutcome,
  type FetchResponseLike,
  type GridIndex,
  type GridVariableMeta,
} from "./tiles";
import gridIndexFixture from "./__fixtures__/grid/index.json";
import workedTile from "./__fixtures__/grid/precip/DJF/-80_-10.json";
import inferenceIndexFixture from "./__fixtures__/grid/inference_index.json";
import inferenceTile from "./__fixtures__/grid/inference_tile.json";

const baseIndex = gridIndexFixture as unknown as GridIndex;
const inferenceBaseIndex = inferenceIndexFixture as unknown as GridIndex;

function makeIndex(
  variableOverrides: Partial<GridVariableMeta> = {},
  years: number[] = [2023, 2024, 2025],
): GridIndex {
  return {
    ...baseIndex,
    variables: {
      precip: {
        ...baseIndex.variables.precip,
        years_by_season: { DJF: years },
        ...variableOverrides,
      },
    },
  };
}

function jsonResponse(payload: unknown, status = 200): FetchResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function expectOk(outcome: CellSeriesOutcome) {
  expect(outcome.status).toBe("ok");
  if (outcome.status !== "ok") throw new Error("expected an ok outcome");
  return outcome;
}

function expectNoData(outcome: CellSeriesOutcome, reason: string) {
  expect(outcome.status).toBe("no-data");
  if (outcome.status !== "no-data") throw new Error("expected a no-data outcome");
  expect(outcome.reason).toBe(reason);
  return outcome;
}

function dynamicTileFetch(calls: string[]): (url: string) => Promise<FetchResponseLike> {
  return async (url: string) => {
    calls.push(url);
    const match = /\/precip\/DJF\/(-?\d+)_(-?\d+)\.json$/.exec(url);
    if (match === null) throw new Error(`unexpected URL ${url}`);
    return jsonResponse({
      v_slug: "precip",
      season: "DJF",
      tile: [Number(match[1]), Number(match[2])],
      cells: {},
    });
  };
}

function okInference(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: "ok",
    p_value: 0.012,
    ci: [0.119048, 0.248485],
    method: INFERENCE_METHOD,
    strict_check_pass: true,
    strict_check_p: 0.028,
    lag1: 0.11,
    caution: false,
    ci_note: SLOPE_CI_NOTE,
    n: 42,
    ...overrides,
  };
}

function tileWithInference(inference: unknown, fdr: unknown = null): unknown {
  return {
    v_slug: "precip",
    season: "DJF",
    tile: [-80, -10],
    cells: {
      "cell_-4.5_-79.5": {
        s: 187,
        v: Array.from({ length: 42 }, (_, index) => 400 + index),
        c: 1000,
        inference,
        fdr_significant: fdr,
      },
    },
  };
}

const unavailableInference = {
  status: "unavailable",
  p_value: null,
  ci: null,
  method: null,
  strict_check_pass: null,
  strict_check_p: null,
  lag1: null,
  caution: false,
  ci_note: SLOPE_CI_NOTE,
  n: null,
};

describe("fetchCellSeries worked example", () => {
  it("reproduces docs/GRID_FORMAT.md section 9 end to end", async () => {
    const calls: string[] = [];
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: baseIndex,
        basePath: "data/artifacts/grid",
        fetchImpl: async (url) => {
          calls.push(url);
          return jsonResponse(workedTile);
        },
        now: () => "2026-11-14T00:00:00.000Z",
      },
    );

    expect(calls).toEqual(["data/artifacts/grid/precip/DJF/-80_-10.json"]);
    expect(outcome.cellId).toBe("cell_-4.5_-79.5");
    expect(outcome.tileKey).toBe("-80_-10");

    const { result } = expectOk(outcome);
    expect(result.id).toBe("precip_cell_-4.5_-79.5_DJF");
    expect(result.variable).toBe("precipitation");
    expect(result.units).toBe("mm/day");
    expect(result.source.product).toBe("GPCPMON");
    expect(result.source.version).toBe("3.3");
    expect(result.region).toEqual({
      id: "cell_-4.5_-79.5",
      label: "4.5\u00b0S, 79.5\u00b0W (1\u00b0 cell)",
      geometry: "BBOX",
      bbox: [-80, -5, -79, -4],
      cells_used: 1,
      // docs/GRID_FORMAT.md section 9.5 prints 12284.1, but its own stated
      // formula and R=6371.0088 give 12326.1. The formula is implemented.
      area_km2: 12326.1,
    });
    expect(result.season).toEqual({
      code: "DJF",
      year_label: "January year",
      months: [12, 1, 2],
      aggregation: "day-weighted mean of 3 monthly values",
    });
    expect(result.years).toEqual([2023, 2024, 2025]);
    expect(result.values).toEqual([1.42, 1.5, 1.68]);
    expect(result.coverage).toEqual([1, 1, 1]);
    expect(result.anomaly_baseline).toBeNull();
    expect(result.geometry_file).toBeNull();

    expect(result.trend.sen_slope_per_decade).toBe(1.3);
    expect(result.trend.slope_units).toBe("mm/day/decade");
    expect(result.trend.method).toBe("Sen");
    expect(result.trend.n_valid).toBe(3);
    expect(result.trend.period).toEqual([2023, 2025]);
    expect(result.trend.intercept).toBeCloseTo(-261.62, 6);
    expect(result.trend.inference).toEqual({
      status: "unavailable",
      p_value: null,
      ci: null,
      method: null,
      strict_check_pass: null,
      strict_check_p: null,
      lag1: null,
      caution: false,
      ci_note: SLOPE_CI_NOTE,
      n: null,
    });
    expect(result.trend.fdr_significant).toBeNull();

    expect(result.validation.status).toBe("unchecked-same-method");
    expect(result.generated).toBe("2026-11-14T00:00:00.000Z");
    expect(result.template_summary).toBe(
      "For cell_-4.5_-79.5 (4.5\u00b0S, 79.5\u00b0W (1\u00b0 cell)) in DJF (2023-2025, n=3), " +
        "precipitation has a descriptive Theil-Sen slope of +1.300 mm/day/decade " +
        "(inference status: unavailable; validation: unchecked-same-method).",
    );
  });

  it("accepts the contract variable name as well as the slug", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precipitation", season: "DJF" },
      {
        index: baseIndex,
        fetchImpl: async () => jsonResponse(workedTile),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.id).toBe("precip_cell_-4.5_-79.5_DJF");
  });
});

describe("fetchCellSeries no-data handling", () => {
  it("does not request a tile listed as unavailable (ocean or land-only gap)", async () => {
    let called = 0;
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: ["0_0"] }),
        fetchImpl: async () => {
          called += 1;
          return jsonResponse(workedTile);
        },
      },
    );

    const noData = expectNoData(outcome, "no-tile");
    expect(called).toBe(0);
    expect(noData.message).toBe("No data (ocean or outside sensor domain)");
    expect(noData.tileUrl).toBe("data/artifacts/grid/precip/DJF/-80_-10.json");
  });

  it("treats an HTTP 404 as a missing tile", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: "ALL_648" }),
        fetchImpl: async () => jsonResponse({}, 404),
      },
    );

    const noData = expectNoData(outcome, "no-tile");
    expect(noData.message).toBe("No data (ocean or outside sensor domain)");
  });

  it("reports a missing cell inside a partial tile", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: "ALL_648" }),
        fetchImpl: async () =>
          jsonResponse({ ...workedTile, cells: {} }),
      },
    );

    const noData = expectNoData(outcome, "no-cell");
    expect(noData.message).toBe("No data for this 1\u00b0 cell");
  });

  it("reports a cell whose years are all fill", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: "ALL_648" }),
        fetchImpl: async () =>
          jsonResponse({
            ...workedTile,
            cells: {
              "cell_-4.5_-79.5": { s: -32768, v: [-32768, -32768, -32768], c: 1000 },
            },
          }),
      },
    );

    expectNoData(outcome, "all-fill");
  });

  it("rejects a tile whose identity does not match the request", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: "ALL_648" }),
        fetchImpl: async () => jsonResponse({ ...workedTile, v_slug: "soil" }),
      },
    );

    expectNoData(outcome, "bad-tile");
  });

  it("reports network/fetch failures", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: "ALL_648" }),
        fetchImpl: async () => {
          throw new Error("offline");
        },
      },
    );

    expectNoData(outcome, "fetch-failed");
  });

  it("reports unknown variables and seasons", async () => {
    const fetchImpl = async () => {
      throw new Error("should not be called");
    };

    expectNoData(
      await fetchCellSeries(
        { lon: 0, lat: 0, variable: "nope", season: "DJF" },
        { index: baseIndex, fetchImpl },
      ),
      "unknown-variable",
    );
    expectNoData(
      await fetchCellSeries(
        { lon: 0, lat: 0, variable: "precip", season: "XYY" },
        { index: baseIndex, fetchImpl },
      ),
      "unknown-season",
    );
  });

  it("reports an invalid index", async () => {
    const outcome = await fetchCellSeries(
      { lon: 0, lat: 0, variable: "precip", season: "DJF" },
      {
        index: {} as GridIndex,
        fetchImpl: async () => jsonResponse(workedTile),
      },
    );

    expectNoData(outcome, "index-invalid");
  });
});

describe("fetchCellSeries int16 decoding", () => {
  it("nulls fill values and decodes array coverage", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: "ALL_648" }, [1984, 1985, 1986]),
        fetchImpl: async () =>
          jsonResponse({
            v_slug: "precip",
            season: "DJF",
            tile: [-80, -10],
            cells: {
              "cell_-4.5_-79.5": {
                s: -32768,
                v: [142, -32768, 168],
                c: [500, 0, 1000],
              },
            },
          }),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.values).toEqual([1.42, null, 1.68]);
    expect(result.coverage).toEqual([0.5, 0, 1]);
    expect(result.trend.sen_slope_per_decade).toBeNull();
    expect(result.trend.intercept).toBeNull();
    expect(result.trend.n_valid).toBe(2);
    expect(result.trend.period).toEqual([1984, 1986]);
    expect(result.template_summary).toContain("has no descriptive Theil-Sen slope available");
  });

  it("uses 0 coverage for missing years when c is the compact 1000 form", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: makeIndex({ available_tiles: "ALL_648" }, [1984, 1985]),
        fetchImpl: async () =>
          jsonResponse({
            v_slug: "precip",
            season: "DJF",
            tile: [-80, -10],
            cells: {
              "cell_-4.5_-79.5": { s: 500, v: [100, -32768], c: 1000 },
            },
          }),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.values).toEqual([1, null]);
    expect(result.coverage).toEqual([1, 0]);
  });
});

describe("fetchCellSeries coordinate lookup", () => {
  it("normalises longitude and clamps latitude exactly as the spec says", async () => {
    const calls: string[] = [];
    const fetchImpl = dynamicTileFetch(calls);
    const index = makeIndex({ available_tiles: "ALL_648" });

    const north = expectNoData(
      await fetchCellSeries(
        { lon: 180.2, lat: 90, variable: "precip", season: "DJF" },
        { index, fetchImpl },
      ),
      "no-cell",
    );
    expect(north.cellId).toBe("cell_89.5_-179.5");
    expect(north.tileKey).toBe("-180_80");
    expect(calls.at(-1)).toBe("data/artifacts/grid/precip/DJF/-180_80.json");

    const south = expectNoData(
      await fetchCellSeries(
        { lon: -180.2, lat: -90, variable: "precip", season: "DJF" },
        { index, fetchImpl },
      ),
      "no-cell",
    );
    expect(south.cellId).toBe("cell_-89.5_179.5");
    expect(south.tileKey).toBe("170_-90");

    const wrapped = expectNoData(
      await fetchCellSeries(
        { lon: 540, lat: 0.2, variable: "precip", season: "DJF" },
        { index, fetchImpl },
      ),
      "no-cell",
    );
    expect(wrapped.cellId).toBe("cell_0.5_-179.5");
    expect(wrapped.tileKey).toBe("-180_0");
  });

  it("rejects non-finite click coordinates", async () => {
    await expect(
      fetchCellSeries(
        { lon: Number.NaN, lat: 0, variable: "precip", season: "DJF" },
        { index: baseIndex, fetchImpl: async () => jsonResponse(workedTile) },
      ),
    ).rejects.toThrow(RangeError);
  });
});

describe("fetchCellSeries inference and FDR pass-through", () => {
  it("copies a valid tile inference block into the contract result", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: inferenceBaseIndex,
        fetchImpl: async () => jsonResponse(inferenceTile),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.years).toHaveLength(42);
    expect(result.trend.n_valid).toBe(42);
    expect(result.trend.sen_slope_per_decade).toBeCloseTo(0.187, 3);
    expect(result.trend.fdr_significant).toBe(true);
    expect(result.trend.inference).toEqual({
      status: "ok",
      p_value: 0.012,
      ci: [0.119048, 0.248485],
      method: INFERENCE_METHOD,
      strict_check_pass: true,
      strict_check_p: 0.028,
      lag1: 0.11,
      caution: false,
      ci_note: SLOPE_CI_NOTE,
      n: 42,
    });
    expect(result.template_summary).toContain("inference status: ok");
  });

  it("carries a failed strict check, the caution flag and a false FDR flag", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -5.61, variable: "precip", season: "DJF" },
      {
        index: inferenceBaseIndex,
        fetchImpl: async () => jsonResponse(inferenceTile),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.region.id).toBe("cell_-5.5_-79.5");
    expect(result.trend.fdr_significant).toBe(false);
    expect(result.trend.inference.status).toBe("ok");
    expect(result.trend.inference.strict_check_pass).toBe(false);
    expect(result.trend.inference.strict_check_p).toBe(0.19);
    expect(result.trend.inference.lag1).toBe(0.34);
    expect(result.trend.inference.caution).toBe(true);
  });

  it("falls back to unavailable inference when the tile has no optional fields", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -6.61, variable: "precip", season: "DJF" },
      {
        index: inferenceBaseIndex,
        fetchImpl: async () => jsonResponse(inferenceTile),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.region.id).toBe("cell_-6.5_-79.5");
    expect(result.trend.inference).toEqual(unavailableInference);
    expect(result.trend.fdr_significant).toBeNull();
    expect(result.template_summary).toContain("inference status: unavailable");
  });

  it("derives caution from lag1 and ignores a non-boolean FDR flag", async () => {
    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: inferenceBaseIndex,
        fetchImpl: async () =>
          jsonResponse(tileWithInference(okInference({ lag1: 0.5 }), "yes")),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.trend.inference.status).toBe("ok");
    expect(result.trend.inference.lag1).toBe(0.5);
    expect(result.trend.inference.caution).toBe(true);
    expect(result.trend.fdr_significant).toBeNull();
  });

  it("keeps a valid ok block when the strict check was not computed", async () => {
    const inference = okInference();
    delete inference.strict_check_pass;
    delete inference.strict_check_p;

    const outcome = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      {
        index: inferenceBaseIndex,
        fetchImpl: async () => jsonResponse(tileWithInference(inference)),
      },
    );

    const { result } = expectOk(outcome);
    expect(result.trend.inference.status).toBe("ok");
    expect(result.trend.inference.strict_check_pass).toBeNull();
    expect(result.trend.inference.strict_check_p).toBeNull();
  });

  it("refuses ok blocks whose displayed numbers are unusable", async () => {
    const variants: Array<[string, unknown]> = [
      ["null p-value", okInference({ p_value: null })],
      ["p-value above one", okInference({ p_value: 1.2 })],
      ["reversed interval", okInference({ ci: [0.3, 0.1] })],
      ["missing lag1", okInference({ lag1: null })],
      ["too few observations", okInference({ n: 3 })],
      ["unknown status", okInference({ status: "maybe" })],
      ["not an object", "ok"],
    ];

    for (const [label, inference] of variants) {
      const outcome = await fetchCellSeries(
        { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
        {
          index: inferenceBaseIndex,
          fetchImpl: async () => jsonResponse(tileWithInference(inference)),
        },
      );
      const { result } = expectOk(outcome);
      expect(result.trend.inference, label).toEqual(unavailableInference);
    }
  });
});

describe("fetchCellSeries index loading", () => {
  it("loads index.json once per base path when no index is supplied", async () => {
    const basePath = "test-cache/grid";
    const calls: string[] = [];
    const fetchImpl = async (url: string): Promise<FetchResponseLike> => {
      calls.push(url);
      if (url.endsWith("/index.json")) return jsonResponse(baseIndex);
      return jsonResponse(workedTile);
    };

    const first = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      { basePath, fetchImpl },
    );
    const second = await fetchCellSeries(
      { lon: -79.23, lat: -4.61, variable: "precip", season: "DJF" },
      { basePath, fetchImpl },
    );

    expectOk(first);
    expectOk(second);
    expect(calls).toEqual([
      `${basePath}/index.json`,
      `${basePath}/precip/DJF/-80_-10.json`,
      `${basePath}/precip/DJF/-80_-10.json`,
    ]);
  });
});
