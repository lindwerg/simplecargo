import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { tariffIndexations, tariffRates } from "@/lib/db/schema/tariffs";
import { applyIndexations, type IndexationLike } from "./resolve";
import type { IndexationInput, TariffRateInput } from "./schema";

const DEFAULT_TARIFF_REF = "10-01";

type RememberedTariff = {
  baseAmount: number;
  effectiveFrom: Date | null;
  freightClass: number | null;
  vatInclusive: string;
  id: string;
};

type IndexationRow = IndexationLike & { label: string; id: string };

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ── findRememberedTariff — the "auto-substitute on repeat route" lookup ──────────
// Match origin+dest case-insensitively. Prefer rows whose wagonType and freightClass
// equal the args, treating NULLs in the row as wildcards (a row that didn't pin a
// wagon type/class still matches, just ranks lower). Newest base wins.
export async function findRememberedTariff(args: {
  originRaw: string;
  destRaw: string;
  wagonType?: string | null;
  freightClass?: number | null;
}): Promise<RememberedTariff | null> {
  const wagon = args.wagonType ?? null;
  const klass = args.freightClass ?? null;

  // Exact-match-first ranking: a row that pins the requested wagon/class outranks a
  // wildcard (NULL) row, which in turn outranks any non-matching value (filtered out).
  const wagonRank = sql<number>`CASE
    WHEN ${tariffRates.wagonType} IS NULL THEN 1
    WHEN lower(${tariffRates.wagonType}) = lower(${wagon}) THEN 2
    ELSE 0 END`;
  const classRank = sql<number>`CASE
    WHEN ${tariffRates.freightClass} IS NULL THEN 1
    WHEN ${tariffRates.freightClass} = ${klass} THEN 2
    ELSE 0 END`;

  const rows = await db
    .select({
      id: tariffRates.id,
      baseAmount: tariffRates.baseAmount,
      effectiveFrom: tariffRates.effectiveFrom,
      freightClass: tariffRates.freightClass,
      vatInclusive: tariffRates.vatInclusive,
    })
    .from(tariffRates)
    .where(
      and(
        sql`lower(${tariffRates.originRaw}) = lower(${args.originRaw})`,
        sql`lower(${tariffRates.destRaw}) = lower(${args.destRaw})`,
        // Keep only rows that match the wagon type (or are wildcard NULL).
        sql`(${tariffRates.wagonType} IS NULL OR lower(${tariffRates.wagonType}) = lower(${wagon}))`,
        // Keep only rows that match the freight class (or are wildcard NULL).
        sql`(${tariffRates.freightClass} IS NULL OR ${tariffRates.freightClass} = ${klass})`,
      ),
    )
    .orderBy(
      sql`(${wagonRank} + ${classRank}) DESC`,
      sql`${tariffRates.effectiveFrom} DESC NULLS LAST`,
      sql`${tariffRates.createdAt} DESC`,
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    baseAmount: Number(row.baseAmount),
    effectiveFrom: row.effectiveFrom,
    freightClass: row.freightClass,
    vatInclusive: row.vatInclusive,
  };
}

// ── saveTariff — remember a РЖД base for a route ─────────────────────────────────
export async function saveTariff(
  input: TariffRateInput,
  userId: string,
): Promise<{ id: string }> {
  const inserted = await db
    .insert(tariffRates)
    .values({
      originRaw: input.originRaw,
      destRaw: input.destRaw,
      wagonType: input.wagonType ?? null,
      freightClass: input.freightClass ?? null,
      etsngCode: input.etsngCode ?? null,
      baseAmount: String(input.baseAmount),
      vatInclusive: input.vatInclusive,
      effectiveFrom: toDate(input.effectiveFrom),
      tariffRef: input.tariffRef,
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning({ id: tariffRates.id });

  return { id: inserted[0].id };
}

// ── listIndexations — every recorded РЖД increase for a tariff ref, oldest first ──
export async function listIndexations(
  tariffRef: string = DEFAULT_TARIFF_REF,
): Promise<IndexationRow[]> {
  const rows = await db
    .select({
      id: tariffIndexations.id,
      label: tariffIndexations.label,
      pct: tariffIndexations.pct,
      effectiveFrom: tariffIndexations.effectiveFrom,
      appliesToClass: tariffIndexations.appliesToClass,
    })
    .from(tariffIndexations)
    .where(eq(tariffIndexations.tariffRef, tariffRef))
    .orderBy(asc(tariffIndexations.effectiveFrom));

  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    pct: Number(r.pct),
    effectiveFrom: r.effectiveFrom,
    appliesToClass: r.appliesToClass === null ? null : Number(r.appliesToClass),
  }));
}

// ── createIndexation — record a one-time РЖД % increase ──────────────────────────
export async function createIndexation(
  input: IndexationInput,
  userId: string,
): Promise<{ id: string }> {
  const effectiveFrom = toDate(input.effectiveFrom);
  if (effectiveFrom === null) {
    throw new Error("Некорректная дата вступления индексации в силу");
  }

  const inserted = await db
    .insert(tariffIndexations)
    .values({
      label: input.label,
      pct: String(input.pct),
      effectiveFrom,
      appliesToClass: input.appliesToClass ?? null,
      tariffRef: input.tariffRef,
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning({ id: tariffIndexations.id });

  return { id: inserted[0].id };
}

// ── resolveCurrentTariff — auto-substitute entry point for a repeat route ─────────
// findRememberedTariff → listIndexations → applyIndexations. Returns the un-indexed
// base alongside the indexed current ₽ so callers can show both. onDate defaults to now.
export async function resolveCurrentTariff(args: {
  originRaw: string;
  destRaw: string;
  wagonType?: string | null;
  freightClass?: number | null;
  onDate?: Date;
}): Promise<{ base: number; indexed: number; tariffId: string } | null> {
  const remembered = await findRememberedTariff(args);
  if (!remembered) return null;

  const onDate = args.onDate ?? new Date();
  const freightClass = args.freightClass ?? remembered.freightClass;
  const indexations = await listIndexations();

  const indexed = applyIndexations(
    remembered.baseAmount,
    remembered.effectiveFrom,
    indexations,
    onDate,
    freightClass,
  );

  return { base: remembered.baseAmount, indexed, tariffId: remembered.id };
}
