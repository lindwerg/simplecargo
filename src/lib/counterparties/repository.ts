import { asc } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";

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
