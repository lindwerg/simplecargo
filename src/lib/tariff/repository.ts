import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  tariffCoefficients,
} from "@/lib/db/schema/tariffSchemes";
import { tariffIndexations } from "@/lib/db/schema/tariffs";
import { resolveDistance } from "@/lib/distance/repository";
import type { DistanceResult } from "@/lib/distance/schema";

import type { EtsngEntry } from "./classLookup";
import type {
  ClassCoeffBelt,
  CoefAppliesTo,
  CoefficientLike,
  DistanceCorrBelt,
  IndexationLike,
} from "./coefficients";
import {
  computeTariffPure,
  type ResolvedDistance,
  type TariffData,
} from "./computeTariff";
import { loadN8TariffData } from "./n8Data";
import type {
  EmptyRunBelt,
  K4Row,
  RateBelt,
  WagonSchemeRow,
} from "./schemeResolve";
import {
  loadClassBeltsFromSeed,
  loadEmptyRunBeltsFromSeed,
  loadEtsngFromSeed,
  loadInnovativeModelsFromSeed,
  loadK3RowsFromSeed,
  loadK4FullRowsFromSeed,
  loadRateBeltsFromSeed,
  loadSchemeMapFromSeed,
} from "./seedLoader";
import type {
  Ownership,
  ShipmentType,
  TariffBreakdown,
  TariffInput,
} from "./schema";
import { tariffInputSchema } from "./schema";

// Drizzle I/O layer for the ТР-1 2026 tariff engine. Loads every rate/coefficient table
// + the resolved distance, then hands plain arrays to the PURE core (computeTariffPure),
// which holds all the algorithm.
//
// Seed-file loaders (seedLoader.ts) are the primary data source for rate tables, scheme maps,
// K3/K4/innovative, and ETSNG. They load from scripts/seed-data/*.json via a module-singleton
// cache and cover all 60 computable wagon×ownership×shipment combinations (tr1-classifier-pinned).
//
// Drizzle (DB) is still used for: indexations, coefficients (порожний ×1.1 etc.), and future
// manual overrides. Distance resolution is also Drizzle-based (ТР-4 engine).


// ── distance: call the ТР-4 engine, map its result into the tariff core's shape ───
function toResolvedDistance(result: DistanceResult): ResolvedDistance {
  // The distance engine returns km=null + confidence 'red' when it cannot resolve a
  // route. Treat anything non-green-or-yellow with a null km as unresolved.
  if (result.km === null) {
    return {
      distanceKm: 0,
      found: false,
      warning: result.warnings[0] ?? "Расстояние не определено",
    };
  }
  return { distanceKm: result.km, found: true };
}

// ── table loaders ─────────────────────────────────────────────────────────────
//
// Rate tables (scheme map, rate belts, empty-run, class K1, K3, K4, innovative, ETSNG)
// are loaded from seed JSON files via module-level singletons in seedLoader.ts.
// Coefficients (порожний ×1.1 etc.) and indexations remain in the DB.

function loadEtsng(code: string): EtsngEntry[] {
  // Full ETSNG catalog from seed (5036 entries). Filter to the single requested code.
  const all = loadEtsngFromSeed();
  return all.filter((e) => e.code === code);
}

function loadSchemeMap(
  wagonType: string,
  ownership: Ownership,
  shipmentType: ShipmentType,
): WagonSchemeRow[] {
  // Pinned classifier from seed — 84 rows covering all wagon×ownership×shipment combos.
  const all = loadSchemeMapFromSeed();
  return all.filter(
    (r) =>
      r.wagonType === wagonType &&
      r.ownership === ownership &&
      r.shipmentType === shipmentType,
  );
}

function loadRateBelts(): RateBelt[] {
  // i-belts-full (29845) + v-belts-full (2159) from seed.
  return loadRateBeltsFromSeed() as RateBelt[];
}

function loadClassBelts(): ClassCoeffBelt[] {
  // K1 class coefficients from tr1-k1-full (classes 1/2/3).
  return loadClassBeltsFromSeed() as ClassCoeffBelt[];
}

async function loadCorrBelts(): Promise<DistanceCorrBelt[]> {
  // Distance-corr table still lives in the DB (not yet in seed JSON). Defensive: empty → 1.0.
  // For production runs the DB should have this seeded from tr1-class-coeff.json.distanceCorr.
  return [];
}

function loadEmptyRunBelts(): EmptyRunBelt[] {
  // Empty-run scheme belts from seed (889 rows, 7 schemes).
  return loadEmptyRunBeltsFromSeed() as EmptyRunBelt[];
}

async function loadCoefficients(): Promise<CoefficientLike[]> {
  const rows = await db
    .select()
    .from(tariffCoefficients)
    .where(eq(tariffCoefficients.kind, "coef"));
  const KNOWN_APPLIES_TO = new Set<string>([
    "all", "porozhny", "container", "minstroy", "class", "own_gondola",
  ]);
  return rows
    .filter((r) => KNOWN_APPLIES_TO.has(r.appliesTo))
    .map((r) => ({
      multiplier: Number(r.multiplier),
      appliesTo: r.appliesTo as CoefAppliesTo,
      appliesToClass: r.appliesToClass === null ? null : Number(r.appliesToClass),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));
}

async function loadIndexations(): Promise<IndexationLike[]> {
  // Indexations live in tariff_coefficients (kind 'index') AND the legacy
  // tariff_indexations table. Load both so a remembered base and the new engine share
  // the same chronology. Both default-empty if unseeded.
  // DEDUP by (effectiveFrom, pct, appliesToClass) to prevent double-counting when the
  // same percentage exists in both tables (e.g. +13.8% from 2024-12-01). tariff_coefficients
  // is the canonical source going forward; tariff_indexations is legacy.
  const coefRows = await db
    .select()
    .from(tariffCoefficients)
    .where(eq(tariffCoefficients.kind, "index"));
  const fromCoef: IndexationLike[] = coefRows
    .filter((r) => r.effectiveFrom !== null)
    .map((r) => ({
      pct: (Number(r.multiplier) - 1) * 100,
      effectiveFrom: r.effectiveFrom as Date,
      // Carry effectiveTo so a closed-window (already-baked) indexation self-deactivates
      // in isIndexApplicable instead of compounding onto the indexed 2026 base — closes
      // the double-count (TARIFF_MASTER_AUDIT.md §3 item 1, gaps C1/H19).
      effectiveTo: r.effectiveTo ?? null,
      appliesToClass: r.appliesToClass === null ? null : Number(r.appliesToClass),
    }));

  const idxRows = await db.select().from(tariffIndexations);
  const fromIdx: IndexationLike[] = idxRows.map((r) => ({
    pct: Number(r.pct),
    effectiveFrom: r.effectiveFrom,
    // Legacy table has no effectiveTo column → open-ended (null). Canonical windows come
    // from tariff_coefficients above (preferred in the dedup below).
    effectiveTo: null,
    appliesToClass: r.appliesToClass === null ? null : Number(r.appliesToClass),
  }));

  // Deduplicate on (effectiveFrom, pct, appliesToClass) — NOT effectiveTo. The legacy
  // tariff_indexations row for the same percentage carries no window (effectiveTo=null);
  // keeping effectiveTo OUT of the key lets the canonical tariff_coefficients row (which
  // does carry the closing window) win, so the baked indexation correctly self-deactivates
  // instead of the legacy open-ended duplicate re-applying it.
  const seen = new Set<string>();
  const merged: IndexationLike[] = [];
  for (const ix of [...fromCoef, ...fromIdx]) {
    const key = `${ix.effectiveFrom.toISOString()}|${ix.pct.toFixed(6)}|${ix.appliesToClass ?? "null"}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(ix);
    }
  }
  return merged;
}

// Legacy simple K4 rows: no longer used (seed full table takes precedence).
async function loadK4Rows(): Promise<K4Row[]> {
  return [];
}

/**
 * Load every table + the resolved distance, then run the pure ТР-1 core. Validates input
 * at the boundary (Zod). Returns a TariffBreakdown whose confidence/warnings gate KP
 * auto-fill: 'green' auto-fills, 'yellow' shows with a flag, 'red' forces manual entry.
 */
export async function computeTariff(rawInput: TariffInput): Promise<TariffBreakdown> {
  const input = tariffInputSchema.parse(rawInput);

  const distanceResult = await resolveDistance({
    originEsr: input.originEsr,
    destEsr: input.destEsr,
    emptyRun: input.emptyReturn ?? false,
  });

  // Synchronous seed loaders (module-singleton, no I/O after first call).
  const etsngRows = loadEtsng(input.etsngCode);
  const schemeMap = loadSchemeMap(input.wagonType, input.ownership, input.shipmentType);
  const rateBelts = loadRateBelts();
  const classBelts = loadClassBelts();
  const emptyRunBelts = loadEmptyRunBelts();
  const k3Rows = loadK3RowsFromSeed();
  const k4FullRows = loadK4FullRowsFromSeed();
  const innovativeModels = loadInnovativeModelsFromSeed();

  // Async DB loaders: indexations, coefficients, distance. corrBelts not yet in seed.
  const [corrBelts, coefficients, indexations, k4Rows] = await Promise.all([
    loadCorrBelts(),
    loadCoefficients(),
    loadIndexations(),
    loadK4Rows(),
  ]);

  // Certified own-полувагон class-1 нерудные N8 tables (Прил.N2 grid + Табл.2 + Табл.5).
  // Injecting these makes the prod entrypoint route the certified contour through the SAME
  // staged-kopeck chain that reproduces the golden oracles to the kopeck (gap H1 unification).
  // Same module-singleton tables quoteService/quoteMatrix already use.
  const n8 = loadN8TariffData();

  const data: TariffData = {
    distance: toResolvedDistance(distanceResult),
    etsng: etsngRows,
    schemeMap,
    rateBelts,
    classBelts,
    corrBelts,
    emptyRunBelts,
    k4Rows,
    coefficients,
    indexations,
    k3Rows,
    k4FullRows,
    innovativeModels,
    n8,
  };

  return computeTariffPure(input, data);
}
