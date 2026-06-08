// Seed the Книга-3 backbone (ТП↔ТП) edge layer + узел fixed-distance defaults
// (TARIFF_CALCULATOR §3.1 / §4.1, Phase 2 input). Loads
// scripts/seed-data/kniga3-backbone.json DEFENSIVELY — this file is the single
// load-bearing external dependency (§3.3) and is EXPECTED to be absent until a
// parallel sourcing workflow produces it; we log + skip the backbone insert in
// that case but STILL seed the hub defaults. Run:  pnpm db:seed:graph
//
// Книга-3 source shape (array of rows). Endpoints may be given as station NAMES
// (`from`/`to` or `a`/`b`, resolved here to ESR) and/or pre-resolved ESR
// (`fromEsr`/`toEsr` or `aEsr`/`bEsr`). Pre-resolved ESRs are still VALIDATED
// against the stations table: the matrix references узел pseudo-nodes (e.g.
// Московский узел "000015", СПб узел "000023") that are NOT real stations, so an
// edge touching them would violate the tariff_edges → stations FK and is skipped
// (counted) rather than inserted. Backbone weights are PINNED to the published
// value; we store them symmetric with from_esr < to_esr so each ТП↔ТП pair is one
// row. Idempotent.

import { pool, db } from "@/lib/db/client";
import { tariffEdges, hubFixedDistance } from "@/lib/db/schema/tariffGraph";
import {
  chunk,
  CHUNK_SIZE,
  loadJsonDefensive,
  buildStationNameIndex,
  buildStationEsrSet,
  resolveNameToEsr,
  runSeed,
} from "./_shared";

const BACKBONE_FILE = "kniga3-backbone.json";
const ESR_RE = /^\d{6}$/;

// узел fixed-distance defaults (§3.1). Moscow +54 / SPb +25 for cross-line moves.
// The same-line exclusion is CONDITIONAL and lives in compute code; here we seed
// the default cross-line ('*' → '*') override only. Real per-line rows can be
// curated later without changing this seed.
const HUB_DEFAULTS = [
  { hubName: "Москва", fromLine: "*", toLine: "*", km: 54 },
  { hubName: "Санкт-Петербург", fromLine: "*", toLine: "*", km: 25 },
] as const;

interface BackboneJsonRow {
  from?: unknown;
  to?: unknown;
  fromEsr?: unknown;
  toEsr?: unknown;
  a?: unknown; // alternate endpoint-name keys used by the Книга-3 export
  b?: unknown;
  aEsr?: unknown;
  bEsr?: unknown;
  km?: unknown;
}

interface BackboneEdge {
  fromEsr: string;
  toEsr: string;
  km: number;
  layer: "backbone";
}

interface EdgeCounters {
  unresolved: number;
  selfLoops: number;
  badKm: number;
  notInStations: number;
}

/** First string-valued field among the candidates, else null. */
function firstString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

/** Resolves one raw backbone row to an ordered (from<to) edge, or null. */
function toEdge(
  raw: BackboneJsonRow,
  index: Map<string, string>,
  esrSet: Set<string>,
  counters: EdgeCounters,
): BackboneEdge | null {
  // Accept pre-resolved ESR (fromEsr/toEsr or aEsr/bEsr) first; fall back to
  // name resolution (from/to or a/b).
  const rawA = firstString(raw.fromEsr, raw.aEsr);
  const rawB = firstString(raw.toEsr, raw.bEsr);
  let a = rawA && ESR_RE.test(rawA) ? rawA : null;
  let b = rawB && ESR_RE.test(rawB) ? rawB : null;

  const nameA = firstString(raw.from, raw.a);
  const nameB = firstString(raw.to, raw.b);
  if (!a && nameA) a = resolveNameToEsr(index, nameA);
  if (!b && nameB) b = resolveNameToEsr(index, nameB);

  if (!a || !b) {
    counters.unresolved += 1;
    return null; // never fabricate an endpoint — skip + count
  }
  if (a === b) {
    counters.selfLoops += 1;
    return null;
  }
  // FK guard: both endpoints must be real stations (узел pseudo-nodes are not).
  if (!esrSet.has(a) || !esrSet.has(b)) {
    counters.notInStations += 1;
    return null;
  }

  const km = Number(raw.km);
  if (!Number.isFinite(km) || km < 0) {
    counters.badKm += 1;
    return null; // PIN to published km; refuse garbage rather than guess
  }

  // Store symmetric with from < to so each ТП↔ТП pair is a single row.
  const [fromEsr, toEsr] = a < b ? [a, b] : [b, a];
  return { fromEsr, toEsr, km: Math.round(km), layer: "backbone" };
}

async function seedHubDefaults(): Promise<void> {
  await db
    .insert(hubFixedDistance)
    .values([...HUB_DEFAULTS])
    .onConflictDoNothing({
      target: [hubFixedDistance.hubName, hubFixedDistance.fromLine, hubFixedDistance.toLine],
    });
  console.log(`✓ Hub fixed-distance defaults seeded (${HUB_DEFAULTS.length}: Москва 54 / СПб 25).`);
}

async function seedBackbone(): Promise<void> {
  const data = loadJsonDefensive<BackboneJsonRow[] | { rows?: BackboneJsonRow[] }>(BACKBONE_FILE);
  if (data === null) {
    console.warn("⚠ Книга-3 backbone absent — backbone edges NOT seeded (graph stays spur-only).");
    return;
  }

  const rows: BackboneJsonRow[] = Array.isArray(data)
    ? data
    : Array.isArray(data.rows)
      ? data.rows
      : [];
  if (rows.length === 0) {
    console.warn(`⚠ ${BACKBONE_FILE} contained no rows — backbone not seeded.`);
    return;
  }

  const index = await buildStationNameIndex();
  if (index.size === 0) {
    console.warn("⚠ stations table is empty — run `pnpm db:seed` first; backbone skipped.");
    return;
  }
  const esrSet = await buildStationEsrSet();

  const counters: EdgeCounters = { unresolved: 0, selfLoops: 0, badKm: 0, notInStations: 0 };
  const byKey = new Map<string, BackboneEdge>();
  for (const raw of rows) {
    const edge = toEdge(raw, index, esrSet, counters);
    if (!edge) continue;
    const key = `${edge.fromEsr}|${edge.toEsr}`;
    if (!byKey.has(key)) byKey.set(key, edge); // first published weight wins
  }

  const values = [...byKey.values()];
  if (values.length === 0) {
    console.warn("⚠ No backbone edges resolved from Книга-3 — nothing inserted.");
    return;
  }

  let inserted = 0;
  for (const batch of chunk(values, CHUNK_SIZE)) {
    await db
      .insert(tariffEdges)
      .values(batch)
      .onConflictDoNothing({
        target: [tariffEdges.fromEsr, tariffEdges.toEsr, tariffEdges.layer],
      });
    inserted += batch.length;
    console.log(`  …backbone edges processed ${inserted}/${values.length}`);
  }
  console.log(
    `✓ Backbone edges processed (${values.length} unique; ${counters.unresolved} unresolved, ` +
      `${counters.notInStations} узел/non-station endpoints, ${counters.selfLoops} self, ` +
      `${counters.badKm} bad-km skipped).`,
  );
}

async function main(): Promise<void> {
  await seedHubDefaults();
  await seedBackbone();
}

void runSeed("tariff graph (Книга-3 backbone + hubs)", main, () => pool.end());
