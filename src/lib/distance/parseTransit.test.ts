import { describe, expect, it } from "vitest";

import { normalizeStationName } from "@/lib/geo/normalize";

import { parseTransitField, type SpursField } from "./parseTransit";

/** Narrows to the spurs variant for assertion, failing loudly otherwise. */
function asSpurs(field: ReturnType<typeof parseTransitField>): SpursField {
  if (field.kind !== "spurs") {
    throw new Error(`expected spurs, got ${field.kind}`);
  }
  return field;
}

describe("parseTransitField — ТП literal", () => {
  it("flags a row whose field[4] is exactly 'ТП' as a transit point", () => {
    expect(parseTransitField("ТП")).toEqual({ kind: "tp" });
  });

  it("tolerates surrounding whitespace around the ТП literal", () => {
    expect(parseTransitField("  ТП  ")).toEqual({ kind: "tp" });
  });
});

describe("parseTransitField — spur lists", () => {
  it("parses a two-item comma list (doc example: Кандалакша-91, Кола-171)", () => {
    const result = asSpurs(parseTransitField("Кандалакша-91, Кола-171"));

    expect(result.spurs).toEqual([
      { name: normalizeStationName("Кандалакша"), km: 91 },
      { name: normalizeStationName("Кола"), km: 171 },
    ]);
  });

  it("splits a multi-hyphen name on the LAST hyphen (Комсомольск-Сортировочный-216)", () => {
    const result = asSpurs(parseTransitField("Комсомольск-Сортировочный-216"));

    expect(result.spurs).toHaveLength(1);
    expect(result.spurs[0]).toEqual({
      name: normalizeStationName("Комсомольск-Сортировочный"),
      km: 216,
    });
    // The trailing 216 must NOT leak into the name.
    expect(result.spurs[0]?.name).not.toContain("216");
  });

  it("treats '-0' as an own ТП with km 0 (doc example: Кандалакша-0, Мурманск-272)", () => {
    const result = asSpurs(parseTransitField("Кандалакша-0, Мурманск-272"));

    expect(result.spurs).toEqual([
      { name: normalizeStationName("Кандалакша"), km: 0 },
      { name: normalizeStationName("Мурманск"), km: 272 },
    ]);
  });

  it("normalizes spur names the same way the seed/resolver does", () => {
    const result = asSpurs(parseTransitField("Москва-Сортировочная-15"));

    expect(result.spurs[0]?.name).toBe(normalizeStationName("Москва-Сортировочная"));
  });
});

describe("parseTransitField — defensive degradation", () => {
  it("returns an empty spur list for blank / null / undefined input", () => {
    expect(asSpurs(parseTransitField("")).spurs).toEqual([]);
    expect(asSpurs(parseTransitField(null)).spurs).toEqual([]);
    expect(asSpurs(parseTransitField(undefined)).spurs).toEqual([]);
  });

  it("drops a token with a non-integer km rather than fabricating a distance", () => {
    const result = asSpurs(parseTransitField("Кола-abc, Мурманск-272"));

    expect(result.spurs).toEqual([{ name: normalizeStationName("Мурманск"), km: 272 }]);
  });

  it("drops a token with no trailing -km (a bare name)", () => {
    const result = asSpurs(parseTransitField("Кандалакша, Кола-171"));

    expect(result.spurs).toEqual([{ name: normalizeStationName("Кола"), km: 171 }]);
  });

  it("rejects a negative km token (leading-hyphen form is not -<digits>)", () => {
    // "Кола--5": last hyphen leaves rawName "Кола-", rawKm "5" → name still parses,
    // but a genuine negative like "Кола-_5" is non-numeric and dropped.
    const result = asSpurs(parseTransitField("Кола-x5"));
    expect(result.spurs).toEqual([]);
  });

  it("ignores empty segments from trailing/double commas", () => {
    const result = asSpurs(parseTransitField("Кола-171, , "));
    expect(result.spurs).toEqual([{ name: normalizeStationName("Кола"), km: 171 }]);
  });
});
