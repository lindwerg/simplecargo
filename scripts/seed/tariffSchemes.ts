// Seed the ТР-1 2026 rate-scheme + coefficient stack (TARIFF_CALCULATOR §4.3 /
// §4.4, Phase 4). Loads the tr1-*.json artifacts DEFENSIVELY (each missing file
// logs + skips its own table; a missing file never crashes the run) into:
//   tariff_scheme · wagon_scheme_map · tariff_rate_belt · class_coeff ·
//   distance_corr · empty_run_scheme · tariff_coefficients
// Run:  pnpm db:seed:tariff
//
// Schema-vs-data note: several schema PKs are tighter than the source data's
// dimensions (e.g. tariff_rate_belt PK is (scheme, dist_from) so it cannot hold
// the WEIGHT×distance N8/И1 tables; empty_run_scheme PK is (axles, dist_from) so
// it holds one scheme per axle-count; distance_corr PK is dist_from so it holds
// one отправочный group). We seed what fits the schema cleanly and skip the rest
// with an explicit warning — never silently lose data, never fabricate.

import { sql } from "drizzle-orm";

import { pool, db } from "@/lib/db/client";
import {
  tariffScheme,
  wagonSchemeMap,
  tariffRateBelt,
  classCoeff,
  distanceCorr,
  emptyRunScheme,
  tariffCoefficients,
} from "@/lib/db/schema/tariffSchemes";
import { normalizeWagonType } from "@/lib/wagons/wagon-type";
import { chunk, CHUNK_SIZE, loadJsonDefensive } from "./_shared";

const FILE_BELTS = "tr1-rate-belts.json";
const FILE_CLASS = "tr1-class-coeff.json";
const FILE_EMPTY = "tr1-empty-run.json";
const FILE_COEFFS = "tr1-coefficients.json";
const FILE_CLASSIFIER = "tr1-scheme-classifier.json";

// distance_corr PK is dist_from → seed only the повагонная (group "1") taper.
const PRIMARY_SHIPMENT_GROUP = "1";
// empty_run_scheme PK is (axles, dist_from) → seed only the primary own-полувагон
// empty scheme "25" (4-axle universal gondolas/covered/platforms, §schemeMeta).
const PRIMARY_EMPTY_SCHEME = "25";
const VALID_SHIPMENTS = new Set(["wagon", "group", "route"]);

// Schemes referenced by the classifier as concrete codes get a tariff_scheme row
// so wagon_scheme_map FKs hold. Range tokens ("И2..И7", "19..24") are not codes →
// the map stores null for them.
function isConcreteSchemeCode(code: string): boolean {
  return code.length > 0 && !code.includes("..");
}

function schemeKind(code: string): "I" | "V" {
  return code.startsWith("В") || code.startsWith("V") ? "V" : "I";
}

interface SchemeRowAccumulator {
  schemeCode: string;
  kind: "I" | "V";
  classDependent: boolean;
  description: string | null;
}

// ── tariff_scheme + tariff_rate_belt (from rate-belts) ───────────────────────

interface BeltRow {
  scheme?: unknown;
  distFromKm?: unknown;
  distToKm?: unknown;
  rateRub?: unknown;
}

interface RateBeltsFile {
  schemesI2toI7_belt?: BeltRow[];
  schemesV_belt?: BeltRow[];
}

function toBeltInsert(raw: BeltRow): {
  schemeCode: string;
  distFromKm: number;
  distToKm: number;
  weightT: number;
  rateRub: string;
} | null {
  const schemeCode = String(raw.scheme ?? "").trim();
  const distFromKm = Number(raw.distFromKm);
  const distToKm = Number(raw.distToKm);
  const rate = Number(raw.rateRub);
  if (!schemeCode) return null;
  if (!Number.isFinite(distFromKm) || !Number.isFinite(distToKm) || distToKm < distFromKm) return null;
  if (!Number.isFinite(rate) || rate < 0) return null;
  // 1-D schemes use sentinel -1 for the weight_t PK column.
  return { schemeCode, distFromKm, distToKm, weightT: -1, rateRub: rate.toFixed(2) };
}

type BeltInsert = { schemeCode: string; distFromKm: number; distToKm: number; weightT: number; rateRub: string };

/**
 * Collects belt rows from the rate-belts file and registers their scheme codes
 * into `schemes`. Pure collection — no DB write — so tariff_scheme parents can be
 * flushed before any FK-bearing child insert. Returns [] (with a warning) when
 * the file is absent or has no belt-shaped tables.
 */
function collectBelts(schemes: Map<string, SchemeRowAccumulator>): BeltInsert[] {
  const data = loadJsonDefensive<RateBeltsFile>(FILE_BELTS);
  if (data === null) return [];

  const beltRows = [...(data.schemesI2toI7_belt ?? []), ...(data.schemesV_belt ?? [])];
  if (beltRows.length === 0) {
    console.warn(`⚠ ${FILE_BELTS}: no belt-shaped tables — rate belts skipped (weight×dist tables do not fit schema PK).`);
    return [];
  }

  // Dedupe belts by (scheme, distFrom) = schema PK; first row wins.
  const byKey = new Map<string, BeltInsert>();
  let skipped = 0;
  for (const raw of beltRows) {
    const ins = toBeltInsert(raw);
    if (!ins) {
      skipped += 1;
      continue;
    }
    const key = `${ins.schemeCode}|${ins.distFromKm}`;
    if (!byKey.has(key)) byKey.set(key, ins);
    if (!schemes.has(ins.schemeCode)) {
      schemes.set(ins.schemeCode, {
        schemeCode: ins.schemeCode,
        kind: schemeKind(ins.schemeCode),
        classDependent: schemeKind(ins.schemeCode) === "I",
        description: "ТР-1 2026 rate belt",
      });
    }
  }
  if (skipped > 0) console.log(`  …${skipped} malformed belt rows skipped.`);
  return [...byKey.values()];
}

/** Inserts the collected tariff_scheme parent rows (must precede FK children). */
async function flushSchemes(schemes: Map<string, SchemeRowAccumulator>): Promise<void> {
  const values = [...schemes.values()];
  if (values.length === 0) return;
  for (const batch of chunk(values, CHUNK_SIZE)) {
    await db.insert(tariffScheme).values(batch).onConflictDoNothing({ target: tariffScheme.schemeCode });
  }
  console.log(`✓ Tariff schemes processed (${values.length} scheme codes).`);
}

/** Inserts the collected rate belts (FK to tariff_scheme already satisfied). */
async function insertBelts(values: readonly BeltInsert[]): Promise<void> {
  if (values.length === 0) return;
  for (const batch of chunk(values, CHUNK_SIZE)) {
    await db
      .insert(tariffRateBelt)
      .values([...batch])
      .onConflictDoNothing({ target: [tariffRateBelt.schemeCode, tariffRateBelt.distFromKm, tariffRateBelt.weightT] });
  }
  console.log(
    `✓ Rate belts processed (${values.length} belt rows; weight×dist N8/И1 tables intentionally ` +
      `not seeded — schema PK is (scheme, dist_from)).`,
  );
}

// ── wagon_scheme_map (from classifier) ───────────────────────────────────────

interface ClassifierRow {
  wagon?: unknown;
  ownership?: unknown;
  shipment?: unknown;
  iScheme?: unknown;
  vScheme?: unknown;
}

interface ClassifierFile {
  rows?: ClassifierRow[];
}

type WagonSchemeInsert = {
  wagonType: string;
  ownership: string;
  shipmentType: string;
  iSchemeCode: string | null;
  vSchemeCode: string | null;
};

/**
 * Collects wagon→scheme rows from the classifier and registers any concrete
 * scheme codes they reference into `schemes` (so the FK holds after flush). Pure
 * collection — no DB write. Returns [] (with a warning) when the file is absent.
 */
function collectWagonSchemeMap(schemes: Map<string, SchemeRowAccumulator>): WagonSchemeInsert[] {
  const data = loadJsonDefensive<ClassifierFile | ClassifierRow[]>(FILE_CLASSIFIER);
  if (data === null) return [];
  const rows: ClassifierRow[] = Array.isArray(data) ? data : (data.rows ?? []);
  if (rows.length === 0) {
    console.warn(`⚠ ${FILE_CLASSIFIER}: no rows — wagon_scheme_map skipped.`);
    return [];
  }

  // Register concrete classifier scheme codes so the map FKs hold.
  const registerCode = (code: string | null): string | null => {
    if (!code || !isConcreteSchemeCode(code)) return null;
    if (!schemes.has(code)) {
      schemes.set(code, {
        schemeCode: code,
        kind: schemeKind(code),
        classDependent: schemeKind(code) === "I",
        description: "ТР-1 2026 classifier scheme",
      });
    }
    return code;
  };

  const byKey = new Map<string, WagonSchemeInsert>();
  let unresolvedWagon = 0;

  for (const raw of rows) {
    const ownership = String(raw.ownership ?? "").trim();
    const shipment = String(raw.shipment ?? "wagon").trim();
    if (ownership !== "rzd" && ownership !== "own") continue;
    if (!VALID_SHIPMENTS.has(shipment)) continue;

    const wagon = normalizeWagonType(String(raw.wagon ?? ""));
    if (!wagon) {
      unresolvedWagon += 1;
      continue; // cannot key the row without a canonical wagon code — skip + count
    }

    const iSchemeCode = registerCode(raw.iScheme == null ? null : String(raw.iScheme));
    const vSchemeCode = registerCode(raw.vScheme == null ? null : String(raw.vScheme));

    const key = `${wagon.code}|${ownership}|${shipment}`;
    if (!byKey.has(key)) {
      byKey.set(key, { wagonType: wagon.code, ownership, shipmentType: shipment, iSchemeCode, vSchemeCode });
    }
  }

  if (unresolvedWagon > 0) console.log(`  …${unresolvedWagon} unrecognized wagon names skipped.`);
  return [...byKey.values()];
}

/** Inserts the collected wagon→scheme map (FK to tariff_scheme already satisfied). */
async function insertWagonSchemeMap(values: readonly WagonSchemeInsert[]): Promise<void> {
  if (values.length === 0) {
    console.warn("⚠ No wagon_scheme_map rows resolved from classifier.");
    return;
  }
  for (const batch of chunk(values, CHUNK_SIZE)) {
    await db
      .insert(wagonSchemeMap)
      .values([...batch])
      .onConflictDoNothing({
        target: [wagonSchemeMap.wagonType, wagonSchemeMap.ownership, wagonSchemeMap.shipmentType],
      });
  }
  console.log(`✓ Wagon→scheme map processed (${values.length} mappings).`);
}

// ── class_coeff + distance_corr (from class-coeff file) ───────────────────────

interface ClassCoeffRow {
  class?: unknown;
  distFromKm?: unknown;
  distToKm?: unknown;
  k1?: unknown;
  etsngGroup?: unknown; // optional named-ETSNG-group note (class 3 variant rows)
}
interface DistanceCorrRow {
  shipmentGroup?: unknown;
  distFromKm?: unknown;
  distToKm?: unknown;
  k?: unknown;
}
interface ClassCoeffFile {
  classCoeff?: ClassCoeffRow[];
  distanceCorr?: DistanceCorrRow[];
}

async function seedClassAndDistanceCorr(): Promise<void> {
  const data = loadJsonDefensive<ClassCoeffFile>(FILE_CLASS);
  if (data === null) return;

  // class_coeff — PK (class, dist_from, etsng_group). etsng_group='' is the default.
  // Class-3 has two rows at the same (class, dist_from): a named-ETSNG-group variant
  // (k1=1.74) and a default fallback (k1=1.54, etsngGroup=''). Both must be seeded.
  const classRows = data.classCoeff ?? [];
  const byClassKey = new Map<string, { freightClass: number; distFromKm: number; distToKm: number; k1: string; etsngGroup: string }>();
  let classSkipped = 0;
  for (const raw of classRows) {
    const freightClass = Number(raw.class);
    const distFromKm = Number(raw.distFromKm);
    const distToKm = Number(raw.distToKm);
    const k1 = Number(raw.k1);
    if (![1, 2, 3].includes(freightClass) || !Number.isFinite(distFromKm) || distToKm < distFromKm || !Number.isFinite(k1)) {
      classSkipped += 1;
      continue;
    }
    const etsngGroup = raw.etsngGroup != null ? String(raw.etsngGroup).trim() : "";
    const key = `${freightClass}|${distFromKm}|${etsngGroup}`;
    if (byClassKey.has(key)) {
      console.warn(`⚠ class_coeff: duplicate PK (class=${freightClass}, distFrom=${distFromKm}, etsngGroup="${etsngGroup}") — keeping first row (k1=${byClassKey.get(key)?.k1}), discarding k1=${k1.toFixed(4)}.`);
    } else {
      byClassKey.set(key, { freightClass, distFromKm, distToKm, k1: k1.toFixed(4), etsngGroup });
    }
  }
  const classValues = [...byClassKey.values()];
  for (const batch of chunk(classValues, CHUNK_SIZE)) {
    await db.insert(classCoeff).values(batch).onConflictDoNothing({ target: [classCoeff.freightClass, classCoeff.distFromKm, classCoeff.etsngGroup] });
  }
  console.log(`✓ class_coeff processed (${classValues.length} rows; ${classSkipped} skipped).`);

  // distance_corr — PK dist_from → seed primary повагонная (group "1") only.
  const corrRows = (data.distanceCorr ?? []).filter((r) => String(r.shipmentGroup ?? "") === PRIMARY_SHIPMENT_GROUP);
  const byCorrKey = new Map<number, { distFromKm: number; distToKm: number; kTable5: string }>();
  let corrSkipped = 0;
  for (const raw of corrRows) {
    const distFromKm = Number(raw.distFromKm);
    const distToKm = Number(raw.distToKm);
    const k = Number(raw.k);
    if (!Number.isFinite(distFromKm) || distToKm < distFromKm || !Number.isFinite(k)) {
      corrSkipped += 1;
      continue;
    }
    if (!byCorrKey.has(distFromKm)) byCorrKey.set(distFromKm, { distFromKm, distToKm, kTable5: k.toFixed(4) });
  }
  const corrValues = [...byCorrKey.values()];
  for (const batch of chunk(corrValues, CHUNK_SIZE)) {
    await db.insert(distanceCorr).values(batch).onConflictDoNothing({ target: distanceCorr.distFromKm });
  }
  console.log(
    `✓ distance_corr processed (${corrValues.length} rows for отправочная group "${PRIMARY_SHIPMENT_GROUP}"; ` +
      `${corrSkipped} skipped; other groups not seeded — schema PK is dist_from only).`,
  );
}

// ── empty_run_scheme (from empty-run file) ───────────────────────────────────

interface EmptyRunRow {
  scheme?: unknown;
  axles?: unknown;
  distFromKm?: unknown;
  distToKm?: unknown;
  rateRub?: unknown;
}
interface EmptyRunFile {
  rows?: EmptyRunRow[];
}

async function seedEmptyRun(): Promise<void> {
  const data = loadJsonDefensive<EmptyRunFile>(FILE_EMPTY);
  if (data === null) return;
  const rows = data.rows ?? [];
  if (rows.length === 0) {
    console.warn(`⚠ ${FILE_EMPTY}: no rows — empty_run_scheme skipped.`);
    return;
  }

  // PK is (axles, dist_from) → seed only the primary own-полувагон scheme "25".
  const byKey = new Map<string, { axles: number; distFromKm: number; distToKm: number; rateRub: string }>();
  let skipped = 0;
  for (const raw of rows) {
    if (String(raw.scheme ?? "") !== PRIMARY_EMPTY_SCHEME) continue;
    const axles = Number(raw.axles);
    const distFromKm = Number(raw.distFromKm);
    const distToKm = Number(raw.distToKm);
    const rate = Number(raw.rateRub);
    if (!Number.isFinite(axles) || !Number.isFinite(distFromKm) || distToKm < distFromKm || !Number.isFinite(rate) || rate < 0) {
      skipped += 1;
      continue;
    }
    const key = `${axles}|${distFromKm}`;
    if (!byKey.has(key)) byKey.set(key, { axles, distFromKm, distToKm, rateRub: rate.toFixed(2) });
  }

  const values = [...byKey.values()];
  if (values.length === 0) {
    console.warn(`⚠ No empty_run_scheme rows for scheme "${PRIMARY_EMPTY_SCHEME}".`);
    return;
  }
  for (const batch of chunk(values, CHUNK_SIZE)) {
    await db.insert(emptyRunScheme).values(batch).onConflictDoNothing({ target: [emptyRunScheme.axles, emptyRunScheme.distFromKm] });
  }
  console.log(
    `✓ empty_run_scheme processed (${values.length} rows for scheme "${PRIMARY_EMPTY_SCHEME}"; ` +
      `${skipped} skipped; other empty schemes not seeded — schema PK is (axles, dist_from)).`,
  );
}

// ── tariff_coefficients (from coefficients file) ─────────────────────────────

interface CoeffRow {
  label?: unknown;
  kind?: unknown;
  multiplier?: unknown;
  appliesTo?: unknown;
  appliesToClass?: unknown;
  effectiveFrom?: unknown;
  effectiveTo?: unknown;
  note?: unknown;
  skipSeed?: unknown; // when true the row must not be inserted (see _meta notes in JSON)
}
interface CoeffFile {
  rows?: CoeffRow[];
}

const VALID_KINDS = new Set(["index", "coef"]);
const VALID_APPLIES = new Set(["all", "porozhny", "container", "minstroy", "class", "own_gondola"]);

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function seedCoefficients(): Promise<void> {
  const data = loadJsonDefensive<CoeffFile | CoeffRow[]>(FILE_COEFFS);
  if (data === null) return;
  const rows: CoeffRow[] = Array.isArray(data) ? data : (data.rows ?? []);
  if (rows.length === 0) {
    console.warn(`⚠ ${FILE_COEFFS}: no rows — tariff_coefficients skipped.`);
    return;
  }

  const values: Array<{
    label: string;
    kind: string;
    multiplier: string;
    appliesTo: string;
    appliesToClass: number | null;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
  }> = [];
  let skipped = 0;
  for (const raw of rows) {
    // Rows with skipSeed=true must never be inserted (see JSON _meta notes).
    if (raw.skipSeed === true) {
      console.warn(`⚠ Skipping disabled coefficient: ${String(raw.label ?? "(unnamed)")}`);
      skipped += 1;
      continue;
    }
    const label = String(raw.label ?? "").trim();
    const kind = String(raw.kind ?? "").trim();
    const appliesTo = String(raw.appliesTo ?? "").trim();
    const multiplier = Number(raw.multiplier);
    if (!label || !VALID_KINDS.has(kind) || !VALID_APPLIES.has(appliesTo) || !Number.isFinite(multiplier)) {
      skipped += 1;
      continue;
    }
    const appliesToClass = raw.appliesToClass == null ? null : Number(raw.appliesToClass);
    values.push({
      label,
      kind,
      multiplier: multiplier.toFixed(4),
      appliesTo,
      appliesToClass: appliesToClass != null && [1, 2, 3].includes(appliesToClass) ? appliesToClass : null,
      effectiveFrom: toDate(raw.effectiveFrom),
      effectiveTo: toDate(raw.effectiveTo),
    });
  }

  if (values.length === 0) {
    console.warn("⚠ No valid tariff_coefficients rows.");
    return;
  }
  // tariff_coefficients has a random-UUID PK and no natural unique key, so a
  // plain re-run would duplicate rows. Make it idempotent: clear then insert.
  // Wrapped in a transaction so a partial-batch failure leaves the table either
  // fully populated or unchanged (prevents silent undercharge on rollback).
  await db.transaction(async (tx) => {
    await tx.delete(tariffCoefficients).where(sql`TRUE`);
    for (const batch of chunk(values, CHUNK_SIZE)) {
      await tx.insert(tariffCoefficients).values(batch);
    }
  });
  console.log(`✓ tariff_coefficients processed (${values.length} rows; ${skipped} skipped; table reset for idempotency).`);
}

async function main(): Promise<void> {
  const schemes = new Map<string, SchemeRowAccumulator>();

  // 1) Collect every scheme code referenced by belts AND the classifier FIRST, so
  //    a single flush inserts all tariff_scheme parents before any FK child insert.
  const belts = collectBelts(schemes);
  const wagonMap = collectWagonSchemeMap(schemes);
  await flushSchemes(schemes);

  // 2) FK children, now that parents exist.
  await insertBelts(belts);
  await insertWagonSchemeMap(wagonMap);

  // 3) Independent coefficient/lookup tables.
  await seedClassAndDistanceCorr();
  await seedEmptyRun();
  await seedCoefficients();
}

main()
  .then(() => {
    console.log("✓ ТР-1 scheme/coefficient seed complete.");
  })
  .catch((error: unknown) => {
    console.error("❌ ТР-1 scheme seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
