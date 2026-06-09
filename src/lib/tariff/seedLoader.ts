// Singleton JSON-file loaders for ТР-1 2026 seed tables. Module-level cache ensures
// each file is parsed exactly once per process. The loaders convert the raw JSON shapes
// into the TypeScript interfaces used by the pure engine core (computeTariff.ts).
//
// NEVER used in tests that inject fixtures directly — the pure core is DB/file-free.
// This module is only called by ./repository.ts (the Drizzle + seed I/O layer).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { EtsngEntry } from "./classLookup";
import type {
  ClassCoeffBelt,
} from "./coefficients";
import type {
  ContainerReductionRow,
  DirectionalK3Row,
  EmptyRunBelt,
  InnovativeModel,
  K3Row,
  K4FullRow,
  RateBelt,
  WagonSchemeRow,
} from "./schemeResolve";
import type { FreightClass, Ownership, ShipmentType } from "./schema";

const SEED_DIR = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(resolve(SEED_DIR, filename), "utf8")) as T;
}

// ── Cache entries (set once, then reused) ─────────────────────────────────────

let _schemeMap: readonly WagonSchemeRow[] | null = null;
let _rateBelts: readonly RateBelt[] | null = null;
let _emptyRunBelts: readonly EmptyRunBelt[] | null = null;
let _classBelts: readonly ClassCoeffBelt[] | null = null;
let _k3Rows: readonly K3Row[] | null = null;
let _k4FullRows: readonly K4FullRow[] | null = null;
let _innovativeModels: readonly InnovativeModel[] | null = null;
let _etsngCatalog: readonly EtsngEntry[] | null = null;
let _directionalRows: readonly DirectionalK3Row[] | null = null;
let _containerReductions: readonly ContainerReductionRow[] | null = null;

// ── Internal raw shapes ───────────────────────────────────────────────────────

interface PinnedClassifierRow {
  wagonCode: string;
  ownership: string;
  shipment: string;
  iBeltScheme: string | null;
  vBeltScheme: string | null;
  emptyScheme: string | null;
  /**
   * Optional applicability guard (metres): the emptyScheme above holds only for wagons
   * SHORTER than this. Ordinary own полувагон <19.6м → emptyScheme 25(1) (TARIFF_FILL_PLAN
   * item 1). Carried through for downstream selection once wagon length is captured at intake;
   * currently documentary (the pinned scheme is already correct for the dominant <19.6м case).
   */
  emptyLengthGuardM?: number | null;
  computable: boolean;
  /** Classifier row confidence as published in the seed (high/medium/low). */
  confidence?: string;
}

interface RawBelt {
  scheme: string;
  weightT?: number | null;
  distFromKm: number;
  distToKm: number;
  rateRub: number;
}

interface RawEmptyRunBelt {
  scheme: string;
  axles: number | null;
  distFromKm: number;
  distToKm: number;
  rateRub: number;
}

interface RawK1Row {
  class: number;
  distFromKm: number;
  distToKm: number;
  k1: number;
}

interface RawK3Row {
  etsng: string;
  k3: number;
}

interface RawK4Row {
  shipmentGroup: string;
  distFromKm: number;
  distToKm: number;
  k: number;
}

interface RawInnovativeModel {
  model: string;
  coef: number;
  scheme: string;
}

interface RawEtsngEntry {
  code: string;
  name: string;
  tariffClass: number;
  mvnRaw?: string;
  mvnByWagon?: Record<string, unknown> | null;
}

// ── WagonSchemeRow from pinned classifier ─────────────────────────────────────

export function loadSchemeMapFromSeed(): readonly WagonSchemeRow[] {
  if (_schemeMap !== null) return _schemeMap;

  const file = loadJson<{ rows: PinnedClassifierRow[] }>("tr1-classifier-pinned.json");
  const rows: WagonSchemeRow[] = [];

  for (const r of file.rows) {
    const ownership = r.ownership as Ownership;
    const shipmentType = r.shipment as ShipmentType;

    // Only include rows that have a computable iScheme (iBeltScheme present).
    // Non-computable rows (containers/transporters without belt data) are kept so the
    // engine can degrade gracefully (scheme found in map but no belt → yellow/red).
    // M5: propagate the source `computable` flag + row confidence so the orchestrator can
    // surface the REAL root cause instead of a generic belt-miss. Belt resolution remains
    // authoritative — a backed belt found for a род flagged computable:false still prices
    // (capped yellow), an unbacked/red belt surfaces red regardless of the flag.
    rows.push({
      wagonType: r.wagonCode,
      ownership,
      shipmentType,
      iSchemeCode: r.iBeltScheme ?? null,
      vSchemeCode: r.vBeltScheme ?? null,
      emptySchemeCode: r.emptyScheme ?? null,
      emptyLengthGuardM: r.emptyLengthGuardM ?? null,
      computable: r.computable,
      confidence: r.confidence ?? null,
    });
  }

  _schemeMap = rows;
  return _schemeMap;
}

// Per-tonne nalivnye schemes (ЗА ТОННУ, not ЗА ВАГОН):
// И14-И18 = RZD цистерны; N19-N24 = own/рented цистерны.
const PER_TONNE_SCHEMES = new Set([
  "И14", "И15", "И16", "И17", "И18",
  "N19", "N20", "N21", "N22", "N23", "N24",
]);

// ── RateBelt from i-belts-full + v-belts-full ─────────────────────────────────

// ── Raw shapes for the род-specific plates (Phase-1 acquired) ─────────────────

interface RawReeferBelt {
  scheme: string;
  weightT?: number | null;
  distFromKm: number;
  distToKm: number;
  rateRub: number | null;
}

interface RawTransporterBelt {
  scheme: string;
  axleCount?: number[] | null;
  weightT?: number | null;
  distFromKm: number;
  distToKm: number;
  rateRub: number | null;
  unit?: string;
  confidence?: string;
}

interface RawContainerBelt {
  scheme: string;
  rateModel?: string;
  confidence?: string;
  containerSize?: string;
  ownership?: string;
  loadedState?: string;
  A_rubPerContainer?: number | null;
  B_rubPerContainerKm?: number | null;
}

export function loadRateBeltsFromSeed(): readonly RateBelt[] {
  if (_rateBelts !== null) return _rateBelts;

  const iBeltsFile = loadJson<{ belts: RawBelt[] }>("tr1-i-belts-full.json");
  const vBeltsRaw = loadJson<RawBelt[]>("tr1-v-belts-full.json");

  const out: RateBelt[] = [];

  // Base И-belts (N8/И1 2D grids + distance-only И/N schemes). Cistern schemes И14-И18 /
  // N19-N24 in this file are за-тонну; everything else is за-вагон (M8 explicit unit).
  for (const b of iBeltsFile.belts) {
    const isPerTonne = PER_TONNE_SCHEMES.has(b.scheme);
    out.push({
      schemeCode: b.scheme,
      distFromKm: b.distFromKm,
      distToKm: b.distToKm,
      rateRub: b.rateRub,
      weightT: b.weightT ?? null,
      perTonne: isPerTonne,
      unit: isPerTonne ? "perTonne" : "perWagon",
    });
  }

  // В-belts (RZD wagon component, distance-only, за-вагон).
  for (const b of vBeltsRaw) {
    out.push({
      schemeCode: b.scheme,
      distFromKm: b.distFromKm,
      distToKm: b.distToKm,
      rateRub: b.rateRub,
      weightT: null,
      perTonne: false,
      unit: "perWagon",
    });
  }

  // H6 — own/rented cistern naval schemes N19-N24 (Приложение N2, ЗА ТОННУ, по классу груза)
  // are ALREADY present in tr1-i-belts-full.json (and marked per-tonne via PER_TONNE_SCHEMES
  // above), so they are NOT re-loaded here from the dedicated tr1-i-belts-cistern.json — doing
  // so would duplicate every cistern cell. The dedicated file is the M7 standalone extraction.

  // H6 — refrigerator/isothermal schemes N30 (общий парк) / N31 (собств./аренд.) — за-вагон,
  // distance-only. Backed cells from tr1-i-belts-reefer.json.
  const reeferFile = loadJson<{ belts: RawReeferBelt[] }>("tr1-i-belts-reefer.json");
  for (const b of reeferFile.belts) {
    out.push({
      schemeCode: b.scheme,
      distFromKm: b.distFromKm,
      distToKm: b.distToKm,
      rateRub: b.rateRub as number,
      weightT: b.weightT ?? null,
      perTonne: false,
      unit: "perWagon",
      confidence: "green",
    });
  }

  // H6/H17 — transporter schemes N39+ (per-axle + степень негабаритности). Rates in the
  // acquired plate are NULL placeholders flagged confidence:"red" (not yet sourced verbatim) —
  // they are carried so the engine surfaces the real root cause and stays RED, never fabricates.
  const transporterFile = loadJson<{ belts: RawTransporterBelt[] }>("tr1-i-belts-transporter.json");
  for (const b of transporterFile.belts) {
    out.push({
      schemeCode: b.scheme,
      distFromKm: b.distFromKm,
      distToKm: b.distToKm,
      rateRub: (b.rateRub ?? null) as number,
      weightT: null,
      perTonne: false,
      unit: "perTransporter",
      axleCount: b.axleCount ?? null,
      confidence: b.confidence ?? null,
    });
  }

  // H6/H17 — container linearAB plates N85-94 (Табл.N24). Each plate is keyed by
  // (containerSize, ownership) and evaluated as A + B×KL — NOT a distance band.
  const containerFile = loadJson<{ belts: RawContainerBelt[] }>("tr1-i-belts-container.json");
  for (const b of containerFile.belts) {
    if (b.rateModel !== "linearAB") continue; // skip the RED порожний placeholder row
    out.push({
      schemeCode: b.scheme,
      distFromKm: 0,
      distToKm: 9_999_999,
      rateRub: 0, // not used for linearAB; the plate is evaluated as A + B×KL
      weightT: null,
      perTonne: false,
      unit: "perContainer",
      rateModel: "linearAB",
      containerSize: b.containerSize ?? null,
      containerOwnership: b.ownership ?? null,
      aRubPerContainer: b.A_rubPerContainer ?? null,
      bRubPerContainerKm: b.B_rubPerContainerKm ?? null,
      confidence: b.confidence ?? "green",
    });
  }

  _rateBelts = out;
  return _rateBelts;
}

// ── EmptyRunBelt from empty-run-full ─────────────────────────────────────────

export function loadEmptyRunBeltsFromSeed(): readonly EmptyRunBelt[] {
  if (_emptyRunBelts !== null) return _emptyRunBelts;

  const raw = loadJson<RawEmptyRunBelt[]>("tr1-empty-run-full.json");

  _emptyRunBelts = raw.map((b) => ({
    schemeCode: b.scheme,
    axles: b.axles ?? null,
    distFromKm: b.distFromKm,
    distToKm: b.distToKm,
    rateRub: b.rateRub,
  }));

  return _emptyRunBelts;
}

// ── ClassCoeffBelt from k1-full ───────────────────────────────────────────────

export function loadClassBeltsFromSeed(): readonly ClassCoeffBelt[] {
  if (_classBelts !== null) return _classBelts;

  const file = loadJson<{ classCoeff: RawK1Row[] }>("tr1-k1-full.json");

  _classBelts = file.classCoeff.map((r) => ({
    freightClass: (r.class === 1 ? 1 : r.class === 3 ? 3 : 2) as FreightClass,
    distFromKm: r.distFromKm,
    distToKm: r.distToKm,
    k1: r.k1,
  }));

  return _classBelts;
}

// ── K3Row from k3-full ────────────────────────────────────────────────────────
//
// K3 extra multipliers (п.1.5/3.3/5.7):
//   class 1: ×0.909 for patterns "231-236" and "241,242,245,246" in ПВ/ПЛ (sourced, EXACT).
//   class 2: ×1.04 for "Отдельные грузы в полувагонах/платформах" — ETSNG subset NOT fully
//            extracted (confidence=medium per seed meta). SKIPPED to avoid fabrication.
//   class 3: ×1.04 — same gap. SKIPPED.
// The gaps are reflected as missing wagonTypeMultiplier on the affected rows.

const K3_CLASS1_EXTRA_PATTERNS = ["231-236", "241,242,245,246"];
const K3_CLASS1_EXTRA_MULTIPLIER = 0.909;
const K3_EXTRA_WAGON_TYPES = ["ПВ", "ПЛ"];

export function loadK3RowsFromSeed(): readonly K3Row[] {
  if (_k3Rows !== null) return _k3Rows;

  const file = loadJson<{
    class1: RawK3Row[];
    class1_extra: { multiplier: number };
    class2: RawK3Row[];
    class3: RawK3Row[];
  }>("tr1-k3-full.json");

  const out: K3Row[] = [];

  // Class 1 rows with ×0.909 sub-multiplier for mineral/строительные in ПВ/ПЛ.
  for (const r of file.class1) {
    const hasExtra = K3_CLASS1_EXTRA_PATTERNS.includes(r.etsng);
    out.push({
      etsngPattern: r.etsng,
      freightClass: 1,
      k3: r.k3,
      wagonTypeMultiplier: hasExtra ? K3_CLASS1_EXTRA_MULTIPLIER : null,
      wagonTypeApplicable: hasExtra ? K3_EXTRA_WAGON_TYPES : null,
    });
  }

  // Class 2 rows — no extra wagon-type sub-multiplier (gap, see note above).
  for (const r of file.class2) {
    out.push({ etsngPattern: r.etsng, freightClass: 2, k3: r.k3 });
  }

  // Class 3 rows — no extra wagon-type sub-multiplier (gap, see note above).
  for (const r of file.class3) {
    out.push({ etsngPattern: r.etsng, freightClass: 3, k3: r.k3 });
  }

  _k3Rows = out;
  return _k3Rows;
}

// ── K4FullRow from k4-full ────────────────────────────────────────────────────

export function loadK4FullRowsFromSeed(): readonly K4FullRow[] {
  if (_k4FullRows !== null) return _k4FullRows;

  const file = loadJson<{ distanceCorr: RawK4Row[] }>("tr1-k4-full.json");

  _k4FullRows = file.distanceCorr.map((r) => ({
    shipmentGroup: r.shipmentGroup,
    distFromKm: r.distFromKm,
    distToKm: r.distToKm,
    k: r.k,
  }));

  return _k4FullRows;
}

// ── DirectionalK3Row from tr1-k3-directional.json (Табл.N3) ───────────────────
//
// Табл.N3 directional coefficients, DISTINCT from Табл.N4 commodity K3. Only the
// verbatim-confirmed sections are loaded: section 1 (Калининград↔сеть, green, distance×class),
// section 2 (внутри Калининграда, green, flat 0.9 any-class), section 4 (named timber routes,
// yellow). Section 3 (погранстанции) is seed-flagged confidence:red / doNotUseInEngine — its
// numbers are NOT loaded here (the MONEY CONTRACT forbids shipping unverified figures). The
// resolver (resolveDirectionalK3) returns 1.0 for every ordinary inter-RF haul, so these rows
// are inert unless a future route classifier flags a Калининград/маршрут direction.

interface RawDirectionalSection1Row {
  distanceFromKm: number;
  distanceToKm: number | null;
  tariffClass: number;
  coefficient: number;
}

export function loadDirectionalK3FromSeed(): readonly DirectionalK3Row[] {
  if (_directionalRows !== null) return _directionalRows;

  const file = loadJson<{
    section1_kaliningrad_to_network?: { confidence?: string; rows?: RawDirectionalSection1Row[] };
    section2_within_kaliningrad?: { confidence?: string; coefficient?: number };
    section4_round_timber_named_routes?: { confidence?: string; coefficient?: number };
  }>("tr1-k3-directional.json");

  const out: DirectionalK3Row[] = [];

  // Section 1 — distance×class keyed Калининград↔сеть (verbatim green).
  const s1 = file.section1_kaliningrad_to_network;
  if (s1?.rows) {
    for (const r of s1.rows) {
      out.push({
        section: "section1_kaliningrad_to_network",
        coefficient: r.coefficient,
        distFromKm: r.distanceFromKm,
        distToKm: r.distanceToKm,
        tariffClass: (r.tariffClass === 1 ? 1 : r.tariffClass === 3 ? 3 : 2) as FreightClass,
        confidence: s1.confidence ?? "green",
      });
    }
  }

  // Section 2 — flat 0.9 for any class within Калининградская ж.д. (verbatim green).
  const s2 = file.section2_within_kaliningrad;
  if (s2?.coefficient != null) {
    out.push({
      section: "section2_within_kaliningrad",
      coefficient: s2.coefficient,
      tariffClass: "any",
      confidence: s2.confidence ?? "green",
    });
  }

  // Section 4 — named timber routes (yellow).
  const s4 = file.section4_round_timber_named_routes;
  if (s4?.coefficient != null) {
    out.push({
      section: "section4_round_timber_named_routes",
      coefficient: s4.coefficient,
      tariffClass: "any",
      confidence: s4.confidence ?? "yellow",
    });
  }

  _directionalRows = out;
  return _directionalRows;
}

// ── ContainerReductionRow from tr1-reductions.json (Табл.N12, п.16.10) ────────
//
// FCL container reductions (₽ per container) — an ADDITIVE subtraction applied before the
// п.15.5 round. Loaded for the container path's п.16.10 wiring. Контрейлер (Табл.N13) is not
// loaded into this row shape (separate vehicle-keyed table, контрейлер path not in contour).

interface RawTabl12Row {
  size: string;
  obshchiy_park_gruzhenye: number | null;
  sobstvennye_gruzhenye: number | null;
  sobstvennye_porozhnie: number | null;
}

export function loadContainerReductionsFromSeed(): readonly ContainerReductionRow[] {
  if (_containerReductions !== null) return _containerReductions;

  const file = loadJson<{ tabl12_containers?: { rows?: RawTabl12Row[] } }>(
    "tr1-reductions.json",
  );
  const rows = file.tabl12_containers?.rows ?? [];

  _containerReductions = rows.map((r) => ({
    sizeKey: r.size,
    ownLoadedRub: r.sobstvennye_gruzhenye,
    ownEmptyRub: r.sobstvennye_porozhnie,
    commonLoadedRub: r.obshchiy_park_gruzhenye,
  }));

  return _containerReductions;
}

// ── InnovativeModel from innovative-models ────────────────────────────────────

export function loadInnovativeModelsFromSeed(): readonly InnovativeModel[] {
  if (_innovativeModels !== null) return _innovativeModels;

  const file = loadJson<{ models: RawInnovativeModel[] }>("tr1-innovative-models.json");

  _innovativeModels = file.models.map((m) => ({
    model: m.model,
    coef: m.coef,
    scheme: m.scheme,
  }));

  return _innovativeModels;
}

// ── EtsngEntry from etsng-classes ─────────────────────────────────────────────
//
// The etsng-classes.json mvnByWagon field uses keys like "default", "pv", "pl", "kr"
// and values like numbers or the "gp" sentinel. We map these to MvnByWagon safely.

function toMvnValue(v: unknown): number | "gp" | null {
  if (typeof v === "number") return v;
  if (v === "gp") return "gp";
  return null;
}

export function loadEtsngFromSeed(): readonly EtsngEntry[] {
  if (_etsngCatalog !== null) return _etsngCatalog;

  const raw = loadJson<RawEtsngEntry[]>("etsng-classes.json");
  const cls2 = (n: number): FreightClass =>
    n === 1 ? 1 : n === 3 ? 3 : 2;

  const out: EtsngEntry[] = raw.map((r) => {
    const mvn = r.mvnByWagon as Record<string, unknown> | null | undefined;
    if (!mvn) {
      return { code: r.code, name: r.name, tariffClass: cls2(r.tariffClass), mvnByWagon: null };
    }
    const defVal = toMvnValue(mvn["default"]);
    const pvVal = toMvnValue(mvn["pv"]);
    const plVal = toMvnValue(mvn["pl"]);
    const krVal = toMvnValue(mvn["kr"]);
    return {
      code: r.code,
      name: r.name,
      tariffClass: cls2(r.tariffClass),
      mvnByWagon: {
        ...(defVal !== null ? { default: defVal } : {}),
        ...(pvVal !== null ? { pv: pvVal } : {}),
        ...(plVal !== null ? { pl: plVal } : {}),
        ...(krVal !== null ? { kr: krVal } : {}),
      },
    };
  });

  _etsngCatalog = out;
  return _etsngCatalog;
}
