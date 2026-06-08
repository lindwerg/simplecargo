import { describe, expect, it } from "vitest";

import {
  buildEtsngCatalog,
  chargeableTons,
  classLookup,
  MVN_BY_CAPACITY,
  resolveMvn,
  type EtsngEntry,
} from "./classLookup";

// Fixtures for the щебень class-1 path (ЕТСНГ 232395 гранитный щебень) plus a цемент
// row with МВН="gp" (по грузоподъёмности), per TARIFF_CALCULATOR §2.5.
const SHCHEBEN: EtsngEntry = {
  code: "232395",
  name: "Щебень гранитный",
  tariffClass: 1,
  mvnByWagon: { pv: 69, default: 69 },
};

const CEMENT: EtsngEntry = {
  code: "281000",
  name: "Цемент",
  tariffClass: 1,
  mvnByWagon: { default: MVN_BY_CAPACITY },
};

const TRIPLET: EtsngEntry = {
  code: "100001",
  name: "Тестовый груз с триплетом МВН",
  tariffClass: 2,
  mvnByWagon: { kr: 40, pv: 60, pl: 46 },
};

const CATALOG = buildEtsngCatalog([SHCHEBEN, CEMENT, TRIPLET]);

describe("resolveMvn", () => {
  it("returns the wagon-specific МВН when the slot is set", () => {
    expect(resolveMvn(TRIPLET.mvnByWagon, "ПВ")).toBe(60);
    expect(resolveMvn(TRIPLET.mvnByWagon, "КР")).toBe(40);
    expect(resolveMvn(TRIPLET.mvnByWagon, "ПЛ")).toBe(46);
  });

  it("falls back to default when the wagon slot is absent", () => {
    expect(resolveMvn(SHCHEBEN.mvnByWagon, "ХП")).toBe(69);
  });

  it("returns the gp sentinel for capacity-based МВН", () => {
    expect(resolveMvn(CEMENT.mvnByWagon, "ХЦ")).toBe(MVN_BY_CAPACITY);
  });

  it("returns null for a null/empty map", () => {
    expect(resolveMvn(null, "ПВ")).toBeNull();
    expect(resolveMvn({}, "ПВ")).toBeNull();
  });
});

describe("classLookup", () => {
  it("resolves class 1 + МВН for щебень in a полувагон", () => {
    const result = classLookup(CATALOG, "232395", "ПВ");
    expect(result.found).toBe(true);
    expect(result.tariffClass).toBe(1);
    expect(result.mvn).toBe(69);
  });

  it("reports found:false for an unknown code (never guesses)", () => {
    const result = classLookup(CATALOG, "999999", "ПВ");
    expect(result.found).toBe(false);
  });
});

describe("chargeableTons", () => {
  it("lifts a light load up to the МВН floor", () => {
    expect(chargeableTons(55, 69)).toBe(69);
  });

  it("keeps actual weight when it exceeds the floor", () => {
    expect(chargeableTons(70, 69)).toBe(70);
  });

  it("uses actual weight when МВН is gp (capacity-based, no numeric floor)", () => {
    expect(chargeableTons(58, MVN_BY_CAPACITY)).toBe(58);
  });

  it("uses actual weight when МВН is unknown (null)", () => {
    expect(chargeableTons(58, null)).toBe(58);
  });
});
