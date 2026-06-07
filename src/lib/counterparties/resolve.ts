import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Shared counterparty input shape (mirrors counterpartyInputSchema): explicit id, or
// a name (+ optional inn) for inline find-or-create.
export type CounterpartyInput = { id: string } | { name: string; inn?: string | undefined };

// Commercial role implied by where the party is being attached.
export type CounterpartyRole = "owner" | "client" | "quarry";

// Resolve a counterparty: explicit id wins; otherwise find-or-create by canonical name
// (operator inline-create), recording the implied commercial role. Mirrors the ПСЦ idiom
// shared by directions/requests/pricing repositories.
export async function resolveCounterpartyId(
  tx: Tx,
  input: CounterpartyInput,
  role: CounterpartyRole,
): Promise<string> {
  if ("id" in input) return input.id;

  const name = input.name.trim();
  const existing = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.nameCanonical, name))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const created = await tx
    .insert(counterparties)
    .values({ nameCanonical: name, inn: input.inn, roles: [role] })
    .returning({ id: counterparties.id });
  return created[0].id;
}
