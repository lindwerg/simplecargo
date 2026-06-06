// Upsert addresses into the known_email_contacts directory (MAIL_AI_INTEGRATION
// §6.5) — every From/To/Cc seen in correspondence, powering the autosuggest. If
// the address already resolves to a company, stamp the link.

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { knownEmailContacts } from "@/lib/db/schema/knownEmailContacts";
import { resolveCounterpartyByEmail } from "@/lib/partners/repository";

export interface SeenAddress {
  email: string;
  name?: string | null;
  direction: "incoming" | "outgoing";
  subject?: string | null;
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export async function upsertKnownEmail(addr: SeenAddress): Promise<void> {
  const emailLower = normalize(addr.email);
  if (emailLower === "" || !emailLower.includes("@")) return;

  const counterpartyId = await resolveCounterpartyByEmail(emailLower);
  const incInc = addr.direction === "incoming" ? 1 : 0;
  const incOut = addr.direction === "outgoing" ? 1 : 0;

  await db
    .insert(knownEmailContacts)
    .values({
      emailLower,
      displayNameLast: addr.name ?? null,
      lastSubject: addr.subject ?? null,
      seenIncoming: incInc,
      seenOutgoing: incOut,
      counterpartyId: counterpartyId ?? null,
    })
    .onConflictDoUpdate({
      target: knownEmailContacts.emailLower,
      set: {
        displayNameLast: sql`COALESCE(${addr.name ?? null}, ${knownEmailContacts.displayNameLast})`,
        lastSubject: sql`COALESCE(${addr.subject ?? null}, ${knownEmailContacts.lastSubject})`,
        seenIncoming: sql`${knownEmailContacts.seenIncoming} + ${incInc}`,
        seenOutgoing: sql`${knownEmailContacts.seenOutgoing} + ${incOut}`,
        lastSeenAt: sql`now()`,
        updatedAt: sql`now()`,
        // keep an existing link; fill it if we just resolved one
        counterpartyId: sql`COALESCE(${knownEmailContacts.counterpartyId}, ${counterpartyId ?? null})`,
      },
    });
}

export async function upsertKnownEmails(addrs: SeenAddress[]): Promise<void> {
  for (const a of addrs) {
    await upsertKnownEmail(a);
  }
}
