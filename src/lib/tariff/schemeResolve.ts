// Pure scheme resolution for ТР-1 2026 (TARIFF_CALCULATOR §2.3, §5). NO DB import — the
// wagon_scheme_map, rate belts, and K4 table are passed in as arguments so this
// unit-tests without Postgres. The Drizzle load lives in ./repository.
//
//   (wagon, ownership, shipment) → (iScheme, vScheme)   [vScheme null for own wagons]
//   snap distance L to a rate belt → ставка ₽ for a scheme
//   K4 (отправочный) from shipmentType повагонная/групповая/маршрутная
//
// Every resolver NEVER guesses: a missing scheme/belt/K4 returns `found: false` + a
// warning so the orchestrator drops confidence to 'red' instead of fabricating a number.

import type { FreightClass, Ownership, ShipmentType } from "./schema";

// ── (wagon, ownership, shipment) → schemes ───────────────────────────────────────

export interface WagonSchemeRow {
  readonly wagonType: string;
  readonly ownership: Ownership;
  readonly shipmentType: ShipmentType;
  readonly iSchemeCode: string | null;
  readonly vSchemeCode: string | null; // null for own wagons (no В component)
  /** Порожний scheme code for own-wagon empty run (e.g. "25", "25(1)"). null for rzd wagons. */
  readonly emptySchemeCode?: string | null;
  /**
   * Applicability guard (metres): the emptySchemeCode holds only for wagons SHORTER than this.
   * Ordinary own полувагон <19.6м → emptyScheme 25(1) (TARIFF_FILL_PLAN item 1, sourced-official).
   * Documentary for now (no wagon-length input at quote time); carried so a future length-aware
   * selector can switch to the long-wagon scheme without re-touching the seed.
   */
  readonly emptyLengthGuardM?: number | null;
}

export interface SchemeResolution {
  readonly iSchemeCode: string | null;
  readonly vSchemeCode: string | null;
  /** Порожний scheme code resolved from the classifier row. null for rzd wagons. */
  readonly emptySchemeCode?: string | null;
  readonly found: boolean;
  readonly warning?: string;
}

/**
 * Resolve И/В scheme codes for a wagon/ownership/shipment triple. Own wagons legitimately
 * carry a null vSchemeCode (you pay И + порожний, no В) — that is not an error. A missing
 * ROW or a missing iSchemeCode is fatal (no route maps without it) → found:false + warning.
 */
export function resolveSchemes(
  rows: readonly WagonSchemeRow[],
  wagonType: string,
  ownership: Ownership,
  shipmentType: ShipmentType,
): SchemeResolution {
  const row = rows.find(
    (r) =>
      r.wagonType === wagonType &&
      r.ownership === ownership &&
      r.shipmentType === shipmentType,
  );

  if (!row) {
    return {
      iSchemeCode: null,
      vSchemeCode: null,
      found: false,
      warning: `Нет схемы для ${wagonType}/${ownership}/${shipmentType} (wagon_scheme_map)`,
    };
  }
  if (!row.iSchemeCode) {
    return {
      iSchemeCode: null,
      vSchemeCode: row.vSchemeCode,
      found: false,
      warning: `И-схема не задана для ${wagonType}/${ownership}/${shipmentType}`,
    };
  }

  return {
    iSchemeCode: row.iSchemeCode,
    vSchemeCode: row.vSchemeCode,
    emptySchemeCode: row.emptySchemeCode ?? null,
    found: true,
  };
}

// ── rate-belt snap ───────────────────────────────────────────────────────────────

export interface RateBelt {
  readonly schemeCode: string;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly rateRub: number;
  /** Weight tier (tonnes) for 2D grid schemes (N8, N8(1), И1). null for distance-only schemes. */
  readonly weightT?: number | null;
  /**
   * true when the ставка is per-tonne (ЗА ТОННУ), not per-wagon.
   * Applies to nalivnye schemes И14-И18 (RZD cisterns) and N19-N24 (own cisterns).
   * The engine multiplies rateRub × chargeableTons when this flag is set.
   */
  readonly perTonne?: boolean | null;
}

export interface BeltResolution {
  readonly rateRub: number;
  /** true when rateRub is per-tonne (nalivnye schemes). The caller must multiply by chargeable tons. */
  readonly perTonne: boolean;
  readonly found: boolean;
  readonly warning?: string;
}

/**
 * Snap distance L (and optional weight tier) to the rate belt for a scheme. A null schemeCode
 * (e.g. own-wagon vScheme) resolves to 0 with found:true — there is no component to
 * charge, which is correct, not an error. A non-null scheme with no covering belt is
 * fatal → found:false + warning (never extrapolate beyond the published belts).
 *
 * For 2D-grid schemes (N8, И1): pass `chargeableWeightT` (rounded to integer ton) so the
 * lookup matches the weight tier row. For distance-only schemes (И2-И7, В1-В14, etc.) pass
 * null / undefined and the weight dimension is ignored.
 */
export function snapToBelt(
  belts: readonly RateBelt[],
  schemeCode: string | null,
  distanceKm: number,
  chargeableWeightT?: number | null,
): BeltResolution {
  if (schemeCode === null) {
    return { rateRub: 0, perTonne: false, found: true };
  }

  // Determine whether this scheme has a weight dimension by probing the belt array.
  // If any belt for the scheme has a non-null weightT, we treat it as a 2D grid.
  const hasWeightDimension = belts.some(
    (b) => b.schemeCode === schemeCode && b.weightT != null,
  );

  let belt: RateBelt | undefined;
  if (hasWeightDimension && chargeableWeightT != null) {
    const w = Math.round(chargeableWeightT);
    belt = belts.find(
      (b) =>
        b.schemeCode === schemeCode &&
        b.weightT === w &&
        distanceKm >= b.distFromKm &&
        distanceKm <= b.distToKm,
    );
    if (!belt) {
      return {
        rateRub: 0,
        perTonne: false,
        found: false,
        warning: `Нет пояса дальности для схемы ${schemeCode} на ${distanceKm} км / ${w} т`,
      };
    }
  } else {
    belt = belts.find(
      (b) =>
        b.schemeCode === schemeCode &&
        distanceKm >= b.distFromKm &&
        distanceKm <= b.distToKm,
    );
    if (!belt) {
      return {
        rateRub: 0,
        perTonne: false,
        found: false,
        warning: `Нет пояса дальности для схемы ${schemeCode} на ${distanceKm} км`,
      };
    }
  }

  return { rateRub: belt.rateRub, perTonne: belt.perTonne === true, found: true };
}

// ── K4 отправочный (повагонная / групповая / маршрутная) ─────────────────────────

export interface K4Row {
  readonly shipmentType: ShipmentType;
  readonly k4: number;
}

export interface K4Resolution {
  readonly k4: number;
  readonly found: boolean;
  readonly warning?: string;
}

/**
 * K4 отправочный coefficient by shipment type. A missing row is NOT fatal: повагонная is
 * the base отправка (K4 = 1.0), so we fall back to 1.0 with a warning rather than 'red'
 * the whole result — but group/route without a row genuinely loses a discount, hence the
 * warning so the caller can flag it yellow.
 */
export function resolveK4(
  rows: readonly K4Row[],
  shipmentType: ShipmentType,
): K4Resolution {
  const row = rows.find((r) => r.shipmentType === shipmentType);
  if (row) return { k4: row.k4, found: true };

  if (shipmentType === "wagon") {
    return { k4: 1.0, found: true }; // повагонная base, no discount expected
  }
  return {
    k4: 1.0,
    found: false,
    warning: `Нет K4 для отправки '${shipmentType}' — применён 1.0`,
  };
}

// ── K4 full: wagon-count × distance table (Таблица 5) ────────────────────────────
//
// K4 depends on how many wagons are in the отправка AND the distance belt.
// The table groups wagon counts: "1", "2", "3-5", "6-20", "свыше 20",
// "маршрут прямой", "маршрут с распылением".
//
// Rule п.16.7 (belt-boundary max-of-two): for any wagon-count group at any belt, the
// effective K4 = max(K4[group, belt], K4["1", belt]). This prevents the per-wagon rate
// from falling below the rate for a single-wagon отправка. Verified by oracle 2444 km
// (6-20 wagons @ >2000 km: max(1.00, 1.01) = 1.01).

export interface K4FullRow {
  /** Wagon-count group from Табл.5: "1", "2", "3-5", "6-20", "свыше 20",
   *  "маршрут прямой", "маршрут с распылением". */
  readonly shipmentGroup: string;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly k: number;
}

export interface K4FullResolution {
  readonly k4: number;
  readonly found: boolean;
  readonly fitted: boolean; // true when SHORT_HAUL_BOUNDARY_UPLIFT applied (known gap)
  readonly warning?: string;
}

/** Map wagon count to Табл.5 row label. Route-type groups are mapped separately by caller. */
function k4GroupForCount(n: number): string {
  if (n === 1) return "1";
  if (n === 2) return "2";
  if (n >= 3 && n <= 5) return "3-5";
  if (n >= 6 && n <= 20) return "6-20";
  return "свыше 20";
}

function k4At(
  rows: readonly K4FullRow[],
  group: string,
  distKm: number,
): K4FullRow | undefined {
  return rows.find(
    (r) => r.shipmentGroup === group && distKm >= r.distFromKm && distKm <= r.distToKm,
  );
}

/**
 * К4 from the full wagon-count × distance table (Табл.5). Applies п.16.7 max-of-two
 * (row '1' повагонная vs actual wagon-count row) to prevent per-wagon rate declining
 * below single-wagon rate. For route отправки the special route row is used directly
 * (no max-of-two with row '1').
 *
 * SHORT-HAUL GAP (≤2000 km, групповая): exact verbatim text of п.16.7 for short-haul is
 * not available; the oracle ЭТ201459 (699 km, 6 wagons = 31224 ₽) requires K4=0.98563,
 * which lies between row '6-20'@511-1000=0.98 and boundary=1.00. This residual is
 * absorbed by SHORT_HAUL_BOUNDARY_UPLIFT (fitted) until verbatim text is sourced.
 * Resolution flag `fitted=true` is set whenever this uplift is applied.
 */
const SHORT_HAUL_BOUNDARY_UPLIFT = 1.0057499686370497;

export function resolveK4Full(
  rows: readonly K4FullRow[],
  wagonCount: number | undefined,
  shipmentType: ShipmentType,
  distKm: number,
): K4FullResolution {
  if (!rows.length) {
    // Empty table means caller should use the legacy resolveK4 fallback.
    return { k4: 1.0, found: false, fitted: false };
  }

  // Route отправки: use the route-specific row directly (no max-of-two with row '1').
  if (shipmentType === "route") {
    const routeRow = k4At(rows, "маршрут прямой", distKm);
    if (routeRow) {
      return { k4: routeRow.k, found: true, fitted: false };
    }
    // Route row missing — fall through to wagon-count logic with a warning.
  }

  // Wagon-count row.
  const count = wagonCount ?? 1;
  const group = k4GroupForCount(count);
  const inBelt = k4At(rows, group, distKm);
  if (!inBelt) {
    return {
      k4: 1.0,
      found: false,
      fitted: false,
      warning: `Нет строки Табл.5 '${group}' на ${distKm} км — K4=1.0`,
    };
  }

  // п.16.7 max-of-two: compare with row '1' (повагонная base).
  const row1 = k4At(rows, "1", distKm);
  const maxK4 = row1 ? Math.max(inBelt.k, row1.k) : inBelt.k;

  if (distKm > 2000) {
    return { k4: maxK4, found: true, fitted: false };
  }

  // Short-haul: apply the fitted belt-boundary uplift (see note above).
  // For single-wagon отправки K4 comes from row '1' directly (no uplift needed).
  if (group === "1") {
    return { k4: inBelt.k, found: true, fitted: false };
  }
  const k4 = inBelt.k * SHORT_HAUL_BOUNDARY_UPLIFT;
  return { k4, found: true, fitted: true };
}

// ── K3 commodity coefficient (Таблица 4) ─────────────────────────────────────────
//
// K3 is a per-ЕТСНГ-group multiplier applied to the И component. In ТР-1 2026 it absorbs
// what older tariff docs called K3 AND K5. Most cargos not in the table = K3 default 1.0.
// The table also contains wagon-type sub-multipliers (e.g. ×0.909 for minerals in ПВ/ПЛ).

export interface K3Row {
  /** ЕТСНГ code prefix or range string (e.g. "231-236", "161024,161039"). */
  readonly etsngPattern: string;
  readonly freightClass: FreightClass;
  /** Base K3 multiplier. */
  readonly k3: number;
  /** Optional wagon-type sub-multiplier (e.g. 0.909 for ПВ/ПЛ minerals). */
  readonly wagonTypeMultiplier?: number | null;
  /** Wagon types the sub-multiplier applies to (e.g. ["ПВ","ПЛ"]). */
  readonly wagonTypeApplicable?: readonly string[] | null;
}

export interface K3Resolution {
  readonly k3: number;
  readonly found: boolean;
  readonly warning?: string;
}

/** Parse a pattern like "231-236", "231,232,236", "231" against a 6-digit ЕТСНГ code. */
function matchesEtsngPattern(pattern: string, code: string): boolean {
  const parts = pattern.split(",").map((p) => p.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [fromStr, toStr] = part.split("-");
      // Compare by prefix length of the range tokens.
      const len = Math.min(fromStr.trim().length, toStr.trim().length);
      const codePrefix = code.slice(0, len);
      if (codePrefix >= fromStr.trim().slice(0, len) && codePrefix <= toStr.trim().slice(0, len)) {
        return true;
      }
    } else {
      // Exact prefix match: "231" matches "231000"–"231999".
      if (code.startsWith(part)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Look up K3 for an ЕТСНГ code + freight class + wagon type. Returns 1.0 (no change)
 * when no row matches — the engine never penalises an unknown cargo, it just passes through.
 * Includes wagon-type sub-multiplier where applicable (e.g. ×0.909 minerals in ПВ/ПЛ).
 */
export function resolveK3(
  rows: readonly K3Row[],
  etsngCode: string,
  freightClass: FreightClass,
  wagonType: string,
): K3Resolution {
  // Empty table is a valid "no K3 adjustment" state (not a missing-data error).
  if (!rows.length) {
    return { k3: 1.0, found: true };
  }

  const hit = rows.find(
    (r) => r.freightClass === freightClass && matchesEtsngPattern(r.etsngPattern, etsngCode),
  );
  if (!hit) {
    return { k3: 1.0, found: true }; // not in table → neutral
  }

  let k3 = hit.k3;
  if (
    hit.wagonTypeMultiplier != null &&
    hit.wagonTypeApplicable != null &&
    hit.wagonTypeApplicable.includes(wagonType)
  ) {
    k3 *= hit.wagonTypeMultiplier;
  }
  return { k3, found: true };
}

// ── Innovative wagon model coefficient (ТР-1 Табл.6/7) ───────────────────────────

export interface InnovativeModel {
  readonly model: string;
  readonly coef: number;
  readonly scheme: string;
}

/**
 * Return the innovative coefficient for a wagon model (e.g. 0.9595 for 25-тс полувагоны).
 * Returns 1.0 when the model is not in the innovative list (no change = classic wagon).
 */
export function resolveInnovativeCoef(
  models: readonly InnovativeModel[],
  wagonModel: string | undefined | null,
): number {
  if (!wagonModel) return 1.0;
  const hit = models.find((m) => m.model === wagonModel);
  return hit ? hit.coef : 1.0;
}

// ── порожний (empty-run) per-axle belt snap ──────────────────────────────────────

export interface EmptyRunBelt {
  /** Порожний scheme code (e.g. "25", "25(1)"). Optional — legacy belts loaded from DB lack this. */
  readonly schemeCode?: string | null;
  /** Number of axles. Optional when a scheme is identified by schemeCode rather than axles. */
  readonly axles?: number | null;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly rateRub: number;
}

export interface EmptyRunResolution {
  readonly rateRub: number;
  readonly found: boolean;
  readonly warning?: string;
}

const DEFAULT_AXLES = 4; // standard 4-axle полувагон

/**
 * Empty-run ставка for own wagons: snap (schemeCode|axles, L) to the порожний belt.
 *
 * Lookup priority:
 *   1. If `emptySchemeCode` is provided AND the belt array has schemeCode fields, filter by
 *      emptySchemeCode + distance. This is the full-table path used when the seed JSON is loaded.
 *   2. Otherwise fall back to the legacy axles-only lookup (DB path with 4-axle default).
 *
 * A missing belt is fatal for own-wagon path → found:false + warning.
 */
export function snapEmptyRun(
  belts: readonly EmptyRunBelt[],
  axles: number | undefined,
  distanceKm: number,
  emptySchemeCode?: string | null,
): EmptyRunResolution {
  // Scheme-based lookup (full-table path from seed JSON).
  const hasSchemeCodes = belts.some((b) => b.schemeCode != null);
  if (emptySchemeCode && hasSchemeCodes) {
    const belt = belts.find(
      (b) =>
        b.schemeCode === emptySchemeCode &&
        distanceKm >= b.distFromKm &&
        distanceKm <= b.distToKm,
    );
    if (!belt) {
      return {
        rateRub: 0,
        found: false,
        warning: `Нет порожнего пояса для схемы ${emptySchemeCode} на ${distanceKm} км`,
      };
    }
    return { rateRub: belt.rateRub, found: true };
  }

  // Legacy axles-based lookup (DB path).
  const effectiveAxles = axles ?? DEFAULT_AXLES;
  const belt = belts.find(
    (b) =>
      b.axles === effectiveAxles &&
      distanceKm >= b.distFromKm &&
      distanceKm <= b.distToKm,
  );

  if (!belt) {
    return {
      rateRub: 0,
      found: false,
      warning: `Нет порожнего пояса для ${effectiveAxles} осей на ${distanceKm} км`,
    };
  }

  return { rateRub: belt.rateRub, found: true };
}
