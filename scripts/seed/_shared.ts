// Shared helpers for the tariff-data seed scripts (TARIFF_CALCULATOR §5).
// Every seed must be runnable via tsx and MUST NOT crash if its data file is
// absent — load defensively (log a clear warning + return null), never throw on
// a missing file. Name→ESR resolution reuses the live station dictionary; rows
// that do not resolve are skipped and counted, never fabricated.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { normalizeStationName } from "@/lib/geo/normalize";

/** Directory holding the parsed tariff JSON artifacts. */
export const SEED_DATA_DIR = join(process.cwd(), "scripts", "seed-data");

/** Batch size for chunked inserts, mirroring src/lib/db/seed/stations.ts. */
export const CHUNK_SIZE = 1000;

/** Splits an array into fixed-size chunks (immutable; no mutation of input). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Reads + JSON-parses a file under SEED_DATA_DIR. Returns `null` (with a clear
 * warning) when the file is absent or malformed, so a seed can skip-and-continue
 * instead of crashing. The caller decides whether a null payload is fatal.
 */
export function loadJsonDefensive<T>(fileName: string): T | null {
  const path = join(SEED_DATA_DIR, fileName);
  if (!existsSync(path)) {
    console.warn(`⚠ Data file absent: ${fileName} — skipping its seed (no crash).`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`⚠ Data file unparseable: ${fileName} (${message}) — skipping its seed.`);
    return null;
  }
}

/**
 * Builds a normalized-station-name → ESR index from the live stations table, so
 * seed scripts can resolve human names (e.g. Книга-3 endpoints) to the canonical
 * ESR key. Homonyms keep their first row (deterministic ORDER BY); callers that
 * need a ТП-preferring tie-break should seed via stations.ts which has the flag.
 *
 * Returns an empty map if the stations table is empty (caller skips-with-warning).
 */
export async function buildStationNameIndex(): Promise<Map<string, string>> {
  const result = await db.execute(
    sql`SELECT esr_code, name_normalized FROM stations ORDER BY esr_code`,
  );
  const rows: ReadonlyArray<Record<string, unknown>> = result.rows ?? result;

  const index = new Map<string, string>();
  for (const row of rows) {
    const norm = String(row.name_normalized ?? "");
    if (norm && !index.has(norm)) index.set(norm, String(row.esr_code));
  }
  return index;
}

/**
 * Builds the set of ESR codes that actually exist in the stations table. Used to
 * validate pre-resolved ESR endpoints (e.g. Книга-3 узел pseudo-nodes like
 * Московский узел "000015" are NOT real stations, so an edge referencing them
 * would violate the tariff_edges → stations FK and must be skipped, not inserted).
 */
export async function buildStationEsrSet(): Promise<Set<string>> {
  const result = await db.execute(sql`SELECT esr_code FROM stations`);
  const rows: ReadonlyArray<Record<string, unknown>> = result.rows ?? result;
  return new Set(rows.map((row) => String(row.esr_code)));
}

/** Resolve a raw station name to ESR via the index, or null (caller counts it). */
export function resolveNameToEsr(
  index: Map<string, string>,
  rawName: string,
): string | null {
  const norm = normalizeStationName(rawName);
  if (!norm) return null;
  return index.get(norm) ?? null;
}

/**
 * Standard runner wrapper for a seed `main()`: prints a header, runs, closes the
 * pool, and exits non-zero on failure. Defensive seeds resolve their own missing
 * files internally, so reaching the catch means a real (DB/connection) error.
 */
export async function runSeed(
  label: string,
  main: () => Promise<void>,
  closePool: () => Promise<void>,
): Promise<void> {
  console.log(`Seeding ${label}…`);
  try {
    await main();
    console.log(`✓ ${label} seed complete.`);
  } catch (error: unknown) {
    console.error(`❌ ${label} seed failed:`, error instanceof Error ? error.message : error);
    await closePool().catch(() => {});
    process.exit(1);
  }
  await closePool().catch(() => {});
  process.exit(0);
}
