// ── ТР-1 2026: own-ПВ class-1 N8-grid tariff core ────────────────────────────
//
// VERBATIM STAGED CALC (own полувагон, ЕТСНГ class 1, групповая/повагонная), per the
// ТР-1 2026 application rules пп.16.5→16.9 quoted verbatim in
// docs/planning/TARIFF_RULES_EXACT.md (the regulation text IS on disk; see §3, §6):
//
//   16.5  base   = N8base(round(capacityT), distKm)         // Прил.N2 grid cell (за вагон), уже в копейках
//   16.6  base_K3= round01( base × 0.77 )                   // K3 нерудный (Табл.4), с-расстояния (whole haul)
//   16.7  corr   = max-of-two ABSOLUTE delta (round01 each): // K4 (Табл.5) + п.17.2 пояс-floor
//            candCur  = round01( base_K3 × (k_тек.пояса − 1) )                  // 16.7.1
//            candPrev = round01( base_K3(нижняя_граница) × (k_пред.пояса − 1) ) // 16.7.2 (0 в первом поясе)
//            corr     = знаковый max(|candPrev|, |candCur|)                     // 16.7.3
//   16.8  afterK4= round01( base_K3 + corr )
//   16.9  sequential × (round01 each step):
//            × K1(class1, distKm)   (Табл.2)
//            × 0.909                (нерудный-полувагон, Табл.4 п.1.5)
//            × 0.9346               (own-ПВ class-1, п.18.1.1)
//   then  × 1.01                    // доп.индексация — ВНЕ Раздела II (§7), applied without its own kopeck round
//   then  × 0.9595 if innovative    // инновационный полувагон (round01)
//   итог  per_wagon = round1(...)   // п.15.5 повагонная → целый рубль (half-up)
//
// The per-step kopeck rounding (round01) and the previous-belt max-of-two (16.7.2/16.7.3 + п.17.2)
// REPLACE the former flat single-round chain and the hard-fitted SHORT_HAUL_BOUNDARY_UPLIFT (699 km).
// The uplift was a numeric stand-in for exactly the previous-belt floor (candPrev) it never computed.
//
// Verified against the ТР-1 2026 квитанции (both EXACT, no fit):
//   ЭФ164189: Возрождение→Гремячая 2444 km, 15 wagons → total 1 067 770 ₽
//   ЭТ201459: Исеть→Наб.Челны     699 km,  6 wagons → total   187 344 ₽
//
// PURE: every table is injected as an argument; no DB, no network, no fs calls.

// ── Per-step rounding (ТР-1 п.15.4 / 15.5, half-up) ───────────────────────────

/**
 * Round to целые копейки (0,01 ₽), half-up away from zero (ТР-1 п.15.5 rule).
 * Applied at every Раздел-II intermediate step (пп.16.6, 16.7.1, 16.7.2, 16.8, 16.9)
 * per ТР-1 п.15.4. The +0.5/-0.5 epsilon makes it half-AWAY-from-zero for negative
 * corrections too (candPrev/candCur are negative for понижающие K4).
 */
export function round01(x: number): number {
  return x >= 0 ? Math.round(x * 100) / 100 : -Math.round(-x * 100) / 100;
}

/** Final накладная round to целый рубль (ТР-1 п.15.5, повагонная), half-up. */
export function round1(x: number): number {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

// ── Formula constants (sourced from ТР-1 2026) ────────────────────────────────

/** K3 нерудный (Табл.4) — applied at п.16.6 as a с-расстояния correction (whole haul). */
export const C_K3_NERUD = 0.77;

/** нерудный-полувагон коэффициент (Табл.4 п.1.5) — applied at п.16.9. */
export const C_NERUD_PV_GONDOLA = 0.909;

/**
 * 0.77 нерудный × 0.909 полувагон = combined load-type + wagon-type coefficient.
 * Retained for the legacy single-round reference; the staged calc applies the two
 * factors at their distinct ТР-1 steps (0.77 at 16.6, 0.909 at 16.9).
 */
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

// ── C4 / Lever 1 RESOLVED — the fitted SHORT_HAUL_BOUNDARY_UPLIFT is GONE ─────
//
// The old uplift (1.0057499686370497) hard-fitted to ЭТ201459 (699 km) has been REMOVED.
// The 699 km квитанция (6 × 31224 ₽ = 187344 ₽) now reproduces EXACTLY from the verbatim
// ТР-1 п.16.7.2/16.7.3 + п.17.2 previous-belt floor (resolveK4Correction below): at 699 km the
// max-of-two correctly picks candPrev (база(510)·К3·(0.97−1) = −1199.51 коп) over candCur
// (база(699)·К3·(0.98−1) = −994.38 коп). The уплотнение the uplift was faking IS this floor.
// Verbatim text: docs/planning/TARIFF_RULES_EXACT.md §3 (пп.16.7.1–16.7.3) and §4 (п.17.2).
// `fitted` is now permanently false. No operator data needed for the short-haul case.

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
  /** true when the value uses a fitted uplift (not verbatim-sourced). Always false now. */
  readonly fitted: boolean;
}

/** Kopeck-precise п.16.7 correction (staged calc), returned by `resolveK4Correction`. */
export interface K4Correction {
  /**
   * Additive correction to the 16.6-corrected base, in рубли (kopeck-precise),
   * per ТР-1 п.16.7.3 (signed max-of-two). Add to base_K3, then round01 (п.16.8).
   */
  readonly correction: number;
  /** Effective multiplicative factor (base_K3 + correction)/base_K3, for reporting. */
  readonly k4: number;
  /** Human-readable provenance for the K4 correction. */
  readonly basis: string;
  /** Always false — verbatim п.16.7 max-of-two, no fit. */
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
 * K4 отправочный (effective-factor form) — ORIGINAL contract kept intact for the inventory
 * (общий парк И1+В4) path, which folds K3 into its own flat single-round chain and consumes
 * `k4` as a multiplicative factor on a RAW base. K4 is taken as the signed max ABSOLUTE value
 * of two candidates on the raw base (п.16.7.3 max-of-two):
 *
 *   candHi = baseRate(факт_км)            × (k_текущего_пояса − 1)
 *   candLo = baseRate(нижняя_граница_км)  × (k_предыдущего_пояса − 1)   [0 в первом поясе]
 *   k4     = (baseRate + знаковый_max(candLo, candHi)) / baseRate
 *
 * NOTE: the own-полувагон N8 path uses `resolveK4Correction` instead (kopeck-precise, on the
 * K3-corrected base). This raw-base variant is the inventory path's UNVERIFIED contract
 * (computeInventory.ts says «НЕ ВЫВЕРЕНО до рубля»); do not route the golden N8 path through it.
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
  const lowerKm = cur.distFromKm - 1;
  const prev = belts.find((b) => b.shipmentGroup === group && b.distToKm === lowerKm);
  let candLo = 0;
  if (prev && lowerKm >= 1) {
    candLo = n8base(grid, capacityT, lowerKm) * (prev.k - 1);
  }

  const delta = Math.abs(candLo) >= Math.abs(candHi) ? candLo : candHi;
  const k4 = baseRate !== 0 ? (baseRate + delta) / baseRate : 1;
  return {
    k4,
    basis:
      `п.16.7 max(|база(${lowerKm})×${prev ? (prev.k - 1).toFixed(2) : "0"}|, ` +
      `|база(${distKm})×${(cur.k - 1).toFixed(2)}|) = ${delta.toFixed(2)} → ×${k4.toFixed(6)}`,
    fitted: false,
  };
}

/**
 * K4 отправочный correction — EXACT ТР-1 п.16.7.1/16.7.2/16.7.3 + п.17.2, computed on the
 * K3-CORRECTED base (п.16.6) and rounded to целые копейки at each step (п.15.4). This is the
 * VERIFIED own-полувагон N8 path (replaces the deleted fitted SHORT_HAUL_BOUNDARY_UPLIFT).
 *
 * The correction is the signed max ABSOLUTE value of two candidates (п.16.7.3 max-of-two):
 *
 *   candCur  = round01( base_K3(факт_км)           × (k_текущего_пояса − 1) )   [16.7.1]
 *   candPrev = round01( base_K3(нижняя_граница_км)  × (k_предыдущего_пояса − 1) ) [16.7.2, 0 в первом поясе]
 *   correction = знаковый_max(|candPrev|, |candCur|)                            [16.7.3]
 *
 * `base_K3(L)` = round01( n8base(L) × C_K3_NERUD ). Caller adds `correction` to its base_K3 and
 * round01s (п.16.8). The previous-belt floor (candPrev) at 699 km is what the old uplift faked.
 * Verified: both квитанции (1 067 770 / 187 344) reproduce to the ruble.
 */
export function resolveK4Correction(
  belts: readonly N8K4Belt[],
  grid: readonly N8Cell[],
  capacityT: number,
  wagonCount: number,
  distKm: number,
  baseK3: number,
): K4Correction {
  const group = k4GroupForWagons(wagonCount);
  const cur = k4At(belts, group, distKm);
  if (!cur) {
    throw new Error(`K4: нет Табл.5 строки '${group}' на ${distKm} км`);
  }

  // 16.7.1 — correction on the full (actual) distance, K3-corrected base.
  const candCur = round01(baseK3 * (cur.k - 1));

  // 16.7.2 — correction at the MAX distance of the previous пояс дальности (its upper edge),
  // using THAT distance's own K3-corrected base. Lower belt boundary = cur.distFromKm − 1.
  const lowerKm = cur.distFromKm - 1;
  const prev = belts.find((b) => b.shipmentGroup === group && b.distToKm === lowerKm);
  let candPrev = 0;
  if (prev && lowerKm >= 1) {
    const baseK3Prev = round01(n8base(grid, capacityT, lowerKm) * C_K3_NERUD);
    candPrev = round01(baseK3Prev * (prev.k - 1));
  }

  // 16.7.3 — pick the larger by absolute value, keep the sign.
  const correction = Math.abs(candPrev) >= Math.abs(candCur) ? candPrev : candCur;
  const k4 = baseK3 !== 0 ? (baseK3 + correction) / baseK3 : 1;
  return {
    correction,
    k4,
    basis:
      `п.16.7 знак.max(|candPrev(${lowerKm})=${candPrev.toFixed(2)}|, ` +
      `|candCur(${distKm})=${candCur.toFixed(2)}|) = ${correction.toFixed(2)} коп. (sourced)`,
    fitted: false,
  };
}

// ── N8 base rate lookup ───────────────────────────────────────────────────────

/**
 * N8 base rate (₽ за вагон) for chargeable weight rounded to integer ton,
 * snapped to the distance belt.
 *
 * H5 — published-grid FOLD (e.g. 1501–1550 km on N8/N8(1)/И1, where belts jump
 * 1451-1500 → 1551-1600). The official ТР-1 Прил.N2 grid folds these intermediate
 * ranges itself (confirmed in tr1-i-belts-full.json _meta.beltStructureNote). ТР-1 has
 * NO interpolation in Раздел II (TARIFF_RULES_EXACT.md §5): for an L landing in such a
 * published gap we SNAP to the nearest LOWER published belt (its rate covers the fold),
 * never interpolate or fabricate a value. Throws only when no belt at or below L exists.
 */
export function n8base(grid: readonly N8Cell[], capacityT: number, distKm: number): number {
  const w = Math.round(capacityT);
  const cell = grid.find(
    (c) => c.weightT === w && beltCovers(c.distFromKm, c.distToKm, distKm),
  );
  if (cell) return cell.rateRub;

  // Published-fold snap: nearest belt whose upper edge is below L (highest distToKm ≤ L).
  const lower = grid
    .filter((c) => c.weightT === w && c.distToKm < distKm)
    .sort((a, b) => b.distToKm - a.distToKm)[0];
  if (lower) {
    return lower.rateRub;
  }
  throw new Error(`N8: нет ячейки для ${w}т на ${distKm} км (и нет нижнего пояса для snap)`);
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
  /** Провозная плата за вагон, копейко-точно (до целого рубля ещё не округлена). */
  readonly tariffKopecks: number;
  /** Провозная плата за вагон, округлённая до рубля (п.15.5). */
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

  // ── 16.5 base from N8 grid (за вагон, уже в копейках) ──────────────────────
  const baseRate = n8base(data.n8Grid, w.capacityT, distKm);
  const k1 = computeK1N8(data.classCoeff, distKm);

  // ── 16.6 K3 нерудный (Табл.4), с-расстояния (whole haul) → round01 ─────────
  const baseK3 = round01(baseRate * C_K3_NERUD);

  // ── 16.7 K4 (Табл.5) отправочный correction, max-of-two on K3-corrected base ──
  const k4r = resolveK4Correction(
    data.k4Belts,
    data.n8Grid,
    w.capacityT,
    wagonCount,
    distKm,
    baseK3,
  );

  // ── 16.8 add the K4 correction onto the 16.6 base → round01 ────────────────
  let v = round01(baseK3 + k4r.correction);

  // ── 16.9 sequential × remaining coefficients, round01 each step ────────────
  v = round01(v * k1); // Табл.2 class taper
  v = round01(v * C_NERUD_PV_GONDOLA); // Табл.4 п.1.5 нерудный-полувагон
  v = round01(v * C_OWN_PV_CLASS1); // п.18.1.1 own-полувагон class-1

  // ── доп.индексация ×1,01 — ВНЕ Раздела II (§7), applied last WITHOUT its own
  //    kopeck round (it is not a Раздел-II step; rounding it separately drifts +1 ₽
  //    on the 2444 km w70 wagon and breaks the ЭФ164189 oracle). ──────────────
  v = v * C_DOP_INDEX;

  // Innovative resolution: derive from the SOURCED model registry when a model string is
  // supplied (lever #3 data-half), else fall back to the caller boolean (golden-test path).
  const innovative = isInnovativeN8(w.innovative, w.wagonModel);
  if (innovative) v = round01(v * C_INNOVATIVE); // инновационный полувагон ×0,9595

  return {
    wagonNo: w.wagonNo,
    capacityT: w.capacityT,
    innovative,
    n8: baseRate,
    k1,
    k4: k4r.k4,
    k4Basis: k4r.basis,
    k4Fitted: k4r.fitted,
    tariffKopecks: v,
    tariffRub: round1(v), // п.15.5 повагонная → целый рубль
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
