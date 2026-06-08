// ── Golden tests against 11 R-Тариф (официальный РЖД калькулятор) reference расчётов ──
//
// Operator-supplied 08.06.2026, full coefficient breakdown. These decoded the EXACT K4
// mechanism (п.16.7 base-delta max-of-two) + the separate ×1,01 доп.индексация, killing the
// old fitted SHORT_HAUL_BOUNDARY_UPLIFT. Source: scripts/seed-data/reference-quotes-rtariff.json.
//
// All own-полувагон, class-1 щебень (ЕТСНГ 232431). Each case asserts the per-wagon провозная
// плата без НДС to the ruble — validating our N8 grid AND the mechanism against the official calc.

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

const SEED = resolve(process.cwd(), "scripts/seed-data");
function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}
function loadN8Data(): N8TariffData {
  const n8 = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const cls = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-class-coeff-corrected.json");
  const k4 = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");
  return { n8Grid: n8.schemeN8_weightDist, classCoeff: cls.classCoeff, k4Belts: k4.distanceCorr };
}

interface RefCase {
  n: number;
  km: number;
  wagons: number;
  gp: number;
  innovative: boolean;
  provNoVat: number;
}

const data = loadN8Data();
const ref = loadJson<{ cases: RefCase[] }>("reference-quotes-rtariff.json");

describe("R-Тариф golden — exact K4 (п.16.7) + ×1,01, own-ПВ class-1 щебень", () => {
  for (const c of ref.cases) {
    it(`#${c.n} ${c.km}км ${c.wagons === 1 ? "повагонная" : "групповая"} ${c.gp}т ${c.innovative ? "иннов" : "класс"} = ${c.provNoVat} ₽`, () => {
      const wagons: N8WagonInput[] = Array.from({ length: c.wagons }, (_, i) => ({
        wagonNo: String(i + 1),
        capacityT: c.gp,
        innovative: c.innovative,
      }));
      const result = computeQuoteN8(wagons, data, c.km);
      expect(result.wagons[0].tariffRub).toBe(c.provNoVat);
      // K4 is now sourced for every case — the fitted lever is gone.
      expect(result.wagons[0].k4Fitted).toBe(false);
    });
  }
});
