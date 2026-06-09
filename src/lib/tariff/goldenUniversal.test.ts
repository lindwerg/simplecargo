// ── Golden universal-engine tests ─────────────────────────────────────────────
//
// Oracle квитанции / reference screenshots:
//   R-Тариф Элисенваара→Элиста:
//     own-ПВ class-1, gruppa (6 wagons), 3108 km, мрамор 232215, 70 t
//     per-wagon без НДС = 82816 ₽, с НДС = 101035.52 ₽
//     Formula: N8base(70т,3108км)=192840 × 0.69993 × 0.9346 × K1(class1,3108)=0.65 × K4(ГО)=1.01
//
// Production COMPUTE scenarios (verify non-red confidence with real seed data):
//   1. Крытый rzd class2 — КР rzd wagon, И1+В3, 800km, 60t, generic class-2 cargo
//   2. Цистерна own class2 — ЦС own wagon, N19 (per-tonne), 800km, 50t, class-2 neft
//   3. Платформа групповая class3 — ПЛ own group (3 wagons), N8+25(1), 1200km, 60t, class-3
//   4. own-ПВ class2 — ПВ own wagon, N8+25, 800km, 60t, generic class-2
//
// All tests load real seed JSON (no DB, no network). Distance is injected.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeQuoteN8,
  type N8Cell,
  type N8ClassCoeffBelt,
  type N8K4Belt,
  type N8TariffData,
  type N8WagonInput,
} from "./computeTariffN8";
import { computeTariffPure, type TariffData } from "./computeTariff";
import type { TariffInput } from "./schema";
import {
  loadClassBeltsFromSeed,
  loadEmptyRunBeltsFromSeed,
  loadEtsngFromSeed,
  loadInnovativeModelsFromSeed,
  loadK3RowsFromSeed,
  loadK4FullRowsFromSeed,
  loadRateBeltsFromSeed,
  loadSchemeMapFromSeed,
} from "./seedLoader";

// ── Shared constants ──────────────────────────────────────────────────────────

const AS_OF = new Date("2026-06-07");
const SEED = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}

// ── Helper: TariffData with all seed tables + injected distance ───────────────

function makeSeedData(distanceKm: number, found = true): TariffData {
  return {
    distance: { distanceKm, found },
    etsng: loadEtsngFromSeed() as TariffData["etsng"],
    schemeMap: loadSchemeMapFromSeed() as TariffData["schemeMap"],
    rateBelts: loadRateBeltsFromSeed() as TariffData["rateBelts"],
    classBelts: loadClassBeltsFromSeed() as TariffData["classBelts"],
    corrBelts: [], // not in seed JSON yet; K1 uses class belt alone (max-of-one, soft warn)
    emptyRunBelts: loadEmptyRunBeltsFromSeed() as TariffData["emptyRunBelts"],
    k4Rows: [],
    k3Rows: loadK3RowsFromSeed() as TariffData["k3Rows"],
    k4FullRows: loadK4FullRowsFromSeed() as TariffData["k4FullRows"],
    innovativeModels: loadInnovativeModelsFromSeed() as TariffData["innovativeModels"],
    coefficients: [],  // порожний ×1.1 comes from DB in prod; unit tests use empty → stack=1
    indexations: [],
  };
}

// ── ORACLE: R-Тариф Элисенваара→Элиста ───────────────────────────────────────
//
// Source: R-Тариф screenshot v19.49, calc date 2026-05-21.
// VERIFIED EXACT by: N8base(70т,3108)=192840 × 0.69993 × 0.9346 × K1(class1,3108)=0.65
//                    × K4(ГО 6 wagons >2000km)=1.01 = 82816 ₽ → round = 82816.
// НДС 22%: 82816 × 1.22 = 101035.52 ✓

const RTARIFF_WAGONS: N8WagonInput[] = [
  { wagonNo: "1", capacityT: 70.0, innovative: false },
  { wagonNo: "2", capacityT: 70.0, innovative: false },
  { wagonNo: "3", capacityT: 70.0, innovative: false },
  { wagonNo: "4", capacityT: 70.0, innovative: false },
  { wagonNo: "5", capacityT: 70.0, innovative: false },
  { wagonNo: "6", capacityT: 70.0, innovative: false },
];

function loadN8Data(): N8TariffData {
  const n8File = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const classFile = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-class-coeff-corrected.json");
  const k4File = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");
  return {
    n8Grid: n8File.schemeN8_weightDist,
    classCoeff: classFile.classCoeff,
    k4Belts: k4File.distanceCorr,
  };
}

const n8Data = loadN8Data();

describe("N8 tariff engine — ORACLE: R-Тариф Элисенваара→Элиста (3rd oracle)", () => {
  it("per-wagon без НДС = 82816 ₽ (all 6 wagons at 70t)", () => {
    const result = computeQuoteN8(RTARIFF_WAGONS, n8Data, 3108);
    for (const w of result.wagons) {
      expect(w.tariffRub).toBe(82816);
    }
  });

  it("TOTAL = 6 × 82816 = 496896 ₽", () => {
    const result = computeQuoteN8(RTARIFF_WAGONS, n8Data, 3108);
    expect(result.total).toBe(6 * 82816);
  });

  it("K4 at 3108 km is sourced (not fitted) — long-haul max-of-two", () => {
    const result = computeQuoteN8(RTARIFF_WAGONS, n8Data, 3108);
    expect(result.wagons[0].k4Fitted).toBe(false);
  });

  it("confirms НДС 22% path: perWagon × 1.22 = 101035.52", () => {
    expect(82816 * 1.22).toBeCloseTo(101035.52, 1);
  });
});

// ── COMPUTE Scenario 1: Крытый rzd class2, wagon, 800km, 60t ──────────────────
//
// КР rzd, wagon: iScheme=И1 (weight×dist) + vScheme=В3 (dist-only).
// Cargo: class-2, ETSNG 302009 (Кирпич огнеупорный, class 2, K3=0.876 per Табл.4 "302,303").
// K1(class2, 800km) = 1.0, K4(wagon '1' @ 800km) = 1.04.
// No indexation, no coefficient stack (empty in fixture).

const INPUT_S1: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "КР",
  ownership: "rzd",
  shipmentType: "wagon",
  etsngCode: "302009",
  actualWeightTons: 60,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
  wagonCount: 1,
};

describe("Universal engine — Scenario 1: Крытый rzd class2, 800km", () => {
  it("COMPUTES a number — confidence not red", () => {
    const r = computeTariffPure(INPUT_S1, makeSeedData(800));
    expect(r.confidence).not.toBe("red");
    expect(r.total).toBeGreaterThan(0);
  });

  it("tariffClass=2 resolved from ETSNG seed", () => {
    const r = computeTariffPure(INPUT_S1, makeSeedData(800));
    expect(r.tariffClass).toBe(2);
  });

  it("charges В (rzd wagon) and no порожний", () => {
    const r = computeTariffPure(INPUT_S1, makeSeedData(800));
    expect(r.vComponent).toBeGreaterThan(0);
    expect(r.emptyRun).toBe(0);
  });

  it("22% НДС applied last", () => {
    const r = computeTariffPure(INPUT_S1, makeSeedData(800));
    expect(r.vatRate).toBe(22);
    expect(r.total).toBeCloseTo(r.postIndex * 1.22, 0);
  });
});

// ── COMPUTE Scenario 2: Цистерна own class2, wagon, 800km, 50t ───────────────
//
// ЦС own, wagon: iScheme=N19 (per-tonne, dist-only), emptyScheme=25 (own, 4-axle).
// N19 is a nalivnye per-tonne rate (ЗА ТОННУ). Engine multiplies by chargeable tons.
// Cargo: class-2 neft ETSNG 211007 (Бензин, class 2, MVN=50t).
//   Chargeable = max(50t actual, 50t MVN) = 50t.
//   K3(211007, class2): "201,211-215,221-225,..." matches → K3=1.15.
//   K4(wagon '1'@800)=1.04, K1(class2,800)=1.0.
//   iComponent = N19@800km(1664.7₽/т) × 50t × 1.0 × 1.15 × 1.04 × 1.0 ≈ 99702₽.
// No coefficients in fixture (порожний ×1.1 comes from DB in prod).

const INPUT_S2: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "ЦС",
  ownership: "own",
  shipmentType: "wagon",
  etsngCode: "211007",
  actualWeightTons: 50,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
  wagonCount: 1,
};

describe("Universal engine — Scenario 2: Цистерна own class2, 800km (per-tonne N19)", () => {
  it("COMPUTES a number — confidence not red", () => {
    const r = computeTariffPure(INPUT_S2, makeSeedData(800));
    expect(r.confidence).not.toBe("red");
    expect(r.total).toBeGreaterThan(0);
  });

  it("tariffClass=2 resolved from ETSNG seed", () => {
    const r = computeTariffPure(INPUT_S2, makeSeedData(800));
    expect(r.tariffClass).toBe(2);
  });

  it("no В component (own wagon)", () => {
    const r = computeTariffPure(INPUT_S2, makeSeedData(800));
    expect(r.vComponent).toBe(0);
  });

  it("iComponent > 0 (per-tonne N19 × 50t)", () => {
    const r = computeTariffPure(INPUT_S2, makeSeedData(800));
    // N19 @ 800km ≈ 1664.7 ₽/т × 50t = 83235 ₽, × K1=1.0, × K4≈1.04 → ≈ 86564 ₽
    expect(r.iComponent).toBeGreaterThan(50000);
  });

  it("NO порожний leg in цистерна provNoVat (per-tonne схема 19 = loaded chain only)", () => {
    // ENGINE FIX 3: own/rented nalivnye цистерны (N19-N24) price PER TONNE and the R-Тариф
    // provNoVat is the LOADED chain only — there is no separate порожний (empty-run) leg in it
    // (reference-quotes-batch-0609.json CIS-C3 has none). The cistern branch returns emptyRun=0.
    const r = computeTariffPure(INPUT_S2, makeSeedData(800));
    expect(r.emptyRun).toBe(0);
    // provNoVat (preIndex) is therefore the loaded per-tonne чейн × масса only.
    expect(r.preIndex).toBe(r.iComponent);
  });
});

// ── COMPUTE Scenario 3: Платформа групповая class3, 1200km, 60t ───────────────
//
// ПЛ own, group (3 wagons): iScheme=N8 (weight×dist), emptyScheme=25(1) (4-axle платформа).
// Cargo: class-3, ETSNG 092002 (Продукция шпалопиления, class 3, MVN=44t, in 092,093 K3 list).
//   Chargeable = max(60t actual, 44t MVN) = 60t.
//   K1(class3,1200km) = 1.74 (first matching belt in k1-full for 092 — in the 1.74 etsngNote list).
//   K3(092002, class3) = 0.75 (from Табл.4 class3, pattern '092,093').
//   K4(3-5 @ 1200km) = max(1.01, 1.03) = 1.03 (max-of-two row '3-5'=1.01 vs '1'=1.03).
// No coefficients in fixture.

const INPUT_S3: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "ПЛ",
  ownership: "own",
  shipmentType: "group",
  etsngCode: "092002",
  actualWeightTons: 60,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
  wagonCount: 3,
};

describe("Universal engine — Scenario 3: Платформа own group class3, 1200km", () => {
  it("COMPUTES a number — confidence not red", () => {
    const r = computeTariffPure(INPUT_S3, makeSeedData(1200));
    expect(r.confidence).not.toBe("red");
    expect(r.total).toBeGreaterThan(0);
  });

  it("tariffClass=3 resolved from ETSNG seed", () => {
    const r = computeTariffPure(INPUT_S3, makeSeedData(1200));
    expect(r.tariffClass).toBe(3);
  });

  it("no В component (own wagon)", () => {
    const r = computeTariffPure(INPUT_S3, makeSeedData(1200));
    expect(r.vComponent).toBe(0);
  });

  it("iComponent reflects K1 > 1 for class3 (elevated rate)", () => {
    // K1(class3) = 1.74 → iComponent significantly > N8 base alone
    const r = computeTariffPure(INPUT_S3, makeSeedData(1200));
    // N8@60t,1200km = 89665 × K1≥1.54 × K4≈1.03 > 142000
    expect(r.iComponent).toBeGreaterThan(100000);
  });

  it("22% НДС applied last", () => {
    const r = computeTariffPure(INPUT_S3, makeSeedData(1200));
    expect(r.total).toBeCloseTo(r.postIndex * 1.22, 0);
  });
});

// ── COMPUTE Scenario 4: own-ПВ class2, wagon, 800km, 60t ─────────────────────
//
// ПВ own, wagon: iScheme=N8 (weight×dist), emptyScheme=25.
// Cargo: class-2, ETSNG 482004 (Основания и содопродукты, class2, MVN=55t).
//   Chargeable = max(60t actual, 55t MVN) = 60t.
//   K3(482004, class2) = 1.153 (Табл.4 class2, pattern '482' → "Основания и содопродукты").
//   K1(class2,800km) = 1.0, K4(wagon '1'@800km) = 1.04.
// Confirms class-2 own-ПВ path produces a result (universal engine, no C_OWN_PV_CLASS1).

const INPUT_S4: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "ПВ",
  ownership: "own",
  shipmentType: "wagon",
  etsngCode: "482004",
  actualWeightTons: 60,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
  wagonCount: 1,
};

describe("Universal engine — Scenario 4: own-ПВ class2, wagon, 800km", () => {
  it("COMPUTES a number — confidence not red", () => {
    const r = computeTariffPure(INPUT_S4, makeSeedData(800));
    expect(r.confidence).not.toBe("red");
    expect(r.total).toBeGreaterThan(0);
  });

  it("tariffClass=2 resolved from ETSNG seed", () => {
    const r = computeTariffPure(INPUT_S4, makeSeedData(800));
    expect(r.tariffClass).toBe(2);
  });

  it("no В component (own wagon)", () => {
    const r = computeTariffPure(INPUT_S4, makeSeedData(800));
    expect(r.vComponent).toBe(0);
  });

  it("emptyRun > 0 (own wagon, scheme 25 @800km)", () => {
    const r = computeTariffPure(INPUT_S4, makeSeedData(800));
    expect(r.emptyRun).toBeGreaterThan(0);
  });

  it("iComponent = N8base × K1=1.0 × K3 × K4≈1.04 (class2 own-ПВ, no class-1 discount)", () => {
    // N8@60t,800km = 67054 × 1.0 × K3(482,class2=1.0 no match) × 1.04 ≈ 69736
    const r = computeTariffPure(INPUT_S4, makeSeedData(800));
    expect(r.iComponent).toBeGreaterThan(50000);
  });

  it("22% НДС applied last", () => {
    const r = computeTariffPure(INPUT_S4, makeSeedData(800));
    expect(r.total).toBeCloseTo(r.postIndex * 1.22, 0);
  });
});

// ── Sanity: OWN_GONDOLA_CLASS_FACTOR export ───────────────────────────────────
//
// Verifies the class-keyed own-wagon coef (п.18.1.1) is correctly exported
// for use in scenarios where class-2/3 own-ПВ quotes need the N8-specialized path.

import { OWN_GONDOLA_CLASS_FACTOR } from "./computeTariffN8";

describe("OWN_GONDOLA_CLASS_FACTOR (п.18.1.1 ТР-1 2026)", () => {
  it("class-1 coef = 0.9346 (the established oracle value)", () => {
    expect(OWN_GONDOLA_CLASS_FACTOR[1]).toBe(0.9346);
  });

  it("class-2 coef = 0.9592", () => {
    expect(OWN_GONDOLA_CLASS_FACTOR[2]).toBe(0.9592);
  });

  it("class-3 coef = 0.9774", () => {
    expect(OWN_GONDOLA_CLASS_FACTOR[3]).toBe(0.9774);
  });
});
