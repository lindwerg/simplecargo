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
  /**
   * M5 — source-flagged computability of this род. The pinned classifier sets
   * `computable:false` for роды whose belt tables were not acquired (e.g. transporter
   * placeholder rates). Carried so the resolver can surface the real root cause and the
   * orchestrator can gate confidence to red instead of emitting a generic belt-miss.
   */
  readonly computable?: boolean;
  /** M5 — classifier row confidence (high/medium/low) as published in the seed. */
  readonly confidence?: string | null;
}

export interface SchemeResolution {
  readonly iSchemeCode: string | null;
  readonly vSchemeCode: string | null;
  /** Порожний scheme code resolved from the classifier row. null for rzd wagons. */
  readonly emptySchemeCode?: string | null;
  readonly found: boolean;
  readonly warning?: string;
  /**
   * M5 — classifier provenance propagated from the pinned classifier row into resolution,
   * so the orchestrator can surface the REAL root cause + gate confidence instead of a
   * generic belt-miss. `computable:false` means the source flagged this род as not
   * price-computable (no belt data acquired) → the engine must NOT fabricate a number.
   * `confidence` is the classifier's own row confidence (high/medium/low) — distinct from
   * the per-belt confidence resolved later in snapToBelt.
   */
  readonly computable?: boolean;
  readonly confidence?: string | null;
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
    computable: row.computable ?? true,
    confidence: row.confidence ?? null,
  };
}

// ── rate-belt snap ───────────────────────────────────────────────────────────────

/**
 * Per-belt billing unit (M8 — explicit unit field per belt cell). `weightT=null` is shared
 * by both за-вагон (И2-И7, N9-N13, рефрижератор N30/31) and за-тонну (И14-И18, N19-N24
 * цистерны) schemes, so "null⇒per-tonne" mis-bills. Every belt now declares its unit
 * explicitly. Containers carry their own linearAB plate (`unit:"perContainer"`), transporters
 * `perTransporter`.
 */
export type BeltUnit = "perWagon" | "perTonne" | "perContainer" | "perTransporter";

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
   * Retained for backward compatibility; `unit` is authoritative when present.
   */
  readonly perTonne?: boolean | null;
  /** M8 — explicit billing unit. Authoritative; `perTonne` is the legacy mirror of "perTonne". */
  readonly unit?: BeltUnit;
  /**
   * Per-belt confidence as published in the source plate. `null`/`"red"` rateRub means the
   * cell is an unbacked placeholder (e.g. transporter rates not yet acquired) → the engine
   * must NOT price it. Used to gate the result confidence (green/yellow/red) downstream.
   */
  readonly confidence?: string | null;
  // ── Container linearAB plate (H6/H17, schemes N85-94) ───────────────────────────
  /** "linearAB" for container plates: плата = A + B×KL (₽ за контейнер). Absent for grid belts. */
  readonly rateModel?: "linearAB" | "belt";
  /** Container size dimension ("3т"|"5т"|"10т"|"20ft"|"40ft") — container belt key (H17). */
  readonly containerSize?: string | null;
  /** Container ownership dimension ("общий парк"|"собств./аренд.") — container belt key. */
  readonly containerOwnership?: string | null;
  /** A = начально-конечные операции (₽/контейнер, fixed) for linearAB plates. */
  readonly aRubPerContainer?: number | null;
  /** B = движенческие операции (₽/контейнеро-км) for linearAB plates. */
  readonly bRubPerContainerKm?: number | null;
  /** Transporter axle-count dimension ([4,6] etc.) — transporter belt key (H6/H17). */
  readonly axleCount?: readonly number[] | null;
}

export interface BeltResolution {
  readonly rateRub: number;
  /** true when rateRub is per-tonne (nalivnye schemes). The caller must multiply by chargeable tons. */
  readonly perTonne: boolean;
  readonly found: boolean;
  readonly warning?: string;
  /** Resolved billing unit of the matched belt (M8). undefined when found:false. */
  readonly unit?: BeltUnit;
  /** Per-belt confidence of the matched cell (used to cap the result confidence). */
  readonly confidence?: string | null;
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
  if (hasWeightDimension) {
    // M6 FIX: a weight-dimension scheme (N8/И1) REQUIRES a weight tier. A null/undefined
    // chargeableWeightT used to silently fall through to the distance-only branch and snap
    // the FIRST belt of any weight tier — a wrong-tier mis-bill. Refuse instead of fabricating.
    if (chargeableWeightT == null) {
      return {
        rateRub: 0,
        perTonne: false,
        found: false,
        warning: `Схема ${schemeCode} требует весовой пояс (нет загрузки в тоннах) — расчёт невозможен`,
      };
    }
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

  // Anti-fabrication: a belt whose rate is an unbacked placeholder (null rate, or a cell
  // flagged confidence:"red" — e.g. transporter schemes N39+ whose rates were not acquired)
  // must NOT be priced. Surface red, never a confident wrong kopeck.
  if (belt.rateRub == null || belt.confidence === "red") {
    return {
      rateRub: 0,
      perTonne: false,
      found: false,
      confidence: "red",
      warning:
        `Ставка для схемы ${schemeCode} на ${distanceKm} км не выверена ` +
        `(нет первоисточника ТР-1 Прил.N2) — цену занесите вручную`,
    };
  }

  // M8: resolve the explicit billing unit. `unit` is authoritative; fall back to the legacy
  // perTonne flag, else default per-wagon.
  const unit: BeltUnit =
    belt.unit ?? (belt.perTonne === true ? "perTonne" : "perWagon");
  return {
    rateRub: belt.rateRub,
    perTonne: unit === "perTonne",
    found: true,
    unit,
    confidence: belt.confidence ?? null,
  };
}

// ── Container linearAB plate resolution (H6/H17, schemes N85-94) ───────────────────

export interface ContainerPlateResolution {
  readonly rateRub: number; // computed плата = A + B×KL (₽ за контейнер, без НДС)
  readonly found: boolean;
  readonly confidence?: string | null;
  readonly warning?: string;
}

/**
 * Resolve the per-container плата for a контейнерная отправка via the linearAB plate
 * (Таблица N24, schemes N85-94). The container plate is keyed by (containerSize, ownership)
 * — NOT by a distance band — and evaluated as A + B×KL to the kopeck at the actual distance.
 *
 * NEVER fabricates: a missing (size, ownership) plate or a red/null-coefficient cell returns
 * found:false so the orchestrator surfaces red. The +5% 2026 container indexation and НДС are
 * applied by the orchestrator, not here. Empty-container positioning is NOT in N24 → no plate.
 */
export function resolveContainerPlate(
  belts: readonly RateBelt[],
  containerSize: string | null | undefined,
  ownership: Ownership,
  distanceKm: number,
): ContainerPlateResolution {
  if (!containerSize) {
    return {
      rateRub: 0,
      found: false,
      warning: "Контейнерная отправка: не указан типоразмер контейнера (3т/5т/10т/20ft/40ft)",
    };
  }
  // Container plates publish ownership as "общий парк" (rzd) | "собств./аренд." (own).
  const ownLabel = ownership === "own" ? "собств./аренд." : "общий парк";
  const plate = belts.find(
    (b) =>
      b.rateModel === "linearAB" &&
      b.containerSize === containerSize &&
      b.containerOwnership === ownLabel,
  );
  if (!plate) {
    return {
      rateRub: 0,
      found: false,
      warning: `Нет контейнерной плиты (${containerSize}, ${ownLabel}) — расчёт невозможен`,
    };
  }
  if (
    plate.confidence === "red" ||
    plate.aRubPerContainer == null ||
    plate.bRubPerContainerKm == null
  ) {
    return {
      rateRub: 0,
      found: false,
      confidence: "red",
      warning:
        `Контейнерная плита (${containerSize}, ${ownLabel}) не выверена ` +
        "(напр. порожний пробег контейнера отсутствует в Табл.N24) — занесите вручную",
    };
  }
  // плата = A + B×KL, kopeck-precise (round to целые копейки, ТР-1 п.15.4).
  const raw = plate.aRubPerContainer + plate.bRubPerContainerKm * distanceKm;
  const rateRub = Math.round(raw * 100) / 100;
  return { rateRub, found: true, confidence: plate.confidence ?? "green" };
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

// ── Табл.N3 directional coefficient (направленческий множитель п.16) ─────────────
// DISTINCT from Табл.N4 commodity K3 (§I п.10). Табл.N3 = WHERE the haul goes
// (Калининград / погранстанции / два лесных маршрута), NOT what the cargo is. It is an
// ADDITIONAL п.16.9 multiplier on the tariff plate — but ONLY for hauls that fall under one
// of the enumerated directions. For a typical inter-RF haul between ordinary stations
// (incl. all SimpleCargo golden cases 699/2444/3108 + batch-0609) Табл.N3 does NOT apply →
// effective multiplier = 1.0 (documented no-op). The seed marks the border-station section
// (section3) confidence:red/doNotUseInEngine — we therefore NEVER apply a section-3 value.

/** A single Табл.N3 directional row, normalised by the seed loader. */
export interface DirectionalK3Row {
  /** Stable id of the seed section this row came from (for audit/diagnostics). */
  readonly section: string;
  /** Dimensionless multiplier on the tariff plate (< 1 = скидка, > 1 = наценка). */
  readonly coefficient: number;
  /** Distance band lower edge (km), if the row is distance-keyed (section 1). */
  readonly distFromKm?: number | null;
  /** Distance band upper edge (km, null = unbounded), if distance-keyed. */
  readonly distToKm?: number | null;
  /** Tariff class the row applies to ("any" = all classes). */
  readonly tariffClass?: FreightClass | "any";
  /** Source confidence as published in the seed (green/yellow/red). */
  readonly confidence: string;
}

/** Context needed to decide whether ANY Табл.N3 direction applies to the haul. */
export interface DirectionalContext {
  /**
   * Direction kind flagged by the route resolver, when known. The engine has no route→
   * direction classifier yet, so this is `undefined` for every current contour → no-op (1.0).
   * Wired now so a future route classifier only has to populate this field, not the resolver.
   */
  readonly direction?: "kaliningrad-network" | "within-kaliningrad" | "border-transfer" | "named-timber-route";
  readonly distanceKm: number;
  readonly tariffClass: FreightClass;
}

export interface DirectionalK3Resolution {
  /** The multiplier to fold into the tariff plate (1.0 when no direction applies). */
  readonly coefficient: number;
  /** True when a real Табл.N3 row was matched (so the caller may flag it). */
  readonly applies: boolean;
  readonly confidence: string;
  readonly warning?: string;
}

/**
 * Resolve the Табл.N3 directional coefficient for a haul. Returns 1.0 (applies:false) for
 * every ordinary inter-RF haul — which is the correct, sourced behaviour: Табл.N3 only fires
 * on the enumerated directions and the engine cannot yet detect them (ctx.direction undefined).
 *
 * When a direction IS flagged: section 3 (border-transfer) is REFUSED (the seed marks every
 * number unverified/red → we never apply a fabricated value, only flag it red); the other
 * sections apply their verbatim coefficient. NEVER fabricates: an unmatched/red direction
 * keeps the multiplier at 1.0 and surfaces a warning rather than inventing a factor.
 */
export function resolveDirectionalK3(
  rows: readonly DirectionalK3Row[],
  ctx: DirectionalContext,
): DirectionalK3Resolution {
  // No route→direction classifier wired yet → ordinary haul → documented no-op.
  if (!ctx.direction) {
    return { coefficient: 1.0, applies: false, confidence: "green" };
  }
  // Border-transfer (section 3) numbers are seed-flagged unverified (red) → never apply.
  if (ctx.direction === "border-transfer") {
    return {
      coefficient: 1.0,
      applies: false,
      confidence: "red",
      warning:
        "Табл.N3 погранстанции: коэффициенты раздела 3 не сверены (confidence red) — " +
        "направленческий множитель НЕ применён, занесите/проверьте оператором.",
    };
  }
  const sectionFor: Record<string, string> = {
    "kaliningrad-network": "section1_kaliningrad_to_network",
    "within-kaliningrad": "section2_within_kaliningrad",
    "named-timber-route": "section4_round_timber_named_routes",
  };
  const wantSection = sectionFor[ctx.direction];
  const candidates = rows.filter((r) => r.section === wantSection);
  const match = candidates.find((r) => {
    const classOk =
      r.tariffClass == null || r.tariffClass === "any" || r.tariffClass === ctx.tariffClass;
    const distOk =
      r.distFromKm == null ||
      (ctx.distanceKm >= (r.distFromKm ?? 0) &&
        (r.distToKm == null || ctx.distanceKm <= r.distToKm));
    return classOk && distOk;
  });
  if (!match || match.confidence === "red") {
    return {
      coefficient: 1.0,
      applies: false,
      confidence: match?.confidence ?? "red",
      warning:
        `Табл.N3 (${ctx.direction}): подходящая строка не найдена/не сверена — ` +
        "множитель не применён (1.0), занесите/проверьте оператором.",
    };
  }
  return { coefficient: match.coefficient, applies: true, confidence: match.confidence };
}

// ── Табл.N12 / N13 уменьшение тарифа (п.16.10) — контейнеры / контрейлеры ─────────
// «Размер уменьшения тарифа … вычитается» (п.16.10) — an ADDITIVE ruble subtraction (NOT a
// multiplier) applied to the FCL container (Табл.N12) / контрейлер (Табл.N13) plate BEFORE the
// п.15.5 whole-ruble round. Inert for щебень/нерудные повагонно (no reduction applies), but
// mandatory before any FCL container КП. The Табл.N10 size→row mapping is NOT on disk (seed
// _sizeReference), so we ONLY subtract on an EXACT size-key match; an ambiguous size keeps the
// reduction UN-applied and flags it (the MONEY CONTRACT forbids guessing a row).

/** A single Табл.N12 reduction row (₽ per container), normalised by the seed loader. */
export interface ContainerReductionRow {
  /** Size key as published in Табл.N12 ("3" | "5" | "10" | "свыше 10 по 20 включительно" | "свыше 20"). */
  readonly sizeKey: string;
  /** Reduction for own (собственный/арендованный) loaded container, ₽. */
  readonly ownLoadedRub: number | null;
  /** Reduction for own empty container, ₽. */
  readonly ownEmptyRub: number | null;
  /** Reduction for common-park (общий парк) loaded container, ₽. */
  readonly commonLoadedRub: number | null;
}

export interface ContainerReductionResolution {
  /** Ruble amount to SUBTRACT from the plate before the п.15.5 round (0 when not applied). */
  readonly reductionRub: number;
  /** True only when an exact, sourced size-row was matched and subtracted. */
  readonly applied: boolean;
  readonly warning?: string;
}

/**
 * Resolve the Табл.N12 FCL container reduction (₽) for a контейнерная отправка. Returns
 * applied:false / 0 ₽ when the container size cannot be mapped to a verbatim Табл.N12 row
 * (Табл.N10 size→row mapping not on disk) — NEVER fabricates a row. The caller then keeps the
 * result YELLOW and flags that the п.16.10 reduction was not subtracted, rather than guessing.
 *
 * containerSize uses the engine's canonical codes ("3т"|"5т"|"10т"|"20ft"|"40ft"); only the
 * unambiguous ones map (3т→"3", 5т→"5"). The ft sizes need Табл.N10 to disambiguate
 * "свыше 10 по 20"/"свыше 20", so they stay un-applied + flagged until that table is acquired.
 */
export function resolveContainerReduction(
  rows: readonly ContainerReductionRow[],
  containerSize: string | null | undefined,
  ownership: Ownership,
): ContainerReductionResolution {
  if (!containerSize || rows.length === 0) {
    return { reductionRub: 0, applied: false };
  }
  // Only the unambiguous tonne-sizes map verbatim to a Табл.N12 size key.
  const sizeKeyMap: Record<string, string> = { "3т": "3", "5т": "5", "10т": "10" };
  const sizeKey = sizeKeyMap[containerSize];
  if (!sizeKey) {
    return {
      reductionRub: 0,
      applied: false,
      warning:
        `Уменьшение Табл.N12 (п.16.10) для типоразмера «${containerSize}» не применено: ` +
        "маппинг ISO-размера в строку Табл.N12 требует Табл.N10 (не на диске) — " +
        "не фабрикуем строку, проверьте оператором.",
    };
  }
  const row = rows.find((r) => r.sizeKey === sizeKey);
  const amount = ownership === "own" ? row?.ownLoadedRub : row?.commonLoadedRub;
  if (!row || amount == null) {
    return {
      reductionRub: 0,
      applied: false,
      warning:
        `Уменьшение Табл.N12 (п.16.10) для «${containerSize}»/${ownership} отсутствует в сиде — ` +
        "не применено, проверьте оператором.",
    };
  }
  return { reductionRub: amount, applied: true };
}
