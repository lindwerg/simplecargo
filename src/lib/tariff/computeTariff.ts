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
  resolveInnovativeCoef,
  resolveK3,
  resolveK4,
  resolveK4Full,
  resolveSchemes,
  snapEmptyRun,
  snapToBelt,
  type EmptyRunBelt,
  type InnovativeModel,
  type K3Row,
  type K4FullRow,
  type K4Row,
  type RateBelt,
  type WagonSchemeRow,
} from "./schemeResolve";
import type { Confidence, FreightClass, TariffBreakdown, TariffInput } from "./schema";

const VAT_DOMESTIC = 22; // % — 2026 domestic НДС
const VAT_EXPORT = 0; // % — export/international
const CONTAINER_WAGON_CODE = "КН";

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
}

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
  const chargeable = chargeableTons(input.actualWeightTons, cls.mvn);

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

  // ── И base rate (snap L to belt, weight-aware for N8/И1 2D grids) ──────────────
  const iBelt = snapToBelt(data.rateBelts, schemes.iSchemeCode, distanceKm, chargeable);
  if (!iBelt.found) {
    if (iBelt.warning) warnings.push(iBelt.warning);
    return redResult(distanceKm, tariffClass, chargeable, vatRate, warnings);
  }

  // ── K1 (class, distance) max-of-two ───────────────────────────────────────────
  const k1 = computeK1(data.classBelts, data.corrBelts, tariffClass, distanceKm);
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

  // ── Innovative model coefficient (replaces fitted 0.9595 constant) ────────────
  const innovativeCoef = resolveInnovativeCoef(data.innovativeModels, input.wagonModel);

  // И component = И(scheme,L) × [chargeable if per-tonne] × K1 × K3 × K4 × innovativeCoef
  // Per-tonne schemes (И14-И18, N19-N24 — nalivnye цистерны): rate is ₽/т, multiply by tons.
  // Per-wagon schemes (N8, И1, etc.): rate is ₽/wagon, no tonnage factor here.
  // (K5 does not exist in ТР-1 2026 — absorbed into K3 Табл.4)
  const iBaseRate = iBelt.perTonne ? iBelt.rateRub * chargeable : iBelt.rateRub;
  const iComponent = iBaseRate * k1.k1 * k3 * k4Value * innovativeCoef;

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

  const iCtx: CoefContext = {
    onDate: input.asOfDate,
    freightClass: tariffClass,
    isContainer,
    isPorozhny: false, // порожний coef excluded from iStack
    ownership: input.ownership,
    wagonType: input.wagonType,
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
  const preIndexRaw = (iComponent + vComponent) * iStack + emptyRun * emptyStack + surcharges;
  const preIndex = round2(preIndexRaw);

  // ── indexation compounding ────────────────────────────────────────────────────
  const factor = indexFactor(data.indexations, input.asOfDate, tariffClass);
  const postIndex = round2(preIndexRaw * factor);

  // ── НДС applied LAST ──────────────────────────────────────────────────────────
  const total = round2(postIndex * (1 + vatRate / 100));

  // ── confidence: yellow when non-fatal warnings were accumulated ───────────────
  // Fatal paths return 'red' via redResult() above. Green = no warnings at all.
  const confidence: Confidence = warnings.length > 0 ? "yellow" : "green";

  return {
    distanceKm,
    iComponent: round2(iComponent),
    vComponent: round2(vComponent),
    emptyRun: round2(emptyRun),
    surcharges,
    preIndex,
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
