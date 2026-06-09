// ── Golden batch 2026-06-09: FULL provNoVat reproduction (ENGINE FIX 4 — GOLDEN TEST) ──
//
// Loads scripts/seed-data/reference-quotes-batch-0609.json and asserts EVERY case
// (inventory_cases, own_pv_class23_cases, platform_cases, cistern_cases) reproduces
// result.provNoVat — the R-Тариф v19.59 «провозная плата без НДС» — TO THE KOPECK,
// through the SAME production entrypoints the app uses:
//   • inventory_cases → computeInventory(...).inventoryNoVat   (И+В общий парк)
//   • cistern_cases   → computeTariffPure(...).postIndex       (схема 19 per-tonne)
//   • own_pv / platform class-2/3 → computeTariffPure(...).postIndex (universal stack)
//
// «provNoVat through the entrypoint» = postIndex (после индексации, до НДС). With the
// fixture's empty indexations table postIndex === preIndex, i.e. the провозная плата без НДС.
//
// STATUS (2026-06-09):
//   GREEN (exact, asserted):  INV-1, INV-6_20 (inventory), CIS-C3 (cistern), AND all 6
//     own_pv_class23_cases + all 4 platform_cases — via the dedicated loadedNoVat field.
//
//   ENGINE FIX 2 (2026-06-09, resolved): computeTariffPure now exposes `loadedNoVat` —
//     провозная плата без НДС и БЕЗ порожнего пробега ((И+В)×iStack, after-index). The
//     порожний пробег is a SEPARATELY-billed charge, NOT part of провозной платы, so the
//     R-Тариф provNoVat for own-ПВ/платформа is the loaded chain only (this is the SAME
//     value every certified oracle asserts via preIndex − emptyRun, e.g. 82816). preIndex/
//     postIndex still carry the порожний leg (loaded + порожний) — the universal-path tests
//     in computeTariffUniversal.test.ts depend on that and stay green; loadedNoVat is the
//     clean провозная-плата accessor. The own_pv/platform cases now assert loadedNoVat to
//     the kopeck (no more it.skip). The loaded-leg describe block below is kept as a second,
//     independent witness (preIndex − emptyRun×emptyStack == loadedNoVat == provNoVat).
//
// Existing certified oracles (1067770 / 187344 / 82816 / 101035.52) are NOT touched here.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeTariffPure, type TariffData } from "./computeTariff";
import { computeInventory } from "./computeInventory";
import { loadInventoryTariffData } from "./inventoryData";
import type { CoefficientLike } from "./coefficients";
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

// own-полувагон род coefficients (п.18.1.1 ТР-1 2026) — DB-seeded in prod, injected here.
const OWN_GONDOLA_COEFS: CoefficientLike[] = [
  { multiplier: 0.9346, appliesTo: "own_gondola", appliesToClass: 1, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
  { multiplier: 0.9592, appliesTo: "own_gondola", appliesToClass: 2, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
  { multiplier: 0.9774, appliesTo: "own_gondola", appliesToClass: 3, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
];
const AS_OF = new Date("2026-06-07");

function makeData(distanceKm: number): TariffData {
  return {
    distance: { distanceKm, found: true },
    etsng: loadEtsngFromSeed() as TariffData["etsng"],
    schemeMap: loadSchemeMapFromSeed() as TariffData["schemeMap"],
    rateBelts: loadRateBeltsFromSeed() as TariffData["rateBelts"],
    classBelts: loadClassBeltsFromSeed() as TariffData["classBelts"],
    corrBelts: [],
    emptyRunBelts: loadEmptyRunBeltsFromSeed() as TariffData["emptyRunBelts"],
    k4Rows: [],
    k3Rows: loadK3RowsFromSeed() as TariffData["k3Rows"],
    k4FullRows: loadK4FullRowsFromSeed() as TariffData["k4FullRows"],
    innovativeModels: loadInnovativeModelsFromSeed() as TariffData["innovativeModels"],
    coefficients: OWN_GONDOLA_COEFS,
    indexations: [],
  };
}

interface WagonCase {
  n: string;
  km: number;
  wagonType: string;
  cargo: string;
  mass: number;
  result: { provNoVat: number; withVat?: number };
}
interface InvCase {
  n: string;
  km: number;
  wagons: number;
  billableMass: number;
  result: { provNoVat: number };
}
interface CisCase {
  n: string;
  km: number;
  mass: number;
  result: { provNoVat: number; withVat: number };
}
const BATCH = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/seed-data/reference-quotes-batch-0609.json"), "utf8"),
) as {
  inventory_cases: InvCase[];
  own_pv_class23_cases: WagonCase[];
  platform_cases: WagonCase[];
  cistern_cases: CisCase[];
};

function inputFor(c: WagonCase): TariffInput {
  const wagonType = c.wagonType === "платформа" ? "ПЛ" : "ПВ";
  return {
    originEsr: "780800",
    destEsr: "289707",
    wagonType,
    ownership: "own",
    shipmentType: "wagon",
    etsngCode: c.cargo.split(" ")[0],
    actualWeightTons: c.mass,
    axles: 4,
    asOfDate: AS_OF,
    traffic: "domestic",
    wagonCount: 1,
  };
}

function cisternInput(c: CisCase): TariffInput {
  return {
    originEsr: "780800",
    destEsr: "289707",
    wagonType: "ЦС",
    ownership: "own",
    shipmentType: "wagon",
    etsngCode: "481232",
    actualWeightTons: c.mass,
    axles: 4,
    asOfDate: AS_OF,
    traffic: "domestic",
    wagonCount: 1,
  };
}

// ── GREEN: inventory_cases — full provNoVat via computeInventory().inventoryNoVat ──────
describe("GOLDEN BATCH 0609 — inventory_cases provNoVat reproduces R-Тариф to the kopeck", () => {
  const data = loadInventoryTariffData();
  for (const c of BATCH.inventory_cases) {
    it(`${c.n} (${c.wagons} ваг, ${c.billableMass}т, ${c.km} км): provNoVat = ${c.result.provNoVat} ₽`, () => {
      const inv = computeInventory("ПВ", c.billableMass, c.km, c.wagons, data);
      expect(inv.confidence).toBe("yellow");
      expect(inv.inventoryNoVat).toBe(c.result.provNoVat);
    });
  }
});

// ── GREEN: cistern_cases — full provNoVat via computeTariffPure().postIndex (no empty leg) ──
describe("GOLDEN BATCH 0609 — cistern_cases provNoVat reproduces R-Тариф to the kopeck", () => {
  for (const c of BATCH.cistern_cases) {
    it(`${c.n} (class-3 кислота, ${c.mass}т, ${c.km} км): provNoVat = ${c.result.provNoVat} ₽`, () => {
      const r = computeTariffPure(cisternInput(c), makeData(c.km));
      expect(r.tariffClass).toBe(3);
      expect(r.emptyRun).toBe(0); // per-tonne цистерна carries NO порожний leg
      expect(r.postIndex).toBe(c.result.provNoVat); // postIndex === provNoVat (empty indexations)
      expect(r.preIndex).toBe(c.result.provNoVat);
      expect(r.confidence).toBe("yellow");
      expect(r.total).toBeCloseTo(c.result.withVat, 2); // НДС 22% last → withVat to the kopeck
    });
  }
});

// ── GREEN: own_pv_class23_cases — full provNoVat via computeTariffPure().loadedNoVat ────
// loadedNoVat = провозная плата без НДС и БЕЗ порожнего ((И+В)×iStack, после индексации). The
// порожний пробег is a separately-billed charge, not part of провозной платы — so this is the
// R-Тариф provNoVat for own-ПВ class-2/3. emptyRun is still reported (and folded into preIndex).
describe("GOLDEN BATCH 0609 — own-ПВ class-2/3 provNoVat reproduces R-Тариф to the kopeck", () => {
  for (const c of BATCH.own_pv_class23_cases) {
    it(`${c.n} (${c.cargo}, ${c.mass}т): provNoVat = ${c.result.provNoVat} ₽`, () => {
      const r = computeTariffPure(inputFor(c), makeData(c.km));
      expect(r.loadedNoVat).toBe(c.result.provNoVat);
      expect(r.confidence).toBe("yellow");
      // Witness the SAME value via preIndex − порожний (the certified-oracle accessor).
      expect(Math.round(r.preIndex - r.emptyRun)).toBe(c.result.provNoVat);
    });
  }
});

// ── GREEN: platform_cases — full provNoVat via computeTariffPure().loadedNoVat ──────────
describe("GOLDEN BATCH 0609 — собственная платформа class-2/3 provNoVat reproduces R-Тариф to the kopeck", () => {
  for (const c of BATCH.platform_cases) {
    it(`${c.n} (${c.cargo}, ${c.mass}т): provNoVat = ${c.result.provNoVat} ₽`, () => {
      const r = computeTariffPure(inputFor(c), makeData(c.km));
      expect(r.loadedNoVat).toBe(c.result.provNoVat);
      expect(r.confidence).toBe("yellow");
      expect(Math.round(r.preIndex - r.emptyRun)).toBe(c.result.provNoVat);
    });
  }
});

// ── Certified intermediate: LOADED leg (postIndex − emptyRun×emptyStack) for the skipped cases.
// This proves the engine reproduces the documented loaded chain to the ruble today — the only
// gap to a full-provNoVat green is the порожний leg removal (FIX-2). Not deleted; asserts truth.
describe("GOLDEN BATCH 0609 — own-ПВ / платформа LOADED leg reproduces R-Тариф to the ruble", () => {
  const EMPTY_STACK = 1.0; // no порожний coef injected in this fixture → emptyStack = 1.0
  const loadedLeg = (r: ReturnType<typeof computeTariffPure>): number =>
    Math.round(r.postIndex - r.emptyRun * EMPTY_STACK);
  for (const c of [...BATCH.own_pv_class23_cases, ...BATCH.platform_cases]) {
    it(`${c.n} (${c.cargo}, ${c.mass}т): loaded = ${c.result.provNoVat} ₽`, () => {
      const r = computeTariffPure(inputFor(c), makeData(c.km));
      expect(loadedLeg(r)).toBe(c.result.provNoVat);
      expect(r.confidence).toBe("yellow");
    });
  }

  // Structural locks carried over from FIX-1 (billable-mass floor + платформа > полувагон).
  it("billable-mass floor: C3-d actual 14т < МВН 25т → billable 25т → loaded 163573 (heavier than 14т)", () => {
    const cd = BATCH.own_pv_class23_cases.find((x) => x.n === "C3-d")!;
    const r = computeTariffPure(inputFor(cd), makeData(cd.km));
    expect(loadedLeg(r)).toBe(163573);
  });
  it("billable-mass floor: C2-a actual 14т < МВН 58т → billable 58т → loaded 147018 (floor applied)", () => {
    const ca = BATCH.own_pv_class23_cases.find((x) => x.n === "C2-a")!;
    const r = computeTariffPure(inputFor(ca), makeData(ca.km));
    expect(loadedLeg(r)).toBe(147018);
  });
  it("платформа > полувагон: PL-C2-b loaded (160409) > C2-b loaded (153865) — платформа lacks 0.9592 род coef", () => {
    const plc2b = BATCH.platform_cases.find((x) => x.n === "PL-C2-b")!;
    const c2b = BATCH.own_pv_class23_cases.find((x) => x.n === "C2-b")!;
    const rPl = computeTariffPure(inputFor(plc2b), makeData(plc2b.km));
    const rPv = computeTariffPure(inputFor(c2b), makeData(c2b.km));
    expect(loadedLeg(rPl)).toBeGreaterThan(loadedLeg(rPv));
    expect(loadedLeg(rPl)).toBe(160409);
    expect(loadedLeg(rPv)).toBe(153865);
  });
});
