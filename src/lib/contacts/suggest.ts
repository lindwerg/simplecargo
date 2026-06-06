// Address autosuggest from mail history (MAIL_AI_INTEGRATION §6.5). Prefix search
// over known_email_contacts — every address ever seen in our mail.ru correspondence,
// even before a counterparty is created. Sorted by recency + frequency.

import { desc, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { knownEmailContacts } from "@/lib/db/schema/knownEmailContacts";

export interface EmailSuggestion {
  email: string;
  displayName: string | null;
  counterpartyId: string | null;
  isLinked: boolean; // already attached to a company
}

const MAX_LIMIT = 20;

export async function suggestEmailContacts(
  query: string,
  limit = 8,
): Promise<EmailSuggestion[]> {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  // prefix match on the functional lower() index (idx_known_email_prefix)
  const pattern = `${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;

  const rows = await db
    .select({
      email: knownEmailContacts.emailLower,
      displayName: knownEmailContacts.displayNameLast,
      counterpartyId: knownEmailContacts.counterpartyId,
      seenIncoming: knownEmailContacts.seenIncoming,
      seenOutgoing: knownEmailContacts.seenOutgoing,
    })
    .from(knownEmailContacts)
    .where(sql`lower(${knownEmailContacts.emailLower}) LIKE ${pattern}`)
    .orderBy(
      desc(knownEmailContacts.lastSeenAt),
      desc(sql`${knownEmailContacts.seenIncoming} + ${knownEmailContacts.seenOutgoing}`),
    )
    .limit(safeLimit);

  return rows.map((r) => ({
    email: r.email,
    displayName: r.displayName,
    counterpartyId: r.counterpartyId,
    isLinked: r.counterpartyId !== null,
  }));
}
