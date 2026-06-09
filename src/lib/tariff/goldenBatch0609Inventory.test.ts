// ── Golden batch 2026-06-09: ИНВЕНТАРНЫЙ парк (И+В) + ЦИСТЕРНА схема19 (ENGINE FIX 3) ──
//
// Certifies, to the kopeck, against R-Тариф v19.59 oracles in
// scripts/seed-data/reference-quotes-batch-0609.json:
//   • inventory_cases — общий парк ПВ class-1 щебень: provNoVat (без НДС) via computeInventory.
//       INV-1 повагонная (1 ваг) = 110170 ; INV-6_20 групповая (6 ваг) = 105804.
//       Structure = N8(груж., ±K4 raw-base, NO род coef) ×K1×0.77×0.909×1.01
//                   + 25(1)(порожний 60% dist, per-axle ±K4 ×1.06 ×1.01 ×оси)
//                   + В4(dist) ×1.01  − 754.
//   • cistern_cases — приватная цистерна class-3 кислота: provNoVat via computeTariffPure.
//       CIS-C3 повагонная = 391135. Per-tonne схема 19: base ±K4 ×K1(1.74)×commodity(0.81)×1.01
//       × масса; NO мин.весовой нормы, NO ×1.04, NO род coef, NO порожний leg.
//
// These are the two structural rebuilds FIX 3 owns; both reproduce the documented provNoVat
// EXACTLY. Confidence is honest YELLOW (computed per official Прил.N2/Табл.2/4/5 tables).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeInventory } from "./computeInventory";
import { loadInventoryTariffData } from "./inventoryData";
import { computeTariffPure, type TariffData } from "./computeTariff";
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
) as { inventory_cases: InvCase[]; cistern_cases: CisCase[] };

describe("GOLDEN BATCH 0609 — инвентарный парк (И+В) reproduces R-Тариф to the ruble", () => {
  const data = loadInventoryTariffData();
  for (const c of BATCH.inventory_cases) {
    it(`${c.n} (${c.wagons} ваг, ${c.billableMass}т, ${c.km} км): И+В = ${c.result.provNoVat} ₽`, () => {
      const inv = computeInventory("ПВ", c.billableMass, c.km, c.wagons, data);
      expect(inv.confidence).toBe("yellow");
      expect(inv.inventoryNoVat).toBe(c.result.provNoVat);
    });
  }
});

// ── Цистерна fixture: own ЦС, per-tonne схема 19 (N19), class-3 кислота 481232 ──────
const OWN_GONDOLA_COEFS: CoefficientLike[] = [
  { multiplier: 0.9346, appliesTo: "own_gondola", appliesToClass: 1, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
  { multiplier: 0.9592, appliesTo: "own_gondola", appliesToClass: 2, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
  { multiplier: 0.9774, appliesTo: "own_gondola", appliesToClass: 3, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
];
const AS_OF = new Date("2026-06-07");

function makeTariffData(distanceKm: number): TariffData {
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

describe("GOLDEN BATCH 0609 — приватная цистерна (схема 19, ЗА ТОННУ) reproduces to the kopeck", () => {
  for (const c of BATCH.cistern_cases) {
    it(`${c.n} (class-3 кислота, ${c.mass}т, ${c.km} км): provNoVat = ${c.result.provNoVat} ₽`, () => {
      const r = computeTariffPure(cisternInput(c), makeTariffData(c.km));
      expect(r.tariffClass).toBe(3);
      expect(r.emptyRun).toBe(0); // NO порожний leg in per-tonne цистерна provNoVat
      expect(r.iComponent).toBe(c.result.provNoVat);
      expect(r.preIndex).toBe(c.result.provNoVat);
      expect(r.confidence).toBe("yellow");
      // НДС 22% last → withVat to the kopeck.
      expect(r.total).toBeCloseTo(c.result.withVat, 2);
    });
  }
});
