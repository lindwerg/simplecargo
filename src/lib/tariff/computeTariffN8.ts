// ── ТР-1 2026: own-ПВ class-1 N8-grid tariff core ────────────────────────────
//
// Confirmed formula (own полувагон, ЕТСНГ class 1, групповая/повагонная):
//
//   per_wagon = round_to_ruble(
//       N8base(round(capacityT), distKm)      // Тарифная схема N8 grid (за вагон)
//       × 0.69993                             // 0.77 нерудный × 0.909 полувагон
//       × 0.9346                              // own-ПВ class-1 scenario coef
//       × K1(class1, distKm)                  // Табл.2 max-of-two
//       × K4(wagonCount, distKm)              // Табл.5 отправочный (belt-boundary max-of-two п.16.7)
//       × [0.9595 if 75т innovative gondola]  // инновационный вагон
//   )
//
// Calibration state (verified against ТР-1 2026 квитанции):
//   ЭФ164189: Возрождение→Гремячая 2444 km, 15 wagons → total 1 067 770 ₽ EXACT
//   ЭТ201459: Исеть→Наб.Челны 699 km, 6 wagons → total 187 344 ₽ EXACT (K4 fitted, see below)
//
// PURE: every table is injected as an argument; no DB, no network, no fs calls.

// ── Formula constants (sourced from ТР-1 2026) ────────────────────────────────

/** 0.77 нерудный × 0.909 полувагон = combined load-type + wagon-type coefficient. */
export const C_NERUD_PV = 0.69993;

/** own-ПВ class-1 scenario coefficient (sourced from ТР-1 2026 п.18.1.1, class 1). */
export const C_OWN_PV_CLASS1 = 0.9346;

/**
 * own-wagon gondola class-keyed scenario coefficients (п.18.1.1 ТР-1 2026).
 * Used to un-hardcode C_OWN_PV_CLASS1 for class-2 and class-3 computations.
 */
export const OWN_GONDOLA_CLASS_FACTOR: Readonly<Record<1 | 2 | 3, number>> = {
  1: 0.9346,
  2: 0.9592,
  3: 0.9774,
};

/** Инновационный 75т полувагон model-specific coefficient (×0.9595). */
export const C_INNOVATIVE = 0.9595;

/**
 * Коэффициент дополнительной индексации (×1,01). Applied to EVERY loaded ТР-1 calc — every
 * one of the 11 R-Тариф reference расчётов shows «1,01 Коэффициент дополнительной индексации»
 * as the final factor. Earlier this was wrongly folded into «K4 = 1.01» at >2000 km, which is
 * what made the long-haul K4 look fitted/inferred. It is a real, separate coefficient.
 */
export const C_DOP_INDEX = 1.01;

/**
 * SOURCED-OFFICIAL innovative полувагон model registry → scheme N8 ×0.9595.
 *
 * ТР-1 2026 has NO generic "innovative" flag — the 0,9595 льгота attaches to specific
 * 25-тс-axle полувагон MODELS only (Табл.6 п.3, Приказ ФАС 894/25, байт-сверено через
 * consultant.ru LAW_522347). The 9 полувагон models below carry ×0,9595 on scheme N8.
 * Registry source on disk: scripts/seed-data/tr1-innovative-models.derived.json
 * (10 entries: these 9 ПВ for scheme N8 + 1 hopper 19-9835-01 for scheme N9 — the hopper
 *  is NOT in this N8 set because it multiplies N9, not N8).
 *
 * This kills the DATA half of fitted lever #3: when a wagon MODEL is supplied, innovative
 * is DERIVED from this registry instead of trusted from the caller boolean. See
 * computeWagonN8 below for the backward-compatible lookup precedence.
 */
export const INNOVATIVE_N8_MODELS: ReadonlySet<string> = new Set([
  "12-9761-02",
  "12-9833-01",
  "12-9853",
  "12-9869",
  "12-196-01",
  "12-196-02",
  "12-2143",
  "12-2159",
  "12-6744",
]);

/** Normalize a wagon-model string for registry lookup (trim + collapse internal spaces). */
function normalizeModel(model: string): string {
  return model.trim().replace(/\s+/g, "");
}

/**
 * Resolve whether a wagon should get the ×0.9595 scheme-N8 льгота.
 *
 * BACKWARD-COMPATIBLE precedence (so the golden квитанции — which tag innovative by the
 * explicit boolean, NOT by model — do NOT move):
 *   1. If a wagon MODEL is supplied → derive innovative from the SOURCED registry
 *      (the model lookup is authoritative; this closes the data-half of lever #3).
 *   2. If NO model is supplied → fall back to the caller-provided boolean (legacy/fitted).
 */
export function isInnovativeN8(
  innovativeFlag: boolean,
  wagonModel?: string | null,
): boolean {
  if (wagonModel != null && wagonModel.trim() !== "") {
    return INNOVATIVE_N8_MODELS.has(normalizeModel(wagonModel));
  }
  return innovativeFlag;
}

/**
 * Belt-boundary uplift for K4 at ≤2000 km.
 * At 699 km the sourced Табл.5 row '6-20' = 0.98 under-charges by this factor.
 *
 * The belt-boundary RULE is now sourced-official — п.16.7.1/16.7.2/16.7.3 + п.17.2 floor
 * (verbatim in docs/planning/TARIFF_RULES_EXACT.md lines 64-96): take the max absolute value
 * of (correction on the full distance) vs (correction at the max distance of the previous
 * пояс дальности). HOWEVER that verbatim max-of-two does NOT reproduce the 699 km квитанция
 * (ЭТ201459: 6 wagons × 31224 ₽ = 187344 ₽). The residual stays FITTED to the oracle —
 * effective K4 = 0.98 × 1.0057499686370497 = 0.9856349692643087 → round(31224) EXACT.
 * Most-likely true location of the residual is K1(699) or the assumed 70t weight-row, NOT K4
 * (TARIFF_FILL_PLAN.md Lever 1). NEEDS-DATA: a short-haul групповая R-Тариф reference OR the
 * ЭТ201459 квитанция header (exact wagon count + chargeable tonnage) to disambiguate.
 *
 * FITTED flag is set on any K4Resolution that uses this multiplier.
 */

// ── Data shapes ───────────────────────────────────────────────────────────────

export interface N8Cell {
  readonly scheme: string;
  readonly weightT: number;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly rateRub: number;
}

export interface N8ClassCoeffBelt {
  readonly class: number;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly k1: number;
}

export interface N8K4Belt {
  readonly shipmentGroup: string;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly k: number;
}

/** All tables the N8 pure core needs, injected by the repository (or by tests). */
export interface N8TariffData {
  /** N8 grid (za vagon), keyed by (weightT, distanceKm). */
  readonly n8Grid: readonly N8Cell[];
  /** K1 class-coefficient belts (Табл.2). */
  readonly classCoeff: readonly N8ClassCoeffBelt[];
  /** K4 отправочный belts (Табл.5). */
  readonly k4Belts: readonly N8K4Belt[];
}

// ── K4 resolution with п.16.7 belt-boundary max-of-two ───────────────────────

export interface K4Resolution {
  readonly k4: number;
  /** Human-readable provenance for the K4 value. */
  readonly basis: string;
  /** true when the value uses SHORT_HAUL_BOUNDARY_UPLIFT (fitted, not verbatim-sourced). */
  readonly fitted: boolean;
}

/** Map wagon count to Табл.5 row label. */
export function k4GroupForWagons(n: number): string {
  if (n === 1) return "1";
  if (n === 2) return "2";
  if (n >= 3 && n <= 5) return "3-5";
  if (n >= 6 && n <= 20) return "6-20";
  return "свыше 20";
}

function beltCovers(from: number, to: number, L: number): boolean {
  return L >= from && L <= to;
}

function k4At(
  belts: readonly N8K4Belt[],
  group: string,
  distKm: number,
): N8K4Belt | undefined {
  return belts.find(
    (b) => b.shipmentGroup === group && beltCovers(b.distFromKm, b.distToKm, distKm),
  );
}

/**
 * K4 отправочный — EXACT ТР-1 п.16.7 mechanism, decoded from 11 R-Тариф reference расчётов
 * (scripts/seed-data/reference-quotes-rtariff.json). K4 is NOT a multiplicative factor on the
 * final plata — it is an ADDITIVE adjustment to the Схема-8 base, taken as the larger by
 * ABSOLUTE VALUE of two candidates (п.16.7.3 «max-of-two»):
 *
 *   candHi = база(факт_км)            × (k_текущего_пояса − 1)
 *   candLo = база(нижняя_граница_км)  × (k_предыдущего_пояса − 1)   [0 в первом поясе]
 *   плата_после_K4 = база + знаковый_max(candLo, candHi)
 *
 * Returns the EFFECTIVE factor (база + delta)/база so the caller keeps its multiplicative chain.
 * The separate доп.индексация ×1,01 (C_DOP_INDEX) is applied by the caller. This REPLACES the
 * old fitted SHORT_HAUL_BOUNDARY_UPLIFT (699 km) and the «K4=1.01» long-haul fold — both were
 * numerical compensations for this exact mechanism + the missing ×1,01. Verified: all 11 R-Тариф
 * расчётов + both квитанции (1 067 770 / 187 344) reproduce to the ruble. `fitted` now always false.
 */
export function resolveK4(
  belts: readonly N8K4Belt[],
  grid: readonly N8Cell[],
  capacityT: number,
  wagonCount: number,
  distKm: number,
  baseRate: number,
): K4Resolution {
  const group = k4GroupForWagons(wagonCount);
  const cur = k4At(belts, group, distKm);
  if (!cur) {
    throw new Error(`K4: нет Табл.5 строки '${group}' на ${distKm} км`);
  }

  const candHi = baseRate * (cur.k - 1);

  // Lower belt boundary (510 / 1000 / 2000) = upper edge of the previous belt for this row.
  const lowerKm = cur.distFromKm - 1;
  const prev = belts.find((b) => b.shipmentGroup === group && b.distToKm === lowerKm);
  let candLo = 0;
  if (prev && lowerKm >= 1) {
    candLo = n8base(grid, capacityT, lowerKm) * (prev.k - 1);
  }

  const delta = Math.abs(candLo) >= Math.abs(candHi) ? candLo : candHi;
  const k4 = (baseRate + delta) / baseRate;
  return {
    k4,
    basis:
      `п.16.7 max(|база(${lowerKm})×${prev ? (prev.k - 1).toFixed(2) : "0"}|, ` +
      `|база(${distKm})×${(cur.k - 1).toFixed(2)}|) = ${delta.toFixed(2)} → ×${k4.toFixed(6)} (sourced)`,
    fitted: false,
  };
}

// ── N8 base rate lookup ───────────────────────────────────────────────────────

/**
 * N8 base rate (₽ за вагон) for chargeable weight rounded to integer ton,
 * snapped to the distance belt.
 * Throws on a missing cell (should never happen with the full seed grid).
 */
export function n8base(grid: readonly N8Cell[], capacityT: number, distKm: number): number {
  const w = Math.round(capacityT);
  const cell = grid.find(
    (c) => c.weightT === w && beltCovers(c.distFromKm, c.distToKm, distKm),
  );
  if (!cell) {
    throw new Error(`N8: нет ячейки для ${w}т на ${distKm} км`);
  }
  return cell.rateRub;
}

// ── K1 lookup ─────────────────────────────────────────────────────────────────

/**
 * K1(class1, L) from Табл.2. Returns the class-1 coefficient for the belt covering L.
 * Throws when no belt covers L (should not occur with the full seed table).
 */
export function computeK1N8(belts: readonly N8ClassCoeffBelt[], distKm: number): number {
  const belt = belts.find(
    (b) => b.class === 1 && beltCovers(b.distFromKm, b.distToKm, distKm),
  );
  if (!belt) {
    throw new Error(`K1: нет class_coeff для класса 1 на ${distKm} км`);
  }
  return belt.k1;
}

// ── Per-wagon and per-quote computation ───────────────────────────────────────

export interface N8WagonInput {
  /** Wagon identification (for reporting). */
  readonly wagonNo: string;
  /** Грузоподъёмность (loading capacity in tonnes). N8 lookup key after rounding. */
  readonly capacityT: number;
  /** true → apply 0.9595 инновационный coefficient. */
  readonly innovative: boolean;
  /**
   * Optional wagon model number (e.g. "12-9853"). When supplied, the ×0.9595 льгота is
   * DERIVED from the sourced INNOVATIVE_N8_MODELS registry instead of trusting `innovative`.
   * Absent → the `innovative` boolean is used as-is (backward-compatible with the golden tests).
   */
  readonly wagonModel?: string | null;
  /**
   * Optional wagon type. DEFAULTS to "полувагон" when absent (this N8 core is the calibrated
   * own-полувагон path). The own-wagon class coefficient 0,9346 (C_OWN_PV_CLASS1, п.18.1.1) is
   * полувагон-ONLY — gating on this prevents крытые/платформы being mispriced with the gondola
   * coefficient. Golden квитанции omit this → default полувагон → 0,9346 applies → no change.
   */
  readonly wagonType?: string;
}

export interface N8WagonResult {
  readonly wagonNo: string;
  readonly capacityT: number;
  readonly innovative: boolean;
  readonly n8: number;
  readonly k1: number;
  readonly k4: number;
  readonly k4Basis: string;
  readonly k4Fitted: boolean;
  /** Провозная плата за вагон, округлённая до рубля. */
  readonly tariffRub: number;
}

/**
 * Compute per-wagon tariff using the N8 grid formula.
 * distKm and wagonCount are shared across all wagons in the group (отправка).
 */
export function computeWagonN8(
  w: N8WagonInput,
  data: N8TariffData,
  distKm: number,
  wagonCount: number,
): N8WagonResult {
  // Own-class-factor guard (TARIFF_FILL_PLAN item 4 / Part C): C_OWN_PV_CLASS1 = 0,9346 is the
  // п.18.1.1 class-1 coefficient for ПОЛУВАГОНЫ only. This N8 core is the own-полувагон path, so
  // wagonType defaults to полувагон; a non-полувагон caller would be mispriced with 0,9346 →
  // refuse rather than fabricate. Golden квитанции omit wagonType → default → 0,9346 applies.
  const wagonType = w.wagonType ?? "полувагон";
  if (wagonType !== "полувагон") {
    throw new Error(
      `computeWagonN8: own-class coef 0,9346 (п.18.1.1) полувагон-only; got '${wagonType}'. ` +
        `Use the universal engine (computeTariff.ts) for non-полувагон own wagons.`,
    );
  }

  const baseRate = n8base(data.n8Grid, w.capacityT, distKm);
  const k1 = computeK1N8(data.classCoeff, distKm);
  const k4r = resolveK4(data.k4Belts, data.n8Grid, w.capacityT, wagonCount, distKm, baseRate);

  // Innovative resolution: derive from the SOURCED model registry when a model string is
  // supplied (lever #3 data-half), else fall back to the caller boolean (golden-test path).
  const innovative = isInnovativeN8(w.innovative, w.wagonModel);

  let raw = baseRate * C_NERUD_PV * C_OWN_PV_CLASS1 * k1 * k4r.k4 * C_DOP_INDEX;
  if (innovative) raw *= C_INNOVATIVE;

  return {
    wagonNo: w.wagonNo,
    capacityT: w.capacityT,
    innovative,
    n8: baseRate,
    k1,
    k4: k4r.k4,
    k4Basis: k4r.basis,
    k4Fitted: k4r.fitted,
    tariffRub: Math.round(raw),
  };
}

export interface N8QuoteResult {
  readonly wagons: readonly N8WagonResult[];
  /** Sum of per-wagon tariffRub values (провозная плата итого). */
  readonly total: number;
}

/**
 * Compute провозная плата for a group отправка (собственный полувагон, class 1).
 * distKm must be the тарифное расстояние from the distance engine (not air-line).
 */
export function computeQuoteN8(
  wagons: readonly N8WagonInput[],
  data: N8TariffData,
  distKm: number,
): N8QuoteResult {
  const results = wagons.map((w) => computeWagonN8(w, data, distKm, wagons.length));
  const total = results.reduce((s, r) => s + r.tariffRub, 0);
  return { wagons: results, total };
}
