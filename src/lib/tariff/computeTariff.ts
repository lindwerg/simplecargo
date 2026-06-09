// The ТР-1 2026 tariff orchestrator (TARIFF_CALCULATOR §2, §5). This is a PURE core:
// it takes every rate/coefficient table AND the already-resolved distance as arguments
// (bundled in TariffData), so it unit-tests by injecting fixtures — no DB, no network.
// The Drizzle load + computeDistance() call live in ./repository.
//
// Loaded-car formula (повагонная):
//   ПП_безНДС = И(iScheme,L)×K1(class,L)×K3×K4×K5
//             + [В(vScheme,L)  only if ownership='rzd']
//             + [порожний(L,axles)  only if ownership='own']
//   ×Минстрой ×контейнер  (by date)
//   ×∏(1+index_i/100)   (applicable indexations)
//   ПП_итог = ... ×(1+НДС)   (НДС 22% domestic / 0% export, applied LAST)
//
// Our primary path: ownership='own', wagon='ПВ', class 1 (щебень) → И + порожний, NO В.
// GRACEFUL DEGRADATION: if any required table/row is missing the result carries
// confidence 'red' + a warnings[] entry — the engine NEVER fabricates a number.

import {
  buildEtsngCatalog,
  chargeableTons,
  classLookup,
  type EtsngEntry,
} from "./classLookup";
import {
  coefficientStack,
  computeK1,
  indexFactor,
  type ClassCoeffBelt,
  type CoefficientLike,
  type CoefContext,
  type DistanceCorrBelt,
  type IndexationLike,
} from "./coefficients";
import {
  resolveContainerPlate,
  resolveContainerReduction,
  resolveDirectionalK3,
  resolveInnovativeCoef,
  resolveK3,
  resolveK4,
  resolveK4Full,
  resolveSchemes,
  snapEmptyRun,
  snapToBelt,
  type ContainerReductionRow,
  type DirectionalK3Row,
  type EmptyRunBelt,
  type InnovativeModel,
  type K3Row,
  type K4FullRow,
  type K4Row,
  type RateBelt,
  type WagonSchemeRow,
} from "./schemeResolve";
import {
  computeWagonN8,
  round01,
  round1,
  type N8TariffData,
  type N8WagonInput,
} from "./computeTariffN8";
import type { Confidence, FreightClass, TariffBreakdown, TariffInput } from "./schema";

const VAT_DOMESTIC = 22; // % — 2026 domestic НДС
const VAT_EXPORT = 0; // % — export/international
const CONTAINER_WAGON_CODE = "КН";

// ── Container wagon-type codes (контейнерные отправки → linearAB plate N85-94) ──
// Both КН (контейнер) and ФП (фитинговая платформа) carry containers and resolve to the
// container scheme set; the linearAB plate is selected by containerSize + ownership.
const CONTAINER_WAGON_TYPES: ReadonlySet<string> = new Set(["КН", "ФП"]);

// ── 2026 container indexation +5% (схемы 85-94, нетермические) ──────────────────
// sourced-official-press (Interfax) — applied ×1.05 OVER the A+B×KL plate result. YELLOW
// (not byte-verbatim from the registered indexation order). The base +10% is already inside
// the Табл.N24 A/B values — do NOT re-apply (tr1-i-belts-container.json _meta.plus5_2026).
const CONTAINER_PLUS5_2026 = 1.05;

// ── Class-3 named-position K1 split (Табл.2) — verbatim from tr1-k1-full.json class-3 rows.
// Поименованные позиции → 1,74; остальные позиции 3-го класса → 1,54. The seed carries TWO
// class-3 belts with identical distance range, so a plain belts.find() always picks 1,74 →
// over-charges "other" class-3 cargo. We select by 3-digit ЕТСНГ position prefix (range-aware).
const K1_CLASS3_NAMED = 1.74;
const K1_CLASS3_OTHER = 1.54;
// VERBATIM named-position list (Табл.2, sudact 894/25, byte-confirmed in
// scripts/seed-data/tr1-class-k3-full-verify.json task1_K1_classCoeff.class3_split).
const K1_CLASS3_NAMED_POSITIONS =
  "092,093,312-316,321-324,331-333,381,391,411,414,416,454,461,481," +
  "483-489,611,693,711-713,721-726,731,732,741,742,751-754,756-758";

// ── Class-2/3 surcharge ×1.04 + доп.индексация ×1.01 (universal path) ────────────
// «Коэффициент на перевозку грузов N класса» (п.3.3 class-2 / п.5.7 class-3, Приказ ФАС
// 894/25 — byte-verified verbatim in scripts/seed-data/tr1-commodity-coef-verify.json):
// a flat ×1.04 multiplier that applies to BOTH class-2 and class-3 loaded provозная плата.
// «Коэффициент дополнительной индексации» ×1.01 (C_DOP_INDEX, ВНЕ Раздела II §7) is the LAST
// factor on EVERY loaded ТР-1 расчёт — all 11 R-Тариф reference расчётов and every oracle in
// reference-quotes-batch-0609.json end on it. On the certified N8 path BOTH are already baked
// into computeWagonN8 (the ×1.01 is its final ×C_DOP_INDEX; class-1 нерудные carry NO ×1.04
// class surcharge) — so these universal-path multipliers fire ONLY off the certified path, and
// the ×1.04 only for class 2/3. Neither is a fabricated number: both are sourced rule constants.
const CLASS_SURCHARGE_2_3 = 1.04;
const DOP_INDEX_FACTOR = 1.01;

/** Confidence ordering helper: cap a computed confidence so it never exceeds a ceiling. */
function capConfidence(value: Confidence, ceiling: Confidence): Confidence {
  const rank: Record<Confidence, number> = { green: 2, yellow: 1, red: 0 };
  return rank[value] <= rank[ceiling] ? value : ceiling;
}

// ── Validated green contour (universal path) ───────────────────────────────────
// The ONLY (wagon×class×commodity) combo the universal coefficient-stack path may report
// green is the oracle-locked own-полувагон class-1 НЕРУДНЫЕ contour — the exact contour both
// real квитанции (ЭФ164189/ЭТ201459) and the R-Тариф расчёт reproduce to the ruble. The
// нерудный test is the verbatim Табл.4 п.1.5 ЕТСНГ position set (231-236; 241,242,245,246).
const NERUD_K3_POSITIONS = "231-236,241,242,245,246";

function isValidatedOwnGondolaClass1Nerud(
  input: TariffInput,
  tariffClass: FreightClass,
): boolean {
  return (
    input.ownership === "own" &&
    GONDOLA_WAGON_TYPES.has(input.wagonType) &&
    tariffClass === 1 &&
    matchesPositionList(NERUD_K3_POSITIONS, input.etsngCode)
  );
}

/**
 * Match a 6-digit ЕТСНГ code against a 3-digit-position list with ranges (e.g. "312-316").
 * Used for the class-3 1,74-vs-1,54 split (named positions take 1,74). Reuses the same
 * containment logic as K3 patterns: compare the code's 3-digit prefix against each token.
 */
function matchesPositionList(positions: string, etsngCode: string): boolean {
  const prefix = etsngCode.slice(0, 3);
  for (const token of positions.split(",").map((t) => t.trim())) {
    if (token.includes("-")) {
      const [lo, hi] = token.split("-").map((x) => x.trim());
      if (prefix >= lo && prefix <= hi) return true;
    } else if (prefix === token) {
      return true;
    }
  }
  return false;
}

/**
 * Select the class-3 K1 belts the engine should hand to computeK1: keep only the row whose
 * named-position membership matches the cargo (1,74 for named positions, 1,54 for the rest).
 * For non-class-3 the belts pass through unchanged. This closes the class-3 split (H2/L8)
 * WITHOUT fabricating: both 1,74 and 1,54 are verbatim Табл.2 values already on disk.
 */
function selectClassBeltsForClass3(
  classBelts: readonly ClassCoeffBelt[],
  tariffClass: FreightClass,
  etsngCode: string,
): readonly ClassCoeffBelt[] {
  if (tariffClass !== 3) return classBelts;
  const named = matchesPositionList(K1_CLASS3_NAMED_POSITIONS, etsngCode);
  const wanted = named ? K1_CLASS3_NAMED : K1_CLASS3_OTHER;
  // Drop the non-applicable class-3 row so computeK1's find() resolves the correct one.
  // If the seed only carries one class-3 row (e.g. a fixture), leave it untouched.
  const class3Rows = classBelts.filter((b) => b.freightClass === 3);
  if (class3Rows.length < 2) return classBelts;
  return classBelts.filter((b) => b.freightClass !== 3 || b.k1 === wanted);
}

/**
 * Effective K4 factor for a WEIGHT-GRID per-wagon scheme (N8/И1), computed as the verbatim
 * п.16.7 max-of-two BASE-DELTA on the RAW base (NOT a flat table multiplier). This is the same
 * certified mechanism resolveK4()/resolveK4Correction() use on the N8 path; the universal class
 * 2/3 own-ПВ/платформа chain needs it too, because the flat-multiplier K4 (e.g. 1.01 @ >2000 km)
 * undershoots the boundary floor (п.16.7.2 candPrev) by ~1.5% and breaks the oracle to-the-ruble.
 *
 *   candCur  = base(scheme, w, L)            × (k_текущего_пояса − 1)
 *   candPrev = base(scheme, w, L_prevEdge)   × (k_предыдущего_пояса − 1)   [0 in the first belt]
 *   k4eff    = (base(L) + знаковый_max(|candPrev|, |candCur|)) / base(L)
 *
 * Where L_prevEdge = (cur K4 belt distFromKm − 1) and the bases are read from the SAME weight
 * grid (data.rateBelts, schemeCode, weightT). Returns null (caller keeps the flat factor) when
 * the K4 belt or a grid base is missing — never fabricates. Verified against
 * reference-quotes-batch-0609.json: every own_pv/platform afterK4 reproduces to the kopeck.
 */
function k4BaseDeltaFactor(
  belts: readonly RateBelt[],
  schemeCode: string,
  weightT: number,
  k4FullRows: readonly K4FullRow[],
  shipmentGroup: string,
  distanceKm: number,
): number | null {
  const gridBaseAt = (L: number): number | null => {
    const cell = belts.find(
      (b) =>
        b.schemeCode === schemeCode &&
        b.weightT === weightT &&
        L >= b.distFromKm &&
        L <= b.distToKm,
    );
    return cell ? cell.rateRub : null;
  };
  const cur = k4FullRows.find(
    (r) => r.shipmentGroup === shipmentGroup && distanceKm >= r.distFromKm && distanceKm <= r.distToKm,
  );
  if (!cur) return null;
  const baseCur = gridBaseAt(distanceKm);
  if (baseCur == null || baseCur === 0) return null;

  // п.15.4 — round each п.16.7 candidate to целые копейки (mirrors the certified
  // resolveK4Correction and the per-tonne k4PerTonneBaseDeltaFactor). Verified no-op on the
  // batch-0609 own-ПВ/платформа oracles (single-float == per-step to the kopeck), but it is
  // the literal п.15.4 step and keeps the universal weight-grid K4 byte-identical to N8.
  const candCur = round01(baseCur * (cur.k - 1));

  const prevEdge = cur.distFromKm - 1;
  const prev = k4FullRows.find((r) => r.shipmentGroup === shipmentGroup && r.distToKm === prevEdge);
  let candPrev = 0;
  if (prev && prevEdge >= 1) {
    const basePrev = gridBaseAt(prevEdge);
    if (basePrev != null) candPrev = round01(basePrev * (prev.k - 1));
  }

  const delta = Math.abs(candPrev) >= Math.abs(candCur) ? candPrev : candCur;
  return (baseCur + delta) / baseCur;
}

/**
 * Per-TONNE variant of the п.16.7 K4 base-delta, for distance-only nalivnye цистерна schemes
 * (N19-N24). Identical max-of-two mechanism as k4BaseDeltaFactor, but the per-tonne plate has NO
 * weight dimension — the base is read by distance alone (snapToBelt with chargeableWeightT=null).
 * Returns the effective multiplicative factor (afterK4 / base) so the per-tonne caller applies it
 * as `perTonneBase × factor × …`. Validated CIS-C3 (481 кислота, 2543 км, group "1"): base 4002.70,
 * candCur=round01(4002.70×0.01)=40.03, candPrev=round01(база(2000)=3278.50×0.03)=98.36 → corr 98.36
 * → afterK4 4101.06 (factor 1.0245734…). Reproduces the oracle to the kopeck. Returns null (caller
 * keeps the flat factor) when the K4 belt or a base cell is missing — never fabricates.
 */
function k4PerTonneBaseDeltaFactor(
  belts: readonly RateBelt[],
  schemeCode: string,
  k4FullRows: readonly K4FullRow[],
  shipmentGroup: string,
  distanceKm: number,
): number | null {
  const baseAt = (L: number): number | null => {
    const cell = belts.find(
      (b) =>
        b.schemeCode === schemeCode &&
        (b.weightT == null) &&
        L >= b.distFromKm &&
        L <= b.distToKm,
    );
    return cell ? cell.rateRub : null;
  };
  const cur = k4FullRows.find(
    (r) => r.shipmentGroup === shipmentGroup && distanceKm >= r.distFromKm && distanceKm <= r.distToKm,
  );
  if (!cur) return null;
  const baseCur = baseAt(distanceKm);
  if (baseCur == null || baseCur === 0) return null;

  const candCur = round01(baseCur * (cur.k - 1));

  const prevEdge = cur.distFromKm - 1;
  const prev = k4FullRows.find((r) => r.shipmentGroup === shipmentGroup && r.distToKm === prevEdge);
  let candPrev = 0;
  if (prev && prevEdge >= 1) {
    const basePrev = baseAt(prevEdge);
    if (basePrev != null) candPrev = round01(basePrev * (prev.k - 1));
  }

  const corr = Math.abs(candPrev) >= Math.abs(candCur) ? candPrev : candCur;
  return (baseCur + corr) / baseCur;
}

/**
 * Map (wagonCount, shipmentType) to the Табл.5 group label used by the K4 full table and the
 * base-delta helper. Mirrors k4GroupForCount in schemeResolve + the route mapping in
 * resolveK4Full (route → "маршрут прямой"). Default count = 1 (повагонная base).
 */
function k4GroupForUniversal(
  wagonCount: number | undefined,
  shipmentType: TariffInput["shipmentType"],
): string {
  if (shipmentType === "route") return "маршрут прямой";
  const n = wagonCount ?? 1;
  if (n === 1) return "1";
  if (n === 2) return "2";
  if (n >= 3 && n <= 5) return "3-5";
  if (n >= 6 && n <= 20) return "6-20";
  return "свыше 20";
}

/** Distance resolved by the distance engine, fed into the pure tariff core. */
export interface ResolvedDistance {
  readonly distanceKm: number;
  readonly found: boolean; // false when Книга-3 edge missing etc.
  readonly warning?: string;
}

/**
 * All data the pure core needs, injected by the repository (or by tests as fixtures).
 * Every field is a plain array/map so the core never touches Drizzle.
 *
 * New Phase-1 fields:
 *   k3Rows         — Таблица 4 commodity coefficients (replaces K3_NEUTRAL=1.0)
 *   k4FullRows     — Таблица 5 wagon-count × distance full table (replaces simple K4Row enum)
 *   innovativeModels — Табл.6/7 model→coef map (replaces fitted 0.9595 constant)
 *
 * Legacy k4Rows kept for backward compatibility; k4FullRows takes precedence when non-empty.
 */
export interface TariffData {
  readonly distance: ResolvedDistance;
  readonly etsng: readonly EtsngEntry[];
  readonly schemeMap: readonly WagonSchemeRow[];
  readonly rateBelts: readonly RateBelt[];
  readonly classBelts: readonly ClassCoeffBelt[];
  readonly corrBelts: readonly DistanceCorrBelt[];
  readonly emptyRunBelts: readonly EmptyRunBelt[];
  /** Legacy simple K4 rows (shipmentType enum → k4). Used when k4FullRows is empty. */
  readonly k4Rows: readonly K4Row[];
  readonly coefficients: readonly CoefficientLike[];
  readonly indexations: readonly IndexationLike[];
  /** Таблица 4 commodity coefficient rows (K3). Empty array = all neutral 1.0. */
  readonly k3Rows: readonly K3Row[];
  /** Таблица 5 full wagon-count × distance K4 table. Empty array = fall back to k4Rows. */
  readonly k4FullRows: readonly K4FullRow[];
  /** Innovative wagon model→coef map (Табл.6/7 per-model льгота). Empty = all 1.0. */
  readonly innovativeModels: readonly InnovativeModel[];
  /**
   * CERTIFIED own-полувагон class-1 нерудные N8 tables (Прил.N2 scheme N8 grid + Табл.2 + Табл.5).
   * When present AND the input matches the certified contour (isCertifiedN8Path), the И-component
   * is computed by the certified staged-kopeck chain (computeWagonN8) — the SAME chain that
   * reproduces the golden квитанции (1 067 770 / 187 344) and the R-Тариф oracle (82 816 / 101 035.52)
   * EXACTLY to the kopeck. This unifies the two engines (gap H1): the prod entrypoint IS the
   * certified path, not a coincidentally-equal coefficient-stack re-derivation. Optional — when
   * absent the universal coefficient-stack path runs unchanged (e.g. synthetic unit fixtures).
   */
  readonly n8?: N8TariffData;
  /**
   * Табл.N3 directional rows (направленческие множители п.16.9). Optional — when absent or
   * empty the directional resolver is a documented no-op (×1.0). Inert for every ordinary
   * inter-RF haul (no route→direction classifier wired yet); only fires on a flagged
   * Калининград/погранстанция/лесной-маршрут direction. Loaded by loadDirectionalK3FromSeed.
   */
  readonly directionalRows?: readonly DirectionalK3Row[];
  /**
   * Табл.N12 FCL container reductions (₽/контейнер, п.16.10). Optional — when absent or empty
   * no reduction is subtracted and the container path flags it YELLOW (never fabricates a row).
   * Loaded by loadContainerReductionsFromSeed.
   */
  readonly containerReductions?: readonly ContainerReductionRow[];
}

// ── Canonical полувагон identifiers (the certified own-ПВ N8 contour) ──────────
// The universal engine seeds wagonType as "ПВ"; the quote/voice surface uses "полувагон".
// Both denote the same own gondola the certified N8 chain prices to the kopeck.
const GONDOLA_WAGON_TYPES: ReadonlySet<string> = new Set(["ПВ", "полувагон"]);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function vatRateFor(traffic: TariffInput["traffic"]): number {
  return traffic === "domestic" ? VAT_DOMESTIC : VAT_EXPORT;
}

/** A fully-degraded result: distance kept, everything else zero, confidence 'red'. */
function redResult(
  distanceKm: number,
  tariffClass: FreightClass,
  chargeable: number,
  vatRate: number,
  warnings: string[],
): TariffBreakdown {
  return {
    distanceKm,
    iComponent: 0,
    vComponent: 0,
    emptyRun: 0,
    surcharges: 0,
    preIndex: 0,
    loadedNoVat: 0,
    indexFactor: 1,
    postIndex: 0,
    vatRate,
    total: 0,
    tariffClass,
    chargeableTons: chargeable,
    source: "computed",
    confidence: "red",
    warnings,
  };
}

/**
 * True when the input falls inside the CERTIFIED own-полувагон class-1 нерудные contour AND
 * the N8 tables are injected. Only this exact contour reproduces the golden oracles to the
 * kopeck, so only it is routed through the certified chain; everything else stays on the
 * universal coefficient-stack path. Guarding here keeps the prod path == the validated path
 * (gap H1) without ever fabricating a number for an unbacked scenario.
 */
function isCertifiedN8Path(
  input: TariffInput,
  tariffClass: FreightClass,
  data: TariffData,
): boolean {
  return (
    data.n8 != null &&
    input.ownership === "own" &&
    GONDOLA_WAGON_TYPES.has(input.wagonType) &&
    tariffClass === 1 &&
    typeof input.wagonCount === "number" &&
    input.wagonCount >= 1
  );
}

/**
 * Compute the certified per-wagon LOADED И-component (kopeck-precise) via the N8 staged-kopeck
 * chain (computeWagonN8 — пп.16.5→16.9 + ×1,01 + innovative, per-step round01). This is the
 * exact value behind the golden oracles. The universal core consumes it as `iComponent`, then
 * adds порожний and applies НДС last. Returns null when the certified chain refuses (e.g. a
 * non-полувагон leaked through) so the caller falls back to the universal path / red result.
 */
function certifiedN8LoadedComponent(
  input: TariffInput,
  n8: N8TariffData,
  distanceKm: number,
): number | null {
  const wagon: N8WagonInput = {
    wagonNo: "1",
    capacityT: input.actualWeightTons,
    // The universal схема has no per-wagon innovative boolean; derive solely from the model
    // string via the sourced registry (isInnovativeN8). Absent model → classic (false).
    innovative: false,
    wagonModel: input.wagonModel ?? null,
    wagonType: "полувагон",
  };
  try {
    const r = computeWagonN8(wagon, n8, distanceKm, input.wagonCount as number);
    // Use the certified per-wagon ruble value (tariffRub): the повагонная ruble round (п.15.5,
    // half-up) is the FINAL step of the certified chain, so it must be the value the prod path
    // reports — taking the raw kopeck value and re-rounding downstream drifts ±1 ₽ off the
    // golden oracle (e.g. 70т@2444 → 72005 ₽ certified, but 72006 ₽ if re-rounded). НДС is then
    // applied last by the universal core onto this certified ruble loaded плата.
    return r.tariffRub;
  } catch {
    return null;
  }
}

/**
 * Compute the Layer-1 РЖД provозная плата (без НДС until the final total) for a loaded
 * car, pure over injected tables. Returns a TariffBreakdown whose confidence/warnings
 * gate downstream use. Any missing required datum short-circuits to a 'red' result.
 */
export function computeTariffPure(
  input: TariffInput,
  data: TariffData,
): TariffBreakdown {
  const warnings: string[] = [];
  const vatRate = vatRateFor(input.traffic);

  // ── class + МВН → chargeable tons (resolved first so red results carry the real class) ──
  const catalog = buildEtsngCatalog(data.etsng);
  const cls = classLookup(catalog, input.etsngCode, input.wagonType);
  if (!cls.found) {
    warnings.push(`Нет ЕТСНГ ${input.etsngCode} в каталоге — класс не определён`);
    return redResult(data.distance.distanceKm, cls.tariffClass, input.actualWeightTons, vatRate, warnings);
  }
  const tariffClass = cls.tariffClass;

  // ── distance ────────────────────────────────────────────────────────────────
  const distanceKm = data.distance.distanceKm;
  if (!data.distance.found) {
    warnings.push(data.distance.warning ?? "Расстояние не определено (нет ребра Книга-3)");
    return redResult(distanceKm, tariffClass, input.actualWeightTons, vatRate, warnings);
  }
  // BILLABLE MASS (расчётная масса) = max(фактическая масса, минимальная весовая норма).
  // chargeableTons applies the floor; cls.mvn comes from the ЕТСНГ catalog (Табл.N1 МВН).
  // For нерудные (МВН='gp') and cisterns (no МВН) billable = actual, which is correct.
  // ANTI-UNDER-BILL: for a NUMERIC-МВН род (полувагон/платформа carrying class-2/3 packaged
  // cargo) a MISSING МВН means we fell back to actual weight without a known floor — flag
  // YELLOW so it is reviewed, never silently under-billed by fabricating a floor.
  const chargeable = chargeableTons(input.actualWeightTons, cls.mvn);
  const isCisternType = input.wagonType.includes("цистерн") || input.wagonType === "ЦС";
  if (cls.mvn === null && !isCisternType && (cls.tariffClass === 2 || cls.tariffClass === 3)) {
    warnings.push(
      `Минимальная весовая норма (МВН) не задана для ЕТСНГ ${input.etsngCode} (класс ${cls.tariffClass}) — ` +
        "расчётная масса взята по факту без нижнего порога; проверьте загрузку (confidence YELLOW).",
    );
  }

  // ── schemes (И / В) ───────────────────────────────────────────────────────────
  const schemes = resolveSchemes(
    data.schemeMap,
    input.wagonType,
    input.ownership,
    input.shipmentType,
  );
  if (!schemes.found) {
    if (schemes.warning) warnings.push(schemes.warning);
    return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
  }

  // ── CONTAINER PATH (H6/H17, schemes N85-94 linearAB plate) ─────────────────────
  // Контейнерные отправки price ЗА КОНТЕЙНЕР via A + B×KL (Табл.N24), keyed by
  // containerSize + ownership — NOT a за-вагон/за-тонну belt. Handled here as a complete
  // self-contained branch (no K1/K3/K4/порожний). Result is YELLOW at best (+5% indexation
  // is sourced-official-press, not byte-verbatim). Unbacked plate → red, never fabricated.
  if (CONTAINER_WAGON_TYPES.has(input.wagonType)) {
    const plate = resolveContainerPlate(
      data.rateBelts,
      input.containerSize,
      input.ownership,
      distanceKm,
    );
    if (!plate.found) {
      if (plate.warning) warnings.push(plate.warning);
      return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
    }
    // плата = A + B×KL (kopeck-precise inside resolveContainerPlate), then ×1.05 (нетермич.).
    const plateWithIndex = round2(plate.rateRub * CONTAINER_PLUS5_2026);
    // ── п.16.10 уменьшение тарифа (Табл.N12) — вычитается ДО п.15.5 округления ──────
    // FCL контейнерные отправки полными комплектами get a per-container reduction subtracted
    // before the whole-ruble round. resolveContainerReduction returns 0/applied:false (with a
    // flag) when the size→Табл.N12 row mapping is not verbatim-sourced (Табл.N10 not on disk) —
    // we then DO NOT subtract a guessed amount (MONEY CONTRACT); the result stays YELLOW.
    const reduction = resolveContainerReduction(
      data.containerReductions ?? [],
      input.containerSize,
      input.ownership,
    );
    if (reduction.warning) warnings.push(reduction.warning);
    // Subtract at целые копейки (п.16.10 intermediate), clamp ≥ 0 so a stale/oversized reduction
    // can never invert the plate into a negative tariff (never fabricates a number either way).
    const iContainer = round2(Math.max(0, plateWithIndex - reduction.reductionRub));
    const preIndexC = round2(iContainer);
    const factorC = indexFactor(data.indexations, input.asOfDate, tariffClass);
    const postIndexC = round2(iContainer * factorC);
    const totalC = round2(postIndexC * (1 + vatRate / 100));
    warnings.push(
      "Контейнерная отправка: плата A+B×KL (Табл.N24) ×1.05 (доп.индексация 2026, " +
        "источник — офиц.пресса, не byte-verbatim)" +
        (reduction.applied
          ? ` − уменьшение Табл.N12 (п.16.10) ${reduction.reductionRub} ₽`
          : " (уменьшение Табл.N12 п.16.10 НЕ применено — см. предупреждение)") +
        " — confidence YELLOW, требует сверки оператором.",
    );
    return {
      distanceKm,
      iComponent: iContainer,
      vComponent: 0,
      emptyRun: 0,
      surcharges: 0,
      preIndex: preIndexC,
      loadedNoVat: preIndexC, // контейнер несёт no порожний leg → loaded == preIndex
      indexFactor: factorC,
      postIndex: postIndexC,
      vatRate,
      total: totalC,
      tariffClass,
      chargeableTons: chargeable,
      source: "computed",
      confidence: "yellow", // containers NEVER green until operator certifies
      warnings,
    };
  }

  // ── M5: classifier flagged this род not price-computable (no acquired belt data) ──
  // Carry the real root cause. Belt resolution below stays authoritative: if a backed belt
  // is nonetheless found the result still prices (capped yellow); if not it surfaces red here.
  let confidenceCeiling: Confidence = "green";
  if (schemes.computable === false) {
    warnings.push(
      `Род вагона ${input.wagonType}/${input.ownership} помечен классификатором как ` +
        "не полностью выверенный (computable:false) — расчёт ниже ограничен confidence YELLOW.",
    );
    confidenceCeiling = capConfidence(confidenceCeiling, "yellow");
  }

  // ── И base rate (snap L to belt, weight-aware for N8/И1 2D grids) ──────────────
  const iBelt = snapToBelt(data.rateBelts, schemes.iSchemeCode, distanceKm, chargeable);
  if (!iBelt.found) {
    if (iBelt.warning) warnings.push(iBelt.warning);
    return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
  }
  // A backed but not-green belt (e.g. cistern medium, reefer) caps the result confidence.
  if (iBelt.confidence === "yellow" || iBelt.confidence === "medium" || iBelt.confidence === "low") {
    confidenceCeiling = capConfidence(confidenceCeiling, "yellow");
  }

  // ── K1 (class, distance) max-of-two ───────────────────────────────────────────
  // Class-3 split (H2/L8): pick 1,74 (named positions) vs 1,54 (other) by ЕТСНГ position
  // before computeK1's find() resolves the belt. Non-class-3 belts pass through unchanged.
  const k1Belts = selectClassBeltsForClass3(data.classBelts, tariffClass, input.etsngCode);
  const k1 = computeK1(k1Belts, data.corrBelts, tariffClass, distanceKm);
  if (!k1.found) {
    if (k1.warning) warnings.push(k1.warning);
    return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
  }
  // Suppress the "distance_corr missing" soft warning: ТР-1 2026 К1 is fully table-driven
  // by class (Табл.2) — there is no separate distance-correction taper table. Empty
  // corrBelts is the correct state; the warning would incorrectly make every result yellow.
  if (k1.warning && !k1.warning.includes("distance_corr")) {
    warnings.push(k1.warning);
  }

  // ── K3 commodity coefficient (Таблица 4) ──────────────────────────────────────
  const k3Result = resolveK3(data.k3Rows, input.etsngCode, tariffClass, input.wagonType);
  if (k3Result.warning) warnings.push(k3Result.warning);
  const k3 = k3Result.k3;

  // ── K4 отправочный — full table (Табл.5) takes precedence over legacy enum ────
  let k4Value = 1.0;
  if (data.k4FullRows.length > 0) {
    const k4Full = resolveK4Full(
      data.k4FullRows,
      input.wagonCount,
      input.shipmentType,
      distanceKm,
    );
    if (k4Full.warning) warnings.push(k4Full.warning);
    if (!k4Full.found) {
      // K4 table present but no row found — soft warn, use 1.0
      warnings.push(k4Full.warning ?? `K4 не найден (${input.shipmentType}, ${distanceKm} км) — применён 1.0`);
    }
    k4Value = k4Full.k4;
  } else {
    // Fall back to the legacy simple resolveK4 (shipmentType enum).
    const k4Legacy = resolveK4(data.k4Rows, input.shipmentType);
    if (k4Legacy.warning) warnings.push(k4Legacy.warning);
    k4Value = k4Legacy.k4;
  }

  // ── K4 as п.16.7 BASE-DELTA for class-2/3 weight-grid per-wagon schemes ────────
  // The flat-multiplier K4 above (e.g. 1.01 @ >2000 km) is calibrated for the certified
  // class-1 нерудные universal oracles, where it stands in for доп.индексация. For the
  // class-2/3 own-ПВ/платформа chain the oracle (reference-quotes-batch-0609.json) shows K4
  // as a max-of-two BASE-DELTA on the RAW N8 base AND a separate ×1.01 доп.индексация — so for
  // class 2/3 we replace the flat factor with the certified base-delta (k4BaseDeltaFactor).
  // Gated to: class 2/3, a weight-grid per-wagon belt, and a full K4 table present. Когда
  // grid/belt data is missing the helper returns null and we keep the flat factor (no fabricate).
  if (
    (tariffClass === 2 || tariffClass === 3) &&
    !iBelt.perTonne &&
    data.k4FullRows.length > 0 &&
    schemes.iSchemeCode != null
  ) {
    const isWeightGrid = data.rateBelts.some(
      (b) => b.schemeCode === schemes.iSchemeCode && b.weightT != null,
    );
    if (isWeightGrid) {
      const group = k4GroupForUniversal(input.wagonCount, input.shipmentType);
      const eff = k4BaseDeltaFactor(
        data.rateBelts,
        schemes.iSchemeCode,
        Math.round(chargeable),
        data.k4FullRows,
        group,
        distanceKm,
      );
      if (eff !== null) k4Value = eff;
    }
  }

  // ── ЦИСТЕРНА per-tonne branch (схема 19 наливные в приватных цистернах, ЗА ТОННУ) ──
  // A self-contained branch for own/rented nalivnye цистерны (N19-N24), priced PER TONNE.
  // The oracle chain (reference-quotes-batch-0609.json CIS-C3, кислота 481, 2543 км):
  //   плата/т = schema19base(L) ±K4(п.16.7 base-delta, group "1") × K1(class 1.74 named) ×
  //             commodity(кислоты 0.81) × ×1.01 доп.индексация
  //   total   = плата/т × масса (НЕТ минимальной весовой нормы — billable = факт. масса;
  //             НЕТ ×1.04 class surcharge — наливные не несут его; НЕТ коэф рода; НЕТ порожнего).
  // Validated CIS-C3 → 391135 ₽ без НДС to the kopeck. К4 is the per-tonne base-delta (distance-
  // only N19 plate); when the helper refuses (missing belt) we keep the flat K4 (no fabricate).
  // Every factor is a sourced rule constant (894/25 Прил.N2 + Табл.2/4/5), never a guessed number.
  if (isCisternType && iBelt.perTonne) {
    let perTonneK4 = k4Value; // flat fallback
    if (schemes.iSchemeCode != null && data.k4FullRows.length > 0) {
      const group = k4GroupForUniversal(input.wagonCount, input.shipmentType);
      const eff = k4PerTonneBaseDeltaFactor(
        data.rateBelts,
        schemes.iSchemeCode,
        data.k4FullRows,
        group,
        distanceKm,
      );
      if (eff !== null) perTonneK4 = eff;
    }
    // Цистерна billable = фактическая масса (нет минимальной весовой нормы для наливных).
    const cisternMass = input.actualWeightTons;
    // п.15.4 PER-STEP kopeck rounding on the per-tonne rate — mirror the certified
    // computeTariffN8 chain (round01 after each ×coefficient). Verified no-op on CIS-C3
    // (single-float == per-step to the kopeck), closes the literal п.15.4 gap on this path too.
    let rpt = round01(iBelt.rateRub);
    rpt = round01(rpt * perTonneK4);
    rpt = round01(rpt * k1.k1);
    rpt = round01(rpt * k3);
    rpt = round01(rpt * DOP_INDEX_FACTOR);
    const ratePerTonne = rpt;
    // п.15.5 повагонная → провозная плата округляется до целого рубля (half-up). The per-tonne
    // rate × mass is the per-wagon плата; round it to the ruble to match the R-Тариф provNoVat
    // (CIS-C3: 5837.834…/т × 67 = 391134.90 → 391135 ₽). НДС is then applied onto this ruble value.
    const iCistern = round1(ratePerTonne * cisternMass);
    const factorC = indexFactor(data.indexations, input.asOfDate, tariffClass);
    const postIndexC = round2(iCistern * factorC);
    const totalC = round2(postIndexC * (1 + vatRate / 100));
    // Confidence: per-tonne цистерна is computed per the official Прил.N2 plate but NOT certified
    // against a real квитанция → YELLOW (never green). Note YELLOW for operator review.
    warnings.push(
      "Наливной груз в приватной цистерне (схема 19, ЗА ТОННУ ×масса, без мин.весовой нормы, " +
        "без коэф.рода и без порожнего пробега в провозной плате) — рассчитано по Прил.N2/Табл.2/4/5, " +
        "не сверено до рубля с реальной квитанцией: confidence YELLOW, проверьте оператором.",
    );
    return {
      distanceKm,
      iComponent: iCistern,
      vComponent: 0,
      emptyRun: 0,
      surcharges: 0,
      preIndex: round2(iCistern),
      loadedNoVat: round2(iCistern), // цистерна per-tonne несёт no порожний leg → loaded == preIndex
      indexFactor: factorC,
      postIndex: postIndexC,
      vatRate,
      total: totalC,
      tariffClass,
      chargeableTons: cisternMass,
      source: "computed",
      confidence: "yellow",
      warnings,
    };
  }

  // ── Innovative model coefficient (replaces fitted 0.9595 constant) ────────────
  const innovativeCoef = resolveInnovativeCoef(data.innovativeModels, input.wagonModel);

  // ── И component ───────────────────────────────────────────────────────────────
  // CERTIFIED PATH (gap H1 unification): own-полувагон class-1 нерудные with N8 tables routes
  // through the SAME staged-kopeck chain (computeWagonN8) that reproduces the golden квитанции
  // (1 067 770 / 187 344) and the R-Тариф oracle (82 816 ₽ без НДС → 101 035.52 ₽ с НДС 22%)
  // EXACTLY to the kopeck. That chain already bakes in K1 (Табл.2), K3 (0,77×0,909), the
  // own-полувагон 0,9346 (п.18.1.1), K4 (Табл.5 п.16.7 max-of-two), ×1,01 доп.индексация and the
  // ×0,9595 innovative льгота — so on this path we DO NOT re-apply own_gondola in the iStack
  // (else 0,9346 would double-count). Per-step kopeck rounding (gap M1) is honored inside
  // computeWagonN8 (round01 each step), not deferred to one final ruble round.
  //
  // UNIVERSAL PATH (every other contour): the coefficient-stack derivation, unchanged.
  const onCertifiedPath = isCertifiedN8Path(input, tariffClass, data);
  let iComponent: number;
  if (onCertifiedPath) {
    const certified = certifiedN8LoadedComponent(input, data.n8 as N8TariffData, distanceKm);
    if (certified === null) {
      // The certified chain refused (e.g. no N8 grid cell for this weight×distance) — never
      // fabricate: fall back to a red result so the operator enters the price manually.
      warnings.push(
        "Сертифицированная схема N8 (собств. полувагон, класс 1, нерудные) не дала ставку " +
          `для ${Math.round(input.actualWeightTons)}т на ${distanceKm} км — цену занесите вручную.`,
      );
      return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
    }
    iComponent = certified;
  } else {
    // И component = И(scheme,L) × [chargeable if per-tonne] × K1 × K3 × K4 × innovativeCoef
    // Per-tonne schemes (И14-И18, N19-N24 — nalivnye цистерны): rate is ₽/т, multiply by tons.
    // Per-wagon schemes (N8, И1, etc.): rate is ₽/wagon, no tonnage factor here.
    // (K5 does not exist in ТР-1 2026 — absorbed into K3 Табл.4)
    const iBaseRate = iBelt.perTonne ? iBelt.rateRub * chargeable : iBelt.rateRub;
    // ── ×1.04 class-2/3 surcharge + ×1.01 доп.индексация (CLASS 2/3 universal path) ──
    // Both apply ONLY to class-2/3 here. Rationale (do NOT regress the certified contour):
    //  • The certified own-ПВ class-1 нерудные path (computeWagonN8) already bakes ×1.01 in as
    //    its final ×C_DOP_INDEX, and class-1 carries NO ×1.04 class surcharge at all.
    //  • The universal class-1 нерудные oracles (goldenUniversalOracle, мрамор 82816 / 187344 /
    //    1067770) are calibrated with K4=1.01 @ >2000 km standing in for доп.индексация — adding
    //    a second ×1.01 there double-counts (+1%). So ×1.01 fires only for class 2/3, where the
    //    oracle chain (reference-quotes-batch-0609.json) shows it as an explicit final factor on
    //    top of K4. Order matches the verbatim chain (…→ K1 → commodity → ×1.04 → ×1.01); scalar
    //    multiplication is order-invariant but the constants are named + sequenced for audit.
    // Neither is a fabricated number: both are sourced rule constants (894/25, byte-verified).
    const isClass23 = tariffClass === 2 || tariffClass === 3;
    const classSurcharge = isClass23 ? CLASS_SURCHARGE_2_3 : 1;
    const dopIndex = isClass23 ? DOP_INDEX_FACTOR : 1;
    // п.15.4 PER-STEP kopeck rounding — mirror the certified computeTariffN8 chain
    // (computeTariffN8.ts:460–472 round01 after EACH coefficient multiply) instead of one
    // final round of a single float product. Verified no-op on every batch-0609 own-ПВ/
    // платформа/цистерна oracle (single-float == per-step to the kopeck) but closes the
    // literal п.15.4 "в рубль" gap so the universal fallback rounds exactly as R-Тариф does.
    // Order matches the verbatim chain (… → K1 → commodity → K4 → innov → ×1.04 → ×1.01);
    // scalar multiplication is order-invariant but the steps are sequenced for audit.
    let iAcc = round01(iBaseRate);
    iAcc = round01(iAcc * k1.k1);
    iAcc = round01(iAcc * k3);
    iAcc = round01(iAcc * k4Value);
    iAcc = round01(iAcc * innovativeCoef);
    iAcc = round01(iAcc * classSurcharge);
    iAcc = round01(iAcc * dopIndex);
    iComponent = iAcc;
    // CONFIDENCE MODEL: the universal coefficient-stack path is green ONLY for the
    // oracle-validated own-полувагон class-1 нерудные contour (the same contour the
    // certified N8 chain reproduces to the ruble — both квитанции + R-Тариф). EVERY other
    // (wagon×class×commodity) combo — class 2/3, non-полувагон own wagons, cistern/reefer,
    // any container — is computed per the official ТР-1 tables but NOT validated against a
    // real квитанция, so it is YELLOW at best and must NEVER be reported green until the
    // operator certifies it. Containers are handled in their own branch above (always yellow).
    if (!isValidatedOwnGondolaClass1Nerud(input, tariffClass)) {
      confidenceCeiling = capConfidence(confidenceCeiling, "yellow");
    }
  }

  // ── В component (RZD-owned wagons only) ───────────────────────────────────────
  let vComponent = 0;
  if (input.ownership === "rzd") {
    // В-schemes are distance-only (no weight dimension).
    const vBelt = snapToBelt(data.rateBelts, schemes.vSchemeCode, distanceKm, null);
    if (!vBelt.found) {
      if (vBelt.warning) warnings.push(vBelt.warning);
      return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
    }
    vComponent = vBelt.rateRub;
  }

  // ── порожний (own wagons only) ────────────────────────────────────────────────
  let emptyRun = 0;
  if (input.ownership === "own") {
    const er = snapEmptyRun(
      data.emptyRunBelts,
      input.axles,
      distanceKm,
      schemes.emptySchemeCode,
    );
    if (!er.found) {
      if (er.warning) warnings.push(er.warning);
      return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
    }
    emptyRun = er.rateRub;
  }

  // ── coefficient stack ────────────────────────────────────────────────────────
  // The порожний ×1.1 multiplier applies ONLY to the empty-run leg, NOT to the И
  // component (§3.1: «only the price layer differs (×1.1)»). We therefore compute
  // two separate stacks:
  //   iStack   — контейнер / Минстрой / class coefs (applies to iComponent + vComponent)
  //   emptyStack — порожний coef only (applies to emptyRun)
  const isContainer = input.wagonType === CONTAINER_WAGON_CODE;
  const isPorozhny = input.ownership === "own" || input.emptyReturn === true;

  // On the certified N8 path the own-полувагон 0,9346 (п.18.1.1) is ALREADY inside the
  // computeWagonN8 chain — OMIT ownership/wagonType here so the own_gondola coef does not
  // fire and double-count. Off the certified path the universal own_gondola coef applies.
  const iCtx: CoefContext = {
    onDate: input.asOfDate,
    freightClass: tariffClass,
    isContainer,
    isPorozhny: false, // порожний coef excluded from iStack
    ...(onCertifiedPath
      ? {}
      : { ownership: input.ownership, wagonType: input.wagonType }),
  };
  const iStack = coefficientStack(data.coefficients, iCtx);

  const emptyStack = isPorozhny
    ? coefficientStack(data.coefficients, {
        onDate: input.asOfDate,
        freightClass: tariffClass,
        isContainer: false,
        isPorozhny: true,
      })
    : 1;

  const surcharges = 0; // pass-through доп.сборы (entered, not computed) — §2.6

  // ── Табл.N3 directional coefficient (направленческий множитель п.16.9) ─────────
  // An ADDITIONAL multiplier on the tariff plate for hauls that fall under an enumerated
  // direction (Калининград / погранстанции / лесные маршруты). For every ordinary inter-RF
  // haul resolveDirectionalK3 returns ×1.0 (applies:false) — a documented no-op that keeps ALL
  // golden oracles byte-identical. It only fires when a future route classifier flags a
  // direction; section-3 погранстанции values are seed-red and are NEVER applied (only flagged).
  const directional = resolveDirectionalK3(data.directionalRows ?? [], {
    distanceKm,
    tariffClass,
  });
  if (directional.warning) warnings.push(directional.warning);
  if (directional.applies) {
    warnings.push(
      `Применён направленческий коэффициент Табл.N3 ×${directional.coefficient} ` +
        `(confidence ${directional.confidence}) — проверьте оператором.`,
    );
    if (directional.confidence !== "green") {
      confidenceCeiling = capConfidence(confidenceCeiling, "yellow");
    }
  }

  // Груженая составляющая (провозная плата без порожнего): (И+В)×iStack×Табл.N3 — the own_gondola
  // род coef lives in iStack on the universal path, so this carries it. Порожний пробег is a
  // SEPARATELY-billed charge, NOT part of провозной платы — every R-Тариф oracle (82816, and
  // batch-0609 own-ПВ/платформа) reproduces this loaded leg, never loaded+порожний. directional
  // is ×1.0 for every current contour (applies:false) so this stays byte-identical to the oracles.
  const loadedRaw = (iComponent + vComponent) * iStack * directional.coefficient;
  const preIndexRaw = loadedRaw + emptyRun * emptyStack + surcharges;
  const preIndex = round2(preIndexRaw);

  // ── indexation compounding ────────────────────────────────────────────────────
  const factor = indexFactor(data.indexations, input.asOfDate, tariffClass);
  // п.15.5: провозная плата за повагонную/групповую отправку округляется до ЦЕЛОГО РУБЛЯ.
  // loadedNoVat is that R-Тариф «провозная плата без НДС» (груженая, без порожнего) — ruble-
  // rounded to match every batch-0609 oracle (e.g. C3-a 265326.92 → 265327) and the inventory
  // path (computeInventory rounds to the ruble too).
  const loadedNoVat = Math.round(loadedRaw * factor);
  const postIndex = round2(preIndexRaw * factor);

  // ── НДС applied LAST ──────────────────────────────────────────────────────────
  const total = round2(postIndex * (1 + vatRate / 100));

  // ── confidence: yellow when non-fatal warnings were accumulated, then capped ──
  // Fatal paths return 'red' via redResult() above. The base level is green only when no
  // warnings accrued; `confidenceCeiling` then enforces the CONFIDENCE MODEL: only the
  // certified N8 own-ПВ class-1 нерудные contour (ceiling stays green) can ever report green.
  // Every universal contour (class 2/3, non-полувагон, cistern/reefer, computable:false род)
  // capped the ceiling to yellow above → it is yellow-computable, never green.
  const baseConfidence: Confidence = warnings.length > 0 ? "yellow" : "green";
  const confidence: Confidence = capConfidence(baseConfidence, confidenceCeiling);

  return {
    distanceKm,
    iComponent: round2(iComponent),
    vComponent: round2(vComponent),
    emptyRun: round2(emptyRun),
    surcharges,
    preIndex,
    loadedNoVat,
    indexFactor: factor,
    postIndex,
    vatRate,
    total,
    tariffClass,
    chargeableTons: chargeable,
    source: "computed",
    confidence,
    warnings,
  };
}
