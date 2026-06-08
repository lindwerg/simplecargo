import { readFileSync } from "node:fs";
import { join } from "node:path";

import { pool, db } from "@/lib/db/client";
import { roads, stations, stationAliases } from "@/lib/db/schema/geo";
import { tpNode, tariffEdges } from "@/lib/db/schema/tariffGraph";
import { ALL_ROADS, resolveRoad } from "@/lib/geo/roads";
import { normalizeStationName } from "@/lib/geo/normalize";
import { parseTransitField } from "@/lib/distance/parseTransit";

// Seeds the GEO dictionaries (GEO Goal 1) from the two station CSVs:
//   scripts/seed-data/rzd-stations-20231230.csv  (RF, ';' delimited, has header)
//   scripts/seed-data/cis-stations-20201230.csv  (CIS, ',' delimited, no header)
// Idempotent: every insert uses ON CONFLICT DO NOTHING, so re-running is a no-op.
// Run once after deploy:  pnpm db:seed

const SEED_DIR = join(process.cwd(), "scripts", "seed-data");
const RF_FILE = "rzd-stations-20231230.csv";
const CIS_FILE = "cis-stations-20201230.csv";
const RF_HEADER_FIELD = "Наименование";
const ESR_LENGTH = 6;
const CHUNK_SIZE = 1000;

interface StationRow {
  name: string;
  roadNameRaw: string;
  esr6: string;
  transitRaw: string; // field[4] «Транзитные пункты» — 'ТП' | "Name-km, …" | ""
}

/**
 * Robust single-line CSV parser supporting both ';' and ',' delimiters and
 * quoted fields that contain the delimiter and doubled "" escapes.
 */
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Left-zero-pads a station code to 6 chars; returns null for garbage codes. */
function toEsr6(rawCode: string): string | null {
  const digits = rawCode.trim();
  if (!digits || !/^\d{1,6}$/.test(digits)) return null;
  return digits.padStart(ESR_LENGTH, "0");
}

/** Parses one CSV file into validated station rows; skips header + garbage. */
function parseStationFile(fileName: string, delimiter: string, hasHeader: boolean): StationRow[] {
  const raw = readFileSync(join(SEED_DIR, fileName), "utf8");
  const lines = raw.split(/\r?\n/);
  const rows: StationRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = parseCsvLine(line, delimiter);
    const name = (fields[0] ?? "").trim();
    if (hasHeader && name === RF_HEADER_FIELD) continue; // skip header row

    const roadNameRaw = (fields[2] ?? "").trim();
    const esr6 = toEsr6(fields[3] ?? "");
    if (!name || !esr6) continue; // guard empty/garbage rows

    const transitRaw = (fields[4] ?? "").trim();
    rows.push({ name, roadNameRaw, esr6, transitRaw });
  }

  return rows;
}

async function seedRoads(): Promise<void> {
  const values = ALL_ROADS.map((r) => ({
    rzdCode: r.rzdCode,
    shortCode: r.shortCode,
    fullNameRu: r.fullNameRu,
  }));
  await db.insert(roads).values(values).onConflictDoNothing({ target: roads.rzdCode });
  console.log(`✓ Roads upserted (${values.length} canonical entries).`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function seedStations(rows: StationRow[]): Promise<void> {
  // Dedupe by ESR within the input so a single batch never conflicts with itself.
  const byEsr = new Map<string, StationRow>();
  for (const row of rows) {
    if (!byEsr.has(row.esr6)) byEsr.set(row.esr6, row);
  }
  const unique = [...byEsr.values()];

  const stationValues = unique.map((row) => ({
    esrCode: row.esr6,
    nameEtran: row.name,
    nameNormalized: normalizeStationName(row.name),
    roadCode: resolveRoad(row.roadNameRaw)?.rzdCode ?? null,
  }));

  let inserted = 0;
  for (const batch of chunk(stationValues, CHUNK_SIZE)) {
    await db.insert(stations).values(batch).onConflictDoNothing({ target: stations.esrCode });
    inserted += batch.length;
    console.log(`  …stations processed ${inserted}/${stationValues.length}`);
  }
  console.log(`✓ Stations processed (${stationValues.length} unique ESR codes).`);
}

async function seedAliases(rows: StationRow[]): Promise<void> {
  // alias_normalized is UNIQUE — dedupe within input to avoid intra-batch clashes.
  const byNorm = new Map<string, StationRow>();
  for (const row of rows) {
    const norm = normalizeStationName(row.name);
    if (norm && !byNorm.has(norm)) byNorm.set(norm, row);
  }

  const aliasValues = [...byNorm.entries()].map(([norm, row]) => ({
    esrCode: row.esr6,
    alias: row.name,
    aliasNormalized: norm,
    source: "report" as const,
    confidence: "1.0",
  }));

  let inserted = 0;
  for (const batch of chunk(aliasValues, CHUNK_SIZE)) {
    await db
      .insert(stationAliases)
      .values(batch)
      .onConflictDoNothing({ target: stationAliases.aliasNormalized });
    inserted += batch.length;
    console.log(`  …aliases processed ${inserted}/${aliasValues.length}`);
  }
  console.log(`✓ Aliases processed (${aliasValues.length} unique normalized names).`);
}

// ── Distance-graph seeding (TARIFF_CALCULATOR §3.2 / §4.1, Phase 1) ───────────
// Parse field[4] of every CSV row into the tp_node set (rows flagged 'ТП') and
// the tariff_edges 'spur' layer (radial Name-km edges). Spur targets are NAMES;
// resolve them to ESR via a normalized-name → ESR index built from the seeded
// station dictionary (offline, no per-row DB roundtrip). Homonyms prefer the
// ТП-flagged ESR. Unresolved targets are skipped and counted (a warning), never
// fabricated. Idempotent via ON CONFLICT DO NOTHING.

/**
 * Builds a normalized-name → ESR index for resolving spur target names. When a
 * normalized name maps to multiple ESR codes (CONFIRMED ~280 homonyms), the
 * ТП-flagged row wins — that matches «prefer the ТП-flagged row» tie-break.
 * Non-ТП names keep their first-seen ESR (deterministic by input order).
 */
function buildNameIndex(rows: readonly StationRow[]): Map<string, string> {
  const tpEsrByName = new Map<string, string>();
  const anyEsrByName = new Map<string, string>();

  for (const row of rows) {
    const norm = normalizeStationName(row.name);
    if (!norm) continue;
    if (!anyEsrByName.has(norm)) anyEsrByName.set(norm, row.esr6);

    const field = parseTransitField(row.transitRaw);
    if (field.kind === "tp" && !tpEsrByName.has(norm)) {
      tpEsrByName.set(norm, row.esr6);
    }
  }

  // ТП-flagged ESR overrides the first-seen ESR for homonym tie-break.
  return new Map([...anyEsrByName, ...tpEsrByName]);
}

async function seedTpNodes(rows: readonly StationRow[]): Promise<void> {
  const byEsr = new Map<string, { esrCode: string; name: string }>();
  for (const row of rows) {
    if (parseTransitField(row.transitRaw).kind !== "tp") continue;
    if (!byEsr.has(row.esr6)) byEsr.set(row.esr6, { esrCode: row.esr6, name: row.name });
  }

  const values = [...byEsr.values()];
  if (values.length === 0) {
    console.warn("⚠ No 'ТП'-flagged rows found in field[4] — tp_node seed skipped.");
    return;
  }

  let inserted = 0;
  for (const batch of chunk(values, CHUNK_SIZE)) {
    await db.insert(tpNode).values(batch).onConflictDoNothing({ target: tpNode.esrCode });
    inserted += batch.length;
    console.log(`  …tp_node processed ${inserted}/${values.length}`);
  }
  console.log(`✓ Transit points processed (${values.length} ТП nodes).`);
}

async function seedSpurEdges(rows: readonly StationRow[]): Promise<void> {
  const nameIndex = buildNameIndex(rows);

  // Dedupe edges within input so a batch never conflicts with itself; the PK is
  // (from_esr, to_esr, layer), so the same ordered pair appears once.
  const edgeByKey = new Map<string, { fromEsr: string; toEsr: string; km: number; layer: "spur" }>();
  let unresolved = 0;
  let selfLoops = 0;
  let totalTokens = 0;

  for (const row of rows) {
    const field = parseTransitField(row.transitRaw);
    if (field.kind !== "spurs") continue;

    for (const spur of field.spurs) {
      totalTokens += 1;
      const toEsr = nameIndex.get(spur.name);
      if (!toEsr) {
        unresolved += 1;
        continue; // never fabricate a target ESR — skip + count
      }
      if (toEsr === row.esr6) {
        selfLoops += 1; // own-ТП '-0' style self reference — not an edge
        continue;
      }
      const key = `${row.esr6}|${toEsr}`;
      if (!edgeByKey.has(key)) {
        edgeByKey.set(key, { fromEsr: row.esr6, toEsr, km: spur.km, layer: "spur" });
      }
    }
  }

  const values = [...edgeByKey.values()];
  if (values.length === 0) {
    console.warn("⚠ No resolvable spur edges parsed from field[4] — spur seed skipped.");
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
    console.log(`  …spur edges processed ${inserted}/${values.length}`);
  }
  console.log(
    `✓ Spur edges processed (${values.length} unique edges from ${totalTokens} tokens; ` +
      `${unresolved} unresolved names, ${selfLoops} self/own-ТП refs skipped).`,
  );
}

async function main(): Promise<void> {
  console.log("Seeding GEO dictionaries…");

  const rfRows = parseStationFile(RF_FILE, ";", true);
  const cisRows = parseStationFile(CIS_FILE, ",", false);
  const allRows = [...rfRows, ...cisRows];
  console.log(`Parsed ${rfRows.length} RF + ${cisRows.length} CIS = ${allRows.length} rows.`);

  await seedRoads();
  await seedStations(allRows);
  await seedAliases(allRows);

  console.log("Seeding distance graph (spur layer + ТП nodes)…");
  await seedTpNodes(allRows);
  await seedSpurEdges(allRows);

  console.log("✓ GEO seed complete.");
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
