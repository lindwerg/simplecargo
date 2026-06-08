// Seed the ЕТСНГ номенклатура → тарифный класс / МВН dictionary (TARIFF_CALCULATOR
// §4.2, Phase 3). Loads scripts/seed-data/etsng-classes.json DEFENSIVELY (logs +
// skips if absent) and upserts each position into the `etsng` table. Idempotent
// via ON CONFLICT DO NOTHING. Run:  pnpm db:seed:etsng
//
// Source shape (array of):
//   { code:"232431", name:"Щебень…", tariffClass:1, mvnRaw:"Г/П",
//     mvnByWagon:{ default:"gp" | <tons> , kr?, pv?, pl? }, groupCode?:"23" }

import { pool, db } from "@/lib/db/client";
import { etsng } from "@/lib/db/schema/etsng";
import { chunk, CHUNK_SIZE, loadJsonDefensive, runSeed } from "./_shared";

const DATA_FILE = "etsng-classes.json";
const VALID_CLASSES = new Set([1, 2, 3]);
const CODE_LENGTH = 6;
const GROUP_CODE_LENGTH = 2;

interface EtsngJsonRow {
  code?: unknown;
  name?: unknown;
  tariffClass?: unknown;
  mvnRaw?: unknown;
  mvnByWagon?: unknown;
  groupCode?: unknown;
  sourceUrl?: unknown;
}

interface EtsngInsert {
  code: string;
  name: string;
  tariffClass: number;
  mvnRaw: string | null;
  mvnByWagon: unknown;
  groupCode: string | null;
  sourceUrl: string | null;
  fetchedAt: Date;
}

/** Validates one raw JSON row into an insert shape, or null (skip + count). */
function toInsert(raw: EtsngJsonRow): EtsngInsert | null {
  const code = String(raw.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) return null; // ЕТСНГ codes are 6 digits

  const name = String(raw.name ?? "").trim();
  if (!name) return null;

  const tariffClass = Number(raw.tariffClass);
  if (!VALID_CLASSES.has(tariffClass)) return null; // schema CHECK 1..3

  const mvnRaw = raw.mvnRaw == null ? null : String(raw.mvnRaw);
  const groupCode =
    raw.groupCode == null ? code.slice(0, GROUP_CODE_LENGTH) : String(raw.groupCode).slice(0, GROUP_CODE_LENGTH);

  return {
    code: code.slice(0, CODE_LENGTH),
    name,
    tariffClass,
    mvnRaw,
    mvnByWagon: raw.mvnByWagon ?? null,
    groupCode: groupCode || null,
    sourceUrl: raw.sourceUrl == null ? null : String(raw.sourceUrl),
    fetchedAt: new Date(),
  };
}

async function main(): Promise<void> {
  const data = loadJsonDefensive<EtsngJsonRow[] | { rows?: EtsngJsonRow[] }>(DATA_FILE);
  if (data === null) return; // absent/unparseable → already warned, no crash

  const rows: EtsngJsonRow[] = Array.isArray(data) ? data : Array.isArray(data.rows) ? data.rows : [];
  if (rows.length === 0) {
    console.warn(`⚠ ${DATA_FILE} contained no rows — nothing to seed.`);
    return;
  }

  // Dedupe by code within input so a batch never conflicts with itself.
  const byCode = new Map<string, EtsngInsert>();
  let skipped = 0;
  for (const raw of rows) {
    const ins = toInsert(raw);
    if (!ins) {
      skipped += 1;
      continue;
    }
    if (!byCode.has(ins.code)) byCode.set(ins.code, ins);
  }

  const values = [...byCode.values()];
  let inserted = 0;
  for (const batch of chunk(values, CHUNK_SIZE)) {
    await db.insert(etsng).values(batch).onConflictDoNothing({ target: etsng.code });
    inserted += batch.length;
    console.log(`  …etsng processed ${inserted}/${values.length}`);
  }
  console.log(`✓ ЕТСНГ processed (${values.length} positions; ${skipped} malformed skipped).`);
}

void runSeed("ЕТСНГ class dictionary", main, () => pool.end());
