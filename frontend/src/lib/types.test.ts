import { describe, expect, it } from "vitest";

import { INFERENCE_CAUTION_LAG1, INFERENCE_METHOD, SLOPE_CI_NOTE } from "./tiles";
import type { TrendInference } from "./types";
import inferenceFixture from "./__fixtures__/inference_cases.json";

/**
 * JSON imports widen string values to `string`, so the fixture needs one cast
 * before it can be held as `TrendInference`. After that the loop checks the
 * rules the type promises, so a fixture edit that breaks the shape fails here.
 */
const cases = inferenceFixture.cases as unknown as ReadonlyArray<{
  name: string;
  inference: TrendInference;
}>;

describe("inference fixture shape", () => {
  it("has the agreed fields and the agreed caution rule", () => {
    expect(cases.length).toBeGreaterThanOrEqual(3);
    expect(inferenceFixture.method).toBe(INFERENCE_METHOD);
    expect(inferenceFixture.ci_note).toBe(SLOPE_CI_NOTE);

    for (const { name, inference } of cases) {
      expect(["ok", "unavailable"], name).toContain(inference.status);
      expect(typeof inference.caution, name).toBe("boolean");
      expect(inference.ci_note, name).toBe(SLOPE_CI_NOTE);

      if (inference.status === "ok") {
        expect(inference.p_value, name).not.toBeNull();
        expect(inference.p_value as number, name).toBeGreaterThanOrEqual(0);
        expect(inference.p_value as number, name).toBeLessThanOrEqual(1);
        expect(inference.ci, name).not.toBeNull();
        const [low, high] = inference.ci as [number, number];
        expect(low, name).toBeLessThanOrEqual(high);
        expect(inference.method, name).toBe(INFERENCE_METHOD);
        expect(inference.lag1, name).not.toBeNull();
        expect(inference.caution, name).toBe(
          (inference.lag1 as number) >= INFERENCE_CAUTION_LAG1,
        );
        expect(inference.n as number, name).toBeGreaterThanOrEqual(8);
      } else {
        expect(inference.p_value, name).toBeNull();
        expect(inference.ci, name).toBeNull();
        expect(inference.method, name).toBeNull();
        expect(inference.strict_check_pass, name).toBeNull();
        expect(inference.strict_check_p, name).toBeNull();
        expect(inference.lag1, name).toBeNull();
        expect(inference.caution, name).toBe(false);
      }
    }
  });

  it("covers the unavailable, no-caution and caution display states", () => {
    expect(cases.some((item) => item.inference.status === "unavailable")).toBe(
      true,
    );
    expect(
      cases.some(
        (item) => item.inference.status === "ok" && !item.inference.caution,
      ),
    ).toBe(true);
    expect(
      cases.some(
        (item) => item.inference.status === "ok" && item.inference.caution,
      ),
    ).toBe(true);
  });
});
