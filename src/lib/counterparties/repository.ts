import { asc, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { normalizeQuery, parseThreshold, type CounterpartyMatch } from "./search";

export type { CounterpartyMatch } from "./search";

export interface CounterpartyOption {
  id: string;
  name: string;
  roles: string[];
}

// Lightweight list for the client picker (intake). Small table; no pagination needed yet.
export async function listCounterparties(): Promise<CounterpartyOption[]> {
  const rows = await db
    .select({
      id: counterparties.id,
      name: counterparties.nameCanonical,
      roles: counterparties.roles,
    })
    .from(counterparties)
    .orderBy(asc(counterparties.nameCanonical))
    .limit(500);
  return rows.map((r) => ({ id: r.id, name: r.name, roles: r.roles ?? [] }));
}

interface SearchRow {
  id: string;
  name: string;
  roles: string[] | null;
  score: number;
  [column: string]: unknown;
}

// Fuzzy match a dictated/typed client name against canonical names AND every raw
// variant we've recorded (self-trained aliases). Score is the best trigram
// similarity across both, leaning on the GIN index idx_counterparty_name_trgm.
// Returns ranked candidates so the UI can ask "это они?".
export async function searchCounterparties(
  q: string,
  limit = 5,
): Promise<CounterpartyMatch[]> {
  const normalized = normalizeQuery(q);
  if (normalized === "") return [];

  const threshold = parseThreshold(process.env.COUNTERPARTY_SIMILARITY_THRESHOLD);

  const result = await db.execute<SearchRow>(sql`
    SELECT
      id,
      name_canonical AS name,
      roles,
      greatest(
        similarity(name_canonical, ${normalized}),
        coalesce(
          (SELECT max(similarity(v, ${normalized}))
             FROM unnest(name_raw_variants) AS v),
          0
        )
      ) AS score
    FROM counterparties
    WHERE greatest(
      similarity(name_canonical, ${normalized}),
      coalesce(
        (SELECT max(similarity(v, ${normalized}))
           FROM unnest(name_raw_variants) AS v),
        0
      )
    ) > ${threshold}
    ORDER BY score DESC
    LIMIT ${limit}
  `);

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    roles: r.roles ?? [],
    score: Number(r.score),
  }));
}

// Record a newly-seen raw spelling for a counterparty (self-training): when the
// operator confirms a fuzzy match, we append the dictated variant so the next
// near-miss scores higher. Immutable append in SQL; no-op if already present.
export async function addNameVariant(id: string, rawVariant: string): Promise<void> {
  const variant = normalizeQuery(rawVariant);
  if (variant === "") return;

  await db.execute(sql`
    UPDATE counterparties
    SET name_raw_variants = array_append(
      coalesce(name_raw_variants, ARRAY[]::text[]),
      ${variant}
    )
    WHERE id = ${id}
      AND (
        name_raw_variants IS NULL
        OR NOT (name_raw_variants @> ARRAY[${variant}]::text[])
      )
  `);
}
