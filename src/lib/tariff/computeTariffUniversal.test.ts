// ── Universal computeTariffPure scenarios (Phase-1 generalisation) ──────────────
//
// These tests exercise the generalised engine using Phase-1 data structures:
//   - K3 commodity coefficient (Таблица 4)
//   - K4 full wagon-count × distance table (Таблица 5)
//   - innovative model coefficient
//   - weight-aware belt snap (N8 2D grid via synthetic or real data)
//   - В component for rzd ownership
//
// Data is injected (no DB, no network). All rate/coefficient values are taken from
// the Phase-1 seed files; exact oracle values are computed algebraically.
//
// Coverage:
//   A) КР rzd повагонная class 2 (И1+В3, K3=1.0 generic) — RESOLVES (green)
//   B) ПВ own маршрут прямой class 1 (N8 2D-grid, K3 щебень+полувагон, K4 full) — RESOLVES (green)
//   C) ПЛ own повагонная class 1 (N8 2D-grid, no specific K3, empty k4FullRows) — RESOLVES (green)
//   D) ЦС own повагонная (scheme "19..23" not seeded) — returns RED confidence, no number
//   E) Innovative wagon model (ПВ own, model 12-9761-02 → coef 0.9595) — iComponent reduced

import { describe, expect, it } from "vitest";

import { computeTariffPure, type TariffData } from "./computeTariff";
import type { TariffInput } from "./schema";

// ── Shared date ────────────────────────────────────────────────────────────────

const AS_OF = new Date("2026-06-07");

// ── Scenario A: КР rzd повагонная class 2, 800 km, 60 t ──────────────────────
//
// crytый вагон общего парка → iScheme=И1 (weight×dist), vScheme=В3 (dist-only), no порожний
// cargo: generic class-2 (ETSNQ 302000, огнеупоры, K3=0.876 per Табл.4 class2)
// K4: legacy повагонная = 1.0 (k4FullRows empty)
// indexFactor: none (no indexations)
//
// Computed:
//   И1@60t,800km = 87619 (from tr1-i-belts-full.json)
//   K1(class2,800) = 1.0 (всегда)
//   K3(302000, class2, КР) = 0.876 (row "302,303" ogneupory) — no wagon-type sub-mult
//   iComponent = 87619 × 1.0 × 0.876 × 1.0 = 76754.244
//   В3@800 = 16063 (tr1-v-belts-full.json)
//   preIndex = (76754.244 + 16063) × 1.0 = 92817.244
//   total = 92817.244 × 1.22 = 113237.04 (round2)

const INPUT_A: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "КР",
  ownership: "rzd",
  shipmentType: "wagon",
  etsngCode: "302000",
  actualWeightTons: 60,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
};

function makeDataA(): TariffData {
  return {
    distance: { distanceKm: 800, found: true },
    etsng: [{ code: "302000", name: "Огнеупоры", tariffClass: 2, mvnByWagon: null }],
    schemeMap: [
      { wagonType: "КР", ownership: "rzd", shipmentType: "wagon", iSchemeCode: "И1", vSchemeCode: "В3" },
    ],
    // И1 is weight×dist 2D: must include the exact row for 60t @ 761-800 km.
    rateBelts: [
      { schemeCode: "И1", weightT: 60, distFromKm: 761, distToKm: 800, rateRub: 87619 },
      // В3 is distance-only (weightT absent/null).
      { schemeCode: "В3", distFromKm: 761, distToKm: 800, rateRub: 16063 },
    ],
    classBelts: [
      { freightClass: 2, distFromKm: 0, distToKm: 999999, k1: 1.0 },
    ],
    // corrBelt present: kTable5=0.8 < k1=1.0 → max-of-two = 1.0 (no warning, no change)
    corrBelts: [
      { distFromKm: 0, distToKm: 999999, kTable5: 0.8 },
    ],
    emptyRunBelts: [],
    k4Rows: [],
    k3Rows: [
      {
        etsngPattern: "302,303",
        freightClass: 2,
        k3: 0.876,
      },
    ],
    k4FullRows: [],
    innovativeModels: [],
    coefficients: [],
    indexations: [],
  };
}

describe("computeTariffPure — Scenario A: КР rzd повагонная class 2", () => {
  it("resolves to a number — YELLOW (class-2 computed per ТР-1, not oracle-validated)", () => {
    const r = computeTariffPure(INPUT_A, makeDataA());
    // CONFIDENCE MODEL: only the oracle-validated own-ПВ class-1 нерудные contour is green.
    // A class-2 КР is computed per the official tables but unvalidated → yellow, never green.
    expect(r.confidence).toBe("yellow");
    expect(r.total).toBeGreaterThan(0);
    expect(r.tariffClass).toBe(2);
  });

  it("charges В and no порожний (rzd ownership)", () => {
    const r = computeTariffPure(INPUT_A, makeDataA());
    expect(r.vComponent).toBe(16063);
    expect(r.emptyRun).toBe(0);
  });

  it("applies K3=0.876 (огнеупоры class 2)", () => {
    const r = computeTariffPure(INPUT_A, makeDataA());
    // iComponent = 87619 × 1.0 (K1) × 0.876 (K3) × 1.0 (K4) × 1.0 (innovative)
    expect(r.iComponent).toBeCloseTo(87619 * 0.876, 1);
  });

  it("applies 22% НДС last", () => {
    const r = computeTariffPure(INPUT_A, makeDataA());
    expect(r.vatRate).toBe(22);
    expect(r.total).toBeCloseTo(r.postIndex * 1.22, 0);
  });
});

// ── Scenario B: ПВ own маршрут прямой class 1, 2500 km, щебень ──────────────
//
// собственный полувагон, маршрутная отправка, длинное плечо.
// iScheme: N8 (weight×dist), emptyScheme: 25 (own wagon)
// cargo: ETSNQ 232431 (щебень, class 1)
// K1(class1, 2500) = 0.68 (пояс 2401-2600)
// K3(232431, class1, ПВ) = 0.77 × 0.909 = 0.69993 (п.1.5: нерудные в полувагоне)
// K4 full: маршрут прямой @ >2000 = 0.95 (no fitted)
// N8@70t,2500 = 160271; порожний25@4ax,2500 = 24281
// порожний ×1.1 coef in coefficients
//
// iComponent = 160271 × 0.68 × 0.69993 × 0.95 ≈ 72467.30
// emptyRun = 24281, emptyStack=1.1
// preIndex = 72467.30 × 1.0 + 24281 × 1.1 = 72467.30 + 26709.1 = 99176.40
// indexFactor = 1.0 (no indexations in fixture)
// total = 99176.40 × 1.22 ≈ 120995.21

const INPUT_B: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "ПВ",
  ownership: "own",
  shipmentType: "route",
  etsngCode: "232431",
  actualWeightTons: 70,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
  wagonCount: 40, // маршрут (route): wagon count > 20 → use route row in K4 full
};

function makeDataB(): TariffData {
  return {
    distance: { distanceKm: 2500, found: true },
    etsng: [{ code: "232431", name: "Щебень гранитный", tariffClass: 1, mvnByWagon: { pv: 69, default: 69 } }],
    schemeMap: [
      { wagonType: "ПВ", ownership: "own", shipmentType: "route", iSchemeCode: "N8", vSchemeCode: null },
    ],
    rateBelts: [
      { schemeCode: "N8", weightT: 70, distFromKm: 2401, distToKm: 2500, rateRub: 160271 },
    ],
    classBelts: [
      { freightClass: 1, distFromKm: 2401, distToKm: 2600, k1: 0.68 },
    ],
    corrBelts: [
      // corrBelt present: kTable5 < k1 → max-of-two = k1 (no change)
      { distFromKm: 2401, distToKm: 2600, kTable5: 0.55 },
    ],
    emptyRunBelts: [
      { axles: 4, distFromKm: 2401, distToKm: 2500, rateRub: 24281 },
    ],
    k4Rows: [],
    k3Rows: [
      {
        etsngPattern: "231-236",
        freightClass: 1,
        k3: 0.77,
        wagonTypeMultiplier: 0.909,
        wagonTypeApplicable: ["ПВ", "ПЛ"],
      },
    ],
    k4FullRows: [
      // "маршрут прямой" @ >2000 km = 0.95 (verbatim Табл.5)
      { shipmentGroup: "маршрут прямой", distFromKm: 2001, distToKm: 999999, k: 0.95 },
      // row "1" needed for max-of-two (only affects wagon-count groups, not route groups)
      { shipmentGroup: "1", distFromKm: 2001, distToKm: 999999, k: 1.01 },
    ],
    innovativeModels: [],
    coefficients: [
      {
        multiplier: 1.1,
        appliesTo: "porozhny" as const,
        appliesToClass: null,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
      },
    ],
    indexations: [],
  };
}

describe("computeTariffPure — Scenario B: ПВ own маршрут прямой class 1, 2500 km", () => {
  it("resolves to a number (not red) — RESOLVES green", () => {
    const r = computeTariffPure(INPUT_B, makeDataB());
    expect(r.confidence).toBe("green");
    expect(r.total).toBeGreaterThan(0);
    expect(r.tariffClass).toBe(1);
  });

  it("no В component (own wagon)", () => {
    const r = computeTariffPure(INPUT_B, makeDataB());
    expect(r.vComponent).toBe(0);
  });

  it("applies K3=0.69993 (щебень in ПВ, п.1.5 sub-mult)", () => {
    const r = computeTariffPure(INPUT_B, makeDataB());
    // iComponent = N8base × K1 × K3 × K4_route × innovative
    // = 160271 × 0.68 × (0.77×0.909) × 0.95 × 1.0
    const expected = 160271 * 0.68 * (0.77 * 0.909) * 0.95;
    expect(r.iComponent).toBeCloseTo(expected, 0);
  });

  it("K4=0.95 (маршрут прямой >2000km, sourced, fitted=false)", () => {
    // If K4 full table works, total reflects the 0.95 route discount.
    const r = computeTariffPure(INPUT_B, makeDataB());
    // Cross-check: without К4=0.95 the iComponent would be larger.
    const iWithK4_1 = 160271 * 0.68 * (0.77 * 0.909) * 1.0;
    expect(r.iComponent).toBeLessThan(iWithK4_1);
  });

  it("applies порожний ×1.1 to empty-run leg only", () => {
    const r = computeTariffPure(INPUT_B, makeDataB());
    expect(r.emptyRun).toBe(24281);
    // preIndex = iComponent×1.0 + 24281×1.1
    expect(r.preIndex).toBeCloseTo(r.iComponent + 24281 * 1.1, 0);
  });

  it("total = preIndex × 1.22 (НДС 22%, no indexation)", () => {
    const r = computeTariffPure(INPUT_B, makeDataB());
    expect(r.total).toBeCloseTo(r.preIndex * 1.22, 0);
  });
});

// ── Scenario C: ПЛ own повагонная class 1, 800 km, generic cargo ─────────────
//
// платформа собственная, generic cargo (no K3 hit), K4 legacy повагонная=1.0
// iScheme: N8 (same as ПВ/ПЛ own), порожний scheme 25 (injected)
// K1(class1,800) = 0.75
// K3: no match → 1.0
//
// iComponent = 69375 × 0.75 × 1.0 × 1.0 = 52031.25
// emptyRun = 8750; emptyStack = 1.1
// preIndex = 52031.25 + 8750×1.1 = 52031.25 + 9625 = 61656.25
// total = 61656.25 × 1.22 = 75220.625 → round2 = 75220.63

const INPUT_C: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "ПЛ",
  ownership: "own",
  shipmentType: "wagon",
  etsngCode: "999000", // generic, no K3 entry
  actualWeightTons: 70,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
};

function makeDataC(): TariffData {
  return {
    distance: { distanceKm: 800, found: true },
    etsng: [{ code: "999000", name: "Generic cargo", tariffClass: 1, mvnByWagon: null }],
    schemeMap: [
      { wagonType: "ПЛ", ownership: "own", shipmentType: "wagon", iSchemeCode: "N8", vSchemeCode: null },
    ],
    rateBelts: [
      { schemeCode: "N8", weightT: 70, distFromKm: 761, distToKm: 800, rateRub: 69375 },
    ],
    classBelts: [
      { freightClass: 1, distFromKm: 1, distToKm: 1200, k1: 0.75 },
    ],
    corrBelts: [
      // corrBelt present: kTable5=0.5 < k1=0.75 → max-of-two = 0.75 (no warning)
      { distFromKm: 1, distToKm: 1200, kTable5: 0.5 },
    ],
    emptyRunBelts: [
      { axles: 4, distFromKm: 761, distToKm: 800, rateRub: 8750 },
    ],
    k4Rows: [], // legacy empty → resolveK4 falls back to 1.0 for "wagon"
    k3Rows: [], // empty → K3=1.0, no warning
    k4FullRows: [], // empty → falls back to legacy resolveK4
    innovativeModels: [],
    coefficients: [
      {
        multiplier: 1.1,
        appliesTo: "porozhny" as const,
        appliesToClass: null,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
      },
    ],
    indexations: [],
  };
}

describe("computeTariffPure — Scenario C: ПЛ own повагонная class 1, 800 km", () => {
  it("resolves to a number — YELLOW (ПЛ + generic cargo, outside the validated нерудный contour)", () => {
    const r = computeTariffPure(INPUT_C, makeDataC());
    // CONFIDENCE MODEL: validated green is own-ПОЛУВАГОН class-1 НЕРУДНЫЕ only. This is a
    // платформа (not полувагон) carrying generic cargo 999000 (not нерудный) → yellow.
    expect(r.confidence).toBe("yellow");
    expect(r.total).toBeGreaterThan(0);
    expect(r.tariffClass).toBe(1);
  });

  it("no В component (own wagon)", () => {
    const r = computeTariffPure(INPUT_C, makeDataC());
    expect(r.vComponent).toBe(0);
  });

  it("K3=1.0 (generic cargo, no table match)", () => {
    const r = computeTariffPure(INPUT_C, makeDataC());
    // iComponent = 69375 × K1=0.75 × K3=1.0 × K4=1.0 = 52031.25
    expect(r.iComponent).toBeCloseTo(52031.25, 1);
  });

  it("total = (iComponent + emptyRun×1.1) × 1.22", () => {
    const r = computeTariffPure(INPUT_C, makeDataC());
    const expectedPre = 52031.25 + 8750 * 1.1; // 61656.25
    expect(r.preIndex).toBeCloseTo(expectedPre, 1);
    expect(r.total).toBeCloseTo(expectedPre * 1.22, 0);
  });
});

// ── Scenario D: ЦС own — scheme not seeded → RED ─────────────────────────────
//
// Цистерна собственная: iScheme "19..23" not in any rate belt → snapToBelt returns
// found:false → confidence='red', total=0. Verifies honest degradation flag.

const INPUT_D: TariffInput = {
  originEsr: "000001",
  destEsr: "000002",
  wagonType: "ЦС",
  ownership: "own",
  shipmentType: "wagon",
  etsngCode: "211000",
  actualWeightTons: 50,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
};

function makeDataD(): TariffData {
  return {
    distance: { distanceKm: 1500, found: true },
    etsng: [{ code: "211000", name: "Бензин", tariffClass: 2, mvnByWagon: null }],
    schemeMap: [
      // Scheme "21" is a placeholder for цистерна — not in rate belts
      { wagonType: "ЦС", ownership: "own", shipmentType: "wagon", iSchemeCode: "N21", vSchemeCode: null },
    ],
    rateBelts: [
      // N21 is NOT seeded — no belt entries for this scheme.
    ],
    classBelts: [{ freightClass: 2, distFromKm: 0, distToKm: 999999, k1: 1.0 }],
    corrBelts: [],
    emptyRunBelts: [{ axles: 4, distFromKm: 1401, distToKm: 1600, rateRub: 15000 }],
    k4Rows: [],
    k3Rows: [],
    k4FullRows: [],
    innovativeModels: [],
    coefficients: [],
    indexations: [],
  };
}

describe("computeTariffPure — Scenario D: ЦС own (rate belt not seeded)", () => {
  it("returns RED confidence with total=0 (honest degradation, never fabricates)", () => {
    const r = computeTariffPure(INPUT_D, makeDataD());
    expect(r.confidence).toBe("red");
    expect(r.total).toBe(0);
  });

  it("emits a warning about the missing rate belt", () => {
    const r = computeTariffPure(INPUT_D, makeDataD());
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.some((w) => w.includes("N21") || w.includes("пояс"))).toBe(true);
  });
});

// ── Scenario E: Innovative wagon model → iComponent reduced by 0.9595 ─────────
//
// ПВ own, model "12-9761-02" (инновационный, coef=0.9595 per tr1-innovative-models).
// Baseline: same route as C but with innovative model applied.
// iComponent_innovative = iComponent_classic × 0.9595

const INPUT_E: TariffInput = {
  ...INPUT_C,
  wagonModel: "12-9761-02",
};

function makeDataE(): TariffData {
  return {
    ...makeDataC(),
    schemeMap: [
      { wagonType: "ПЛ", ownership: "own", shipmentType: "wagon", iSchemeCode: "N8", vSchemeCode: null },
    ],
    innovativeModels: [
      { model: "12-9761-02", coef: 0.9595, scheme: "8" },
    ],
  };
}

describe("computeTariffPure — Scenario E: innovative wagon model (0.9595)", () => {
  it("innovative iComponent < classic iComponent (coef applied)", () => {
    const classic = computeTariffPure(INPUT_C, makeDataC());
    const innovative = computeTariffPure(INPUT_E, makeDataE());
    expect(innovative.iComponent).toBeLessThan(classic.iComponent);
    expect(innovative.iComponent).toBeCloseTo(classic.iComponent * 0.9595, 0);
  });

  it("innovative result still resolves (not red) — YELLOW (ПЛ generic, unvalidated)", () => {
    const r = computeTariffPure(INPUT_E, makeDataE());
    // Same contour as Scenario C (платформа + generic cargo) → yellow, never red.
    expect(r.confidence).toBe("yellow");
    expect(r.total).toBeGreaterThan(0);
  });
});

// ── Scenario F: baked indexations do NOT re-apply on a 2026 calc ─────────────
//
// The +13.8% (2024-12-01..2025-11-30) and +10% (2025-12-01..2025-12-31) indexations are
// ALREADY embedded in the ТР-1 2026 Прил.N2 base rate tables
// (DATA_ACQUISITION_REPORT.md §2 lines 38,40). A closed effectiveTo window before the
// 2026 as-of date makes isIndexApplicable skip them → indexFactor stays 1.0. This is the
// fix for the ~25% double-count (TARIFF_MASTER_AUDIT.md §3 item 1, gaps C1/H19). A
// genuinely-live 2026+ indexation (open-ended effectiveTo) MUST still compound.

describe("computeTariffPure — Scenario F: baked indexations don't double-count", () => {
  it("indexFactor = 1.0 when both baked indexations have closed before the 2026 calc date", () => {
    const data: TariffData = {
      ...makeDataC(),
      indexations: [
        { pct: 13.8, effectiveFrom: new Date("2024-12-01"), effectiveTo: new Date("2025-11-30"), appliesToClass: null },
        { pct: 10.0, effectiveFrom: new Date("2025-12-01"), effectiveTo: new Date("2025-12-31"), appliesToClass: null },
      ],
    };
    const r = computeTariffPure(INPUT_C, data);
    expect(r.indexFactor).toBeCloseTo(1.0, 6);
    expect(r.postIndex).toBeCloseTo(r.preIndex, 2);
  });

  it("a still-live (open-ended) 2026 indexation DOES compound", () => {
    const data: TariffData = {
      ...makeDataC(),
      indexations: [
        // baked → skipped
        { pct: 10.0, effectiveFrom: new Date("2025-12-01"), effectiveTo: new Date("2025-12-31"), appliesToClass: null },
        // live 2026 surcharge → applies
        { pct: 7.0, effectiveFrom: new Date("2026-01-01"), effectiveTo: null, appliesToClass: null },
      ],
    };
    const r = computeTariffPure(INPUT_C, data);
    expect(r.indexFactor).toBeCloseTo(1.07, 6);
  });

  it("порожний ×1.1 still applies to the empty leg independent of indexation", () => {
    // The empty-run ×1.1 is a coefficient (emptyStack), NOT an indexation — it must remain
    // even when indexFactor collapses to 1.0 for the baked rows.
    const data: TariffData = {
      ...makeDataC(),
      indexations: [
        { pct: 13.8, effectiveFrom: new Date("2024-12-01"), effectiveTo: new Date("2025-11-30"), appliesToClass: null },
      ],
    };
    const r = computeTariffPure(INPUT_C, data);
    expect(r.indexFactor).toBeCloseTo(1.0, 6);
    // preIndex = iComponent + emptyRun×1.1 (порожний coef untouched)
    expect(r.preIndex).toBeCloseTo(r.iComponent + r.emptyRun * 1.1, 1);
  });
});
