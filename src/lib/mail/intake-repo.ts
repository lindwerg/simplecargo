// Real persistence + dependency wiring for the mail-intake orchestrator
// (MAIL_AI_INTEGRATION Фаза 3). Keeps all DB writes here so the orchestrator
// stays pure-ish and unit-tested with fakes. The worker calls buildIntakeDeps().

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { ingestedFiles } from "@/lib/db/schema/ingest";
import { inboundInvoices } from "@/lib/db/schema/inboundInvoices";
import { quarantineRows } from "@/lib/db/schema/quarantine";
import { requestOwnerQuotes } from "@/lib/db/schema/requestOwnerQuotes";
import { requestLines, requests } from "@/lib/db/schema/requests";
import { createRequestWithLines } from "@/lib/requests/repository";
import { resolveSenderCompany } from "@/lib/partners/repository";
import { findCounterpartyByInn } from "@/lib/counterparties/repository";
import { classifyEmail } from "@/lib/mail-intake/classify";
import { extractFromInput } from "@/lib/requests/extraction";
import { extractInvoice } from "@/lib/mail-intake/invoice-extract";
import { extractCarrierQuote } from "@/lib/mail-intake/carrier-quote-extract";
import { attachmentToExtractInput } from "@/lib/mail-intake/to-extract-input";
import type { IntakeDeps } from "@/lib/mail-intake/ports";
import type { CarrierQuoteMatchInput, CarrierQuoteMatchResult, InvoiceSaveInput } from "@/lib/mail-intake/ports";
import type { QuarantineRowInsert } from "@/lib/mail-intake/quarantine-map";
import { publishRealtime } from "@/lib/realtime/notify";

// ── content-hash idempotency gate (ingestedFiles, sourceType 'E') ─────────────
export async function recordIngestedFile(params: {
  contentSha256: string;
  filename: string;
  senderEmail: string | null;
  messageId: string | null;
}): Promise<{ fileId: string; isNew: boolean }> {
  const inserted = await db
    .insert(ingestedFiles)
    .values({
      contentSha256: params.contentSha256,
      filename: params.filename,
      sourceType: "E",
      status: "processing",
      senderEmail: params.senderEmail,
      gmailMessageId: params.messageId,
      receivedAt: new Date(),
    })
    .onConflictDoNothing({ target: ingestedFiles.contentSha256 })
    .returning({ id: ingestedFiles.id });

  if (inserted[0]) return { fileId: inserted[0].id, isNew: true };

  const existing = await db
    .select({ id: ingestedFiles.id })
    .from(ingestedFiles)
    .where(sql`${ingestedFiles.contentSha256} = ${params.contentSha256}`)
    .limit(1);
  return { fileId: existing[0]?.id ?? "", isNew: false };
}

export async function markFileCommitted(fileId: string): Promise<void> {
  if (!fileId) return;
  await db
    .update(ingestedFiles)
    .set({ status: "committed" })
    .where(sql`${ingestedFiles.id} = ${fileId}`);
}

// A processing failure (transient LLM/DB error) must NOT silently lose the email.
// We park the file as 'quarantined' so a startup sweep / operator can revisit it
// instead of the worker advancing the cursor past a black hole.
export async function markFileQuarantined(fileId: string): Promise<void> {
  if (!fileId) return;
  await db
    .update(ingestedFiles)
    .set({ status: "quarantined" })
    .where(sql`${ingestedFiles.id} = ${fileId}`);
}

// ── inbound invoice (pending) ────────────────────────────────────────────────
function toDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
function numStr(n: number | null): string | null {
  return n == null ? null : String(n);
}

export async function saveInboundInvoice(input: InvoiceSaveInput): Promise<{ id: string }> {
  // Resolve the company on insert (сопряжение): an invoice with a NULL
  // counterpartyId is invisible under the partner and breaks debt rollups. Match
  // by ИНН now; the raw name stays for audit / later manual linking.
  const counterpartyId = await findCounterpartyByInn(input.counterpartyInn);
  const rows = await db
    .insert(inboundInvoices)
    .values({
      direction: input.direction,
      counterpartyId,
      counterpartyInn: input.counterpartyInn,
      counterpartyNameRaw: input.counterpartyNameRaw,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: toDate(input.invoiceDate),
      dueDate: toDate(input.dueDate),
      amountTotal: numStr(input.amountTotal),
      vatAmount: numStr(input.vatAmount),
      currency: input.currency,
      purposeRaw: input.purposeRaw,
      status: input.status,
      sourceFileId: input.sourceFileId,
      extractedText: input.extractedText,
    })
    .returning({ id: inboundInvoices.id });
  return { id: rows[0].id };
}

// ── quarantine row ───────────────────────────────────────────────────────────
export async function insertQuarantineRow(
  row: QuarantineRowInsert,
): Promise<{ id: number }> {
  const rows = await db
    .insert(quarantineRows)
    .values({
      sourceFileId: row.sourceFileId,
      tier: row.tier,
      severity: row.severity,
      ruleId: row.ruleId,
      reasonCode: row.reasonCode,
      agentReason: row.agentReason,
      rawRowJson: row.rawRowJson,
    })
    .returning({ id: quarantineRows.id });
  return { id: rows[0].id };
}

// ── carrier quote → close the sourcing loop ──────────────────────────────────
// Attach an inbound carrier reply to the polled request_owner_quotes rows it
// answers. Priority: (1) RFC thread — the reply's In-Reply-To/References match
// the outbound RFQ's Message-ID we stored in sourceMessageId; (2) fallback — the
// extracted R-номер + the resolved sender (owner), so we never touch a sibling
// carrier's row. No identifiable target → matched:false (caller quarantines).
export async function matchCarrierQuote(
  input: CarrierQuoteMatchInput,
): Promise<CarrierQuoteMatchResult> {
  let candidates: { id: string; requestId: string }[] = [];

  if (input.threadRefs.length > 0) {
    candidates = await db
      .select({ id: requestOwnerQuotes.id, requestId: requestLines.requestId })
      .from(requestOwnerQuotes)
      .innerJoin(requestLines, eq(requestOwnerQuotes.requestLineId, requestLines.id))
      .where(
        and(
          inArray(requestOwnerQuotes.sourceMessageId, input.threadRefs),
          eq(requestOwnerQuotes.status, "polled"),
        ),
      );
  }

  if (candidates.length === 0 && input.ourRequestRef && input.senderCompanyId) {
    candidates = await db
      .select({ id: requestOwnerQuotes.id, requestId: requestLines.requestId })
      .from(requestOwnerQuotes)
      .innerJoin(requestLines, eq(requestOwnerQuotes.requestLineId, requestLines.id))
      .innerJoin(requests, eq(requestLines.requestId, requests.id))
      .where(
        and(
          eq(requests.requestNumber, input.ourRequestRef),
          eq(requestOwnerQuotes.ownerId, input.senderCompanyId),
          eq(requestOwnerQuotes.status, "polled"),
        ),
      );
  }

  if (candidates.length === 0) {
    return { matched: false, updatedCount: 0, requestId: null };
  }

  const ids = candidates.map((c) => c.id);
  const note = `[ответ ${input.replyMessageId}${input.validTo ? `, срок ${input.validTo}` : ""}]`;
  await db
    .update(requestOwnerQuotes)
    .set({
      status: "responded",
      costPerWagon: input.costPerWagon == null ? null : String(input.costPerWagon),
      wagonsOffered: input.wagonsOffered,
      respondedAt: new Date(),
      updatedAt: new Date(),
      notes: sql`coalesce(${requestOwnerQuotes.notes}, '') || ${note}`,
    })
    .where(inArray(requestOwnerQuotes.id, ids));

  return { matched: true, updatedCount: ids.length, requestId: candidates[0].requestId };
}

// ── system user (createRequestWithLines needs a valid users.id FK) ───────────
export async function resolveSystemUserId(): Promise<string> {
  const rows = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
  if (!rows[0]) throw new Error("Нет ни одного пользователя — некому приписать ИИ-заявки");
  return rows[0].id;
}

// ── deps wiring (ports publish realtime after each write) ─────────────────────
export function buildIntakeDeps(opts: {
  systemUserId: string;
  sourceFileId: string | null;
}): IntakeDeps {
  return {
    classify: classifyEmail,
    extractRequest: extractFromInput,
    extractInvoice,
    extractCarrierQuote,
    resolveSender: resolveSenderCompany,
    convertAttachment: attachmentToExtractInput,
    ports: {
      systemUserId: opts.systemUserId,
      sourceFileId: opts.sourceFileId,
      async createRequest(input, userId) {
        const res = await createRequestWithLines(input, userId);
        await publishRealtime({ kind: "request", id: res.id });
        return res;
      },
      async saveInvoice(input) {
        const res = await saveInboundInvoice(input);
        await publishRealtime({ kind: "invoice", id: res.id });
        return res;
      },
      async quarantine(row) {
        const res = await insertQuarantineRow(row);
        await publishRealtime({ kind: "quarantine" });
        return res;
      },
      async matchCarrierQuote(matchInput) {
        const res = await matchCarrierQuote(matchInput);
        if (res.matched && res.requestId) {
          await publishRealtime({ kind: "request", id: res.requestId });
        }
        return res;
      },
    },
  };
}
