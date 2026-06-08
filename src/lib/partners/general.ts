// "Общая информация" tab data: bank payments auto-matched to the partner by ИНН
// (Tochka ↔ counterparty), and e-mail addresses bound to the partner by hand
// (operator decision: payments auto by ИНН, mail bound manually). Both surfaces
// reuse existing infrastructure — bank_transactions.counterparty_inn and the
// counterparty_contacts.email resolution path the inbound-mail flow already keys on.

import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { counterpartyContacts } from "@/lib/db/schema/counterpartyContacts";
import { knownEmailContacts } from "@/lib/db/schema/knownEmailContacts";
import { normalizeEmail } from "./schema";
import { PartnerError } from "./repository";

const PAYMENTS_LIMIT = 50;
const LETTERS_LIMIT = 30;

// ── Платежи (авто-привязка по ИНН) ─────────────────────────────────────────

export interface PartnerPayment {
  id: string;
  direction: "in" | "out";
  amount: number;
  postedAt: Date;
  purposeRaw: string | null;
  counterpartyName: string | null;
}

export interface PartnerFinance {
  inn: string | null;
  totalIn: number;
  totalOut: number;
  count: number;
  lastPaymentAt: Date | null;
  payments: PartnerPayment[];
}

interface PaymentRow {
  id: string;
  direction: string;
  amount: string;
  posted_at: Date;
  purpose_raw: string | null;
  counterparty_name: string | null;
  [column: string]: unknown;
}

interface FinanceTotalsRow {
  total_in: string | null;
  total_out: string | null;
  cnt: number;
  last_posted_at: Date | null;
  [column: string]: unknown;
}

// All Tochka operations whose payer/payee ИНН equals the partner's ИНН. No ИНН →
// nothing to match on (the UI warns the operator to fill it in).
export async function getPartnerFinance(partnerId: string): Promise<PartnerFinance> {
  const partner = await db
    .select({ inn: counterparties.inn })
    .from(counterparties)
    .where(eq(counterparties.id, partnerId))
    .limit(1);
  if (!partner[0]) throw new PartnerError(404, "Компания не найдена");

  const inn = partner[0].inn;
  if (!inn) {
    return { inn: null, totalIn: 0, totalOut: 0, count: 0, lastPaymentAt: null, payments: [] };
  }

  const [totalsResult, paymentsResult] = await Promise.all([
    db.execute<FinanceTotalsRow>(sql`
      SELECT
        COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0)::text  AS total_in,
        COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0)::text AS total_out,
        count(*)::int AS cnt,
        max(posted_at) AS last_posted_at
      FROM bank_transactions
      WHERE counterparty_inn = ${inn}
    `),
    db.execute<PaymentRow>(sql`
      SELECT id, direction, amount::text AS amount, posted_at, purpose_raw, counterparty_name
      FROM bank_transactions
      WHERE counterparty_inn = ${inn}
      ORDER BY posted_at DESC
      LIMIT ${PAYMENTS_LIMIT}
    `),
  ]);

  const totals = totalsResult.rows[0];
  return {
    inn,
    totalIn: Number(totals?.total_in ?? 0),
    totalOut: Number(totals?.total_out ?? 0),
    count: totals?.cnt ?? 0,
    lastPaymentAt: totals?.last_posted_at ?? null,
    payments: paymentsResult.rows.map((r) => ({
      id: r.id,
      direction: r.direction === "out" ? "out" : "in",
      amount: Number(r.amount),
      postedAt: r.posted_at,
      purposeRaw: r.purpose_raw,
      counterpartyName: r.counterparty_name,
    })),
  };
}

// ── Почта (ручная привязка) ────────────────────────────────────────────────

export interface BoundEmail {
  email: string;
  /** From a named contact (managed in «Контакты») vs an email-only manual binding. */
  fromNamedContact: boolean;
  lettersCount: number;
  lastLetterAt: Date | null;
}

export interface PartnerLetter {
  id: string;
  subject: string;
  senderEmail: string | null;
  kind: string | null;
  receivedAt: Date | null;
  bodyPreview: string | null;
}

export interface PartnerMail {
  boundEmails: BoundEmail[];
  letters: PartnerLetter[];
}

interface BoundEmailRow {
  email: string;
  from_named: boolean;
  letters_count: number;
  last_letter_at: Date | null;
  [column: string]: unknown;
}

interface LetterRow {
  id: string;
  filename: string;
  sender_email: string | null;
  kind: string | null;
  received_at: Date | null;
  body_preview: string | null;
  [column: string]: unknown;
}

export async function listPartnerMail(partnerId: string): Promise<PartnerMail> {
  // Distinct e-mail addresses tied to this partner via contacts. A named contact
  // (full_name present) is managed in «Контакты» and shown read-only here; an
  // email-only row is a manual binding the operator can remove from this panel.
  const boundResult = await db.execute<BoundEmailRow>(sql`
    WITH partner_emails AS (
      SELECT
        lower(email) AS email,
        bool_or(full_name IS NOT NULL AND btrim(full_name) <> '') AS from_named
      FROM counterparty_contacts
      WHERE counterparty_id = ${partnerId}
        AND email IS NOT NULL AND btrim(email) <> ''
      GROUP BY lower(email)
    )
    SELECT
      pe.email,
      pe.from_named,
      (SELECT count(*)::int FROM ingested_files f WHERE lower(f.sender_email) = pe.email) AS letters_count,
      (SELECT max(f.received_at) FROM ingested_files f WHERE lower(f.sender_email) = pe.email) AS last_letter_at
    FROM partner_emails pe
    ORDER BY pe.email ASC
  `);

  const emails = boundResult.rows.map((r) => r.email);

  let letters: PartnerLetter[] = [];
  if (emails.length > 0) {
    const lettersResult = await db.execute<LetterRow>(sql`
      SELECT id, filename, sender_email, kind, received_at, body_preview
      FROM ingested_files
      WHERE lower(sender_email) = ANY(${emails})
      ORDER BY received_at DESC NULLS LAST, ingested_at DESC
      LIMIT ${LETTERS_LIMIT}
    `);
    letters = lettersResult.rows.map((r) => ({
      id: r.id,
      subject: r.filename,
      senderEmail: r.sender_email,
      kind: r.kind,
      receivedAt: r.received_at,
      bodyPreview: r.body_preview,
    }));
  }

  return {
    boundEmails: boundResult.rows.map((r) => ({
      email: r.email,
      fromNamedContact: r.from_named,
      lettersCount: r.letters_count,
      lastLetterAt: r.last_letter_at,
    })),
    letters,
  };
}

// Manual binding: register the address as an email-only contact (the resolution
// source the inbound-mail flow keys on, via resolveSenderCompany) and stamp the
// known-emails cache so future correspondence auto-resolves to this partner.
export async function bindPartnerEmail(partnerId: string, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (email === "" || !email.includes("@")) {
    throw new PartnerError(422, "Некорректный адрес почты");
  }

  const partner = await db
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.id, partnerId))
    .limit(1);
  if (!partner[0]) throw new PartnerError(404, "Компания не найдена");

  const existing = await db
    .select({ id: counterpartyContacts.id })
    .from(counterpartyContacts)
    .where(
      and(
        eq(counterpartyContacts.counterpartyId, partnerId),
        sql`lower(${counterpartyContacts.email}) = ${email}`,
      ),
    )
    .limit(1);

  if (!existing[0]) {
    await db.insert(counterpartyContacts).values({ counterpartyId: partnerId, email });
  }

  await db
    .insert(knownEmailContacts)
    .values({ emailLower: email, counterpartyId: partnerId })
    .onConflictDoUpdate({
      target: knownEmailContacts.emailLower,
      set: { counterpartyId: partnerId, updatedAt: sql`now()` },
    });
}

// Unbind only removes the email-only binding — a named contact is left intact
// (manage those in «Контакты»). Also clears the known-emails cache link.
export async function unbindPartnerEmail(partnerId: string, rawEmail: string): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (email === "") throw new PartnerError(422, "Некорректный адрес почты");

  await db
    .delete(counterpartyContacts)
    .where(
      and(
        eq(counterpartyContacts.counterpartyId, partnerId),
        sql`lower(${counterpartyContacts.email}) = ${email}`,
        isNull(counterpartyContacts.fullName),
      ),
    );

  await db
    .update(knownEmailContacts)
    .set({ counterpartyId: null, updatedAt: sql`now()` })
    .where(
      and(
        eq(knownEmailContacts.emailLower, email),
        eq(knownEmailContacts.counterpartyId, partnerId),
      ),
    );
}
