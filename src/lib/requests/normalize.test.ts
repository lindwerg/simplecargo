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

  it("normalizes a recognized per-line wagon type to its canonical code", () => {
    const r = normalizeExtraction(
      result([{ originRaw: "А", destRaw: "Б", wagonsRequested: 5, wagonType: "полувагон" }]),
    );
    expect(r.lines[0].wagonType).toBe("ПВ");
  });

  it("keeps an unrecognized wagon type as raw trimmed text (never drops)", () => {
    const r = normalizeExtraction(
      result([{ originRaw: "А", destRaw: "Б", wagonsRequested: 5, wagonType: "  спецвагон XYZ " }]),
    );
    expect(r.lines[0].wagonType).toBe("спецвагон XYZ");
  });

  it("normalizes the header wagon type (inherited default) to its canonical code", () => {
    const r = normalizeExtraction(
      extractionResultSchema.parse({
        wagonType: "крытый вагон",
        lines: [{ originRaw: "А", destRaw: "Б", wagonsRequested: 5 }],
      }),
    );
    expect(r.wagonType).toBe("КР");
  });

  it("passes a tariff_indicative rate expression through with markup, class, and ref", () => {
    const r = normalizeExtraction(
      result([
        {
          originRaw: "А",
          destRaw: "Б",
          wagonsRequested: 5,
          targetRateKind: "tariff_indicative",
          targetRateMarkupPct: 10,
          targetTariffClass: 2,
          targetTariffRef: "10-01",
        },
      ]),
    );
    expect(r.lines[0].targetRateKind).toBe("tariff_indicative");
    expect(r.lines[0].targetRateMarkupPct).toBe(10);
    expect(r.lines[0].targetTariffClass).toBe(2);
    expect(r.lines[0].targetTariffRef).toBe("10-01");
  });

  it("allows a zero markup and rejects an out-of-range tariff class / unknown rate kind", () => {
    const r = normalizeExtraction(
      result([
        {
          originRaw: "А",
          destRaw: "Б",
          wagonsRequested: 5,
          targetRateKind: "nonsense",
          targetRateMarkupPct: 0,
          targetTariffClass: 9,
        },
      ]),
    );
    expect(r.lines[0].targetRateMarkupPct).toBe(0); // 0 is valid — not coerced away
    expect(r.lines[0].targetRateKind).toBeNull();
    expect(r.lines[0].targetTariffClass).toBeNull();
  });
});
