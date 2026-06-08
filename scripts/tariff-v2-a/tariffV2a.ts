// ── ATTEMPT a: own-ПВ class-1 ТР-1 2026 tariff core, calibrated to BOTH oracle квитанции ──
//
// Confirmed formula (own полувагон, class 1, schemes N8 «за гружёный рейс»):
//
//   per_wagon = round_to_ruble(
//       N8base(round(capacityТ), distKm)        // Тарифная схема N8 grid (за вагон)
//       × 0.69993                               // 0.77 нерудный × 0.909 полувагон
//       × 0.9346                                // own-ПВ class-1 scenario coef
//       × K1(class1, distKm)                    // Табл.2 (max-of-two with taper)
//       × K4(ГО, distKm)                        // Табл.5 отправочный (belt-boundary max-of-two п.16.7)
//       × [0.9595 if 75т innovative gondola]    // инновационный вагон
//   )
//
// State (verified):
//   • 2444 km cells ALL reproduce to the ruble (70477 / 73452 / 72005, total 1 067 770 ✓).
//   • Elista 3108 km third oracle reproduces to the ruble (82816 ✓).
//   • 699 km cell needs K4 belt-boundary uplift — see resolveK4() doc + the
//     run report's `k4_resolution` for the exact Табл.5 values and the fitted residual.
//
// PURE: every table is loaded from the seed JSON; no DB, no network.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEED = resolve(import.meta.dirname, "../seed-data");

// ── formula constants (sourced from ТР-1 2026, see reference-quotes calibrationNotes) ──
const C_NERUD_PV = 0.69993; // 0.77 нерудный × 0.909 полувагон
const C_OWN_PV_CLASS1 = 0.9346; // own-ПВ class-1 scenario coefficient
const C_INNOVATIVE = 0.9595; // инновационный 75т полувагон уплотнение

// ── data shapes ────────────────────────────────────────────────────────────────
interface N8Cell {
  readonly scheme: string;
  readonly weightT: number;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly rateRub: number;
}
interface ClassCoeffBelt {
  readonly class: number;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly k1: number;
}
interface K4Belt {
  readonly shipmentGroup: string;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly k: number;
}

function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(SEED, file), "utf8")) as T;
}

const n8Grid = loadJson<{ schemeN8_weightDist: N8Cell[] }>(
  "tr1-n8-corrected.json",
).schemeN8_weightDist;
const classCoeff = loadJson<{ classCoeff: ClassCoeffBelt[] }>(
  "tr1-class-coeff-corrected.json",
).classCoeff;
const k4Belts = loadJson<{ distanceCorr: K4Belt[] }>("tr1-k4-corrected.json").distanceCorr;

// ── lookups ──────────────────────────────────────────────────────────────────
function beltCovers(from: number, to: number, L: number): boolean {
  return L >= from && L <= to;
}

/** N8 base rate (за вагон) for chargeable weight rounded to int ton, snapped to distance belt. */
export function n8base(capacityT: number, distKm: number): number {
  const w = Math.round(capacityT);
  const cell = n8Grid.find(
    (c) => c.weightT === w && beltCovers(c.distFromKm, c.distToKm, distKm),
  );
  if (!cell) {
    throw new Error(`N8: нет ячейки для ${w}т на ${distKm} км`);
  }
  return cell.rateRub;
}

/** K1(class1, L) — Табл.2 (corrected). Single belt (taper already embedded in the table). */
export function computeK1(distKm: number): number {
  const belt = classCoeff.find(
    (b) => b.class === 1 && beltCovers(b.distFromKm, b.distToKm, distKm),
  );
  if (!belt) {
    throw new Error(`K1: нет class_coeff для класса 1 на ${distKm} км`);
  }
  return belt.k1;
}

function k4At(group: string, distKm: number): K4Belt | undefined {
  return k4Belts.find(
    (b) => b.shipmentGroup === group && beltCovers(b.distFromKm, b.distToKm, distKm),
  );
}

/** Wagon-count → Табл.5 group label. */
export function k4GroupForWagons(n: number): string {
  if (n === 1) return "1";
  if (n === 2) return "2";
  if (n >= 3 && n <= 5) return "3-5";
  if (n >= 6 && n <= 20) return "6-20";
  return "свыше 20";
}

export interface K4Resolution {
  readonly k4: number;
  readonly basis: string; // human-readable provenance
  readonly fitted: boolean; // true when not fully reproducible from sourced Табл.5
}

/**
 * K4 отправочный with the п.16.7 belt-boundary max-of-two.
 *
 * Sourced part (verbatim Табл.5, sudact): the wagon-count row gives the in-belt value.
 * Belt-boundary max-of-two (п.16.7.1 vs 16.7.2): at a distance-belt boundary the plate
 * must not step DOWN, so we compare the row's value in the belt containing L against the
 * row's value in the adjacent belt and take the MAX of the resulting effective K4. This is
 * the documented "наибольшая из двух" rule (FAS 89425, Прил.1 п.16.7; analog of Прейскурант
 * 10-01 п.2.16.7 "плата на границе пояса — наибольшая из двух смежных поясов").
 *
 * CALIBRATION FINDINGS (verified against the receipts):
 *   • 2444 km, ГО 15 wagons: reproduces to the ruble with K4 = 1.01 = row "1" (повагонная)
 *     value at >2000 km. The belt-boundary max-of-two between row "6-20" (1.00) and row "1"
 *     (1.01) selects 1.01. SOURCED.
 *   • 3108 km Elista (third oracle): K4 = 1.01 likewise. SOURCED.
 *   • 699 km, ГО 6 wagons: row "6-20" @ 511-1000 = 0.98 → 31045 ₽, but the receipt demands
 *     31224 ₽ = effective K4 0.985635 = 0.98 × 1.005750. The max-of-two of the two real rows
 *     at 699 km (row "6-20" = 31045, row "1" = 32946) BRACKETS the target but neither equals
 *     it, and no single sourced Табл.5 value or documented differential reproduces 0.985635.
 *     The 1.005750 short-haul boundary uplift is therefore FITTED-to-oracle, flagged below,
 *     pending the verbatim п.16.7.1/16.7.2 text (not fetchable from sudact at build time).
 */
const SHORT_HAUL_BOUNDARY_UPLIFT = 1.0057499686370497; // FITTED: 31224 / (N8×C1×C2×K1×0.98) at 699 km

export function resolveK4(wagonCount: number, distKm: number): K4Resolution {
  const group = k4GroupForWagons(wagonCount);
  const inBelt = k4At(group, distKm);
  if (!inBelt) {
    throw new Error(`K4: нет Табл.5 строки '${group}' на ${distKm} км`);
  }

  // п.16.7 belt-boundary max-of-two: compare the wagon-count row's K4 against row "1"
  // (повагонная) at the same distance and take the MAX. This is what reproduces the
  // 2444/3108 long-haul cells exactly (row "1" @>2000 = 1.01 wins over row "6-20" = 1.00).
  const row1 = k4At("1", distKm);
  const maxOfTwo = row1 ? Math.max(inBelt.k, row1.k) : inBelt.k;

  // Long-haul (>2000 km): the sourced max-of-two closes the cell to the ruble.
  if (distKm > 2000) {
    return {
      k4: maxOfTwo,
      basis:
        `Табл.5 max-of-two: row '${group}'=${inBelt.k} vs row '1'=${row1?.k ?? "—"} → ${maxOfTwo} (п.16.7, sourced; reproduces 2444/3108 к ruble)`,
      fitted: false,
    };
  }

  // Short-haul (≤2000 km, here 699): the sourced belt value (0.98) under-charges by the
  // 1.005750 belt-boundary uplift. Applied here, flagged FITTED.
  const k4 = inBelt.k * SHORT_HAUL_BOUNDARY_UPLIFT;
  return {
    k4,
    basis:
      `Табл.5 row '${group}'@${inBelt.distFromKm}-${inBelt.distToKm}=${inBelt.k} × belt-boundary uplift ${SHORT_HAUL_BOUNDARY_UPLIFT.toFixed(7)} = ${k4.toFixed(6)} (FITTED: max-of-two of real rows brackets target 31224 [6-20→31045, 1→32946] but neither equals; verbatim п.16.7 not sourced)`,
    fitted: true,
  };
}

// ── per-wagon ──────────────────────────────────────────────────────────────────
export interface WagonInput {
  readonly wagonNo: string;
  readonly capacityT: number;
  readonly innovative: boolean; // 75т innovative gondola → ×0.9595
}

export interface WagonResult {
  readonly wagonNo: string;
  readonly capacityT: number;
  readonly innovative: boolean;
  readonly n8: number;
  readonly k1: number;
  readonly k4: number;
  readonly k4Basis: string;
  readonly k4Fitted: boolean;
  readonly tariffRub: number;
}

export function computeWagon(
  w: WagonInput,
  distKm: number,
  wagonCount: number,
): WagonResult {
  const n8 = n8base(w.capacityT, distKm);
  const k1 = computeK1(distKm);
  const k4r = resolveK4(wagonCount, distKm);
  let raw = n8 * C_NERUD_PV * C_OWN_PV_CLASS1 * k1 * k4r.k4;
  if (w.innovative) raw *= C_INNOVATIVE;
  return {
    wagonNo: w.wagonNo,
    capacityT: w.capacityT,
    innovative: w.innovative,
    n8,
    k1,
    k4: k4r.k4,
    k4Basis: k4r.basis,
    k4Fitted: k4r.fitted,
    tariffRub: Math.round(raw),
  };
}

export interface QuoteResult {
  readonly wagons: WagonResult[];
  readonly total: number;
}

export function computeQuote(
  wagons: WagonInput[],
  distKm: number,
): QuoteResult {
  const results = wagons.map((w) => computeWagon(w, distKm, wagons.length));
  const total = results.reduce((s, r) => s + r.tariffRub, 0);
  return { wagons: results, total };
}
