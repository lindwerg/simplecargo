import { describe, expect, it } from "vitest";

import { normalizeExtraction } from "./normalize";
import { extractionResultSchema } from "./schema";

// NOTE: interpretation (forward-fill, dropping «Итого», reading road codes) is the
// AI's job — verified end-to-end against the real xlsx, not here. This module only
// does format-agnostic hygiene, which is what these tests pin.

function result(lines: unknown[]) {
  return extractionResultSchema.parse({ lines });
}

describe("normalizeExtraction (format-agnostic hygiene)", () => {
  it("trims and nullifies empty strings", () => {
    const r = normalizeExtraction(
      result([{ originRaw: "  Асбест ", originRoadRaw: "  ", destRaw: "Москва", wagonsRequested: 5 }]),
    );
    expect(r.lines[0].originRaw).toBe("Асбест");
    expect(r.lines[0].originRoadRaw).toBeNull();
  });

  it("coerces wagon counts to positive ints and drops invalid to null+warning", () => {
    const r = normalizeExtraction(
      result([
        { originRaw: "А", destRaw: "Б", wagonsRequested: 40.7 },
        { originRaw: "В", destRaw: "Г", wagonsRequested: 0 },
      ]),
    );
    expect(r.lines[0].wagonsRequested).toBe(41);
    expect(r.lines[1].wagonsRequested).toBeNull();
    expect(r.warnings.some((w) => w.includes("В → Г"))).toBe(true);
  });

  it("drops rows with neither origin nor destination", () => {
    const r = normalizeExtraction(
      result([
        { originRaw: null, destRaw: null, wagonsRequested: 10 },
        { originRaw: "А", destRaw: "Б", wagonsRequested: 10 },
      ]),
    );
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].originRaw).toBe("А");
  });

  it("coerces non-positive tonnage/rate to null", () => {
    const r = normalizeExtraction(
      result([{ originRaw: "А", destRaw: "Б", wagonsRequested: 5, tonnagePerWagon: -1, targetRatePerWagon: 0 }]),
    );
    expect(r.lines[0].tonnagePerWagon).toBeNull();
    expect(r.lines[0].targetRatePerWagon).toBeNull();
  });

  it("passes road codes through untouched (AI owns interpretation)", () => {
    const r = normalizeExtraction(
      result([{ originRaw: "А", originRoadRaw: "СВР", destRaw: "Б", destRoadRaw: "ГОР", wagonsRequested: 5 }]),
    );
    expect(r.lines[0].originRoadRaw).toBe("СВР");
    expect(r.lines[0].destRoadRaw).toBe("ГОР");
  });
});
