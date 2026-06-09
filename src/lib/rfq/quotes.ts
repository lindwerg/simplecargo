// Читающая + решающая сторона опроса перевозчиков (request_owner_quotes).
// До этого таблицу только писали (sendRfqToCarriers / matchCarrierQuote) — ответ
// перевозчика со ставкой был невидим оператору. Здесь:
//   • listOwnerQuotesForRequest — все опросы по строкам запроса (блок на карточке);
//   • decideOwnerQuote — «Принять ставку» / «Отклонить» (accepted/declined);
//   • attachQuarantinedQuote — ручная привязка карантинного ответа
//     (CARRIER_QUOTE_MANUAL) к запросу: upsert котировок + резолв карантин-ряда
//     (НОВАЯ функция, resolveQuarantine не трогаем).
//
// ВАЖНО: в request_lines НЕТ поля закупочной ставки (targetRatePerWagon — это
// ЖЕЛАЕМАЯ ставка клиента, D16, не закупка у перевозчика). Поэтому «Принять
// ставку» меняет ТОЛЬКО статус котировки — перенос ставки в строку запроса
// станет возможен, когда появится поле закупки (cost-stack из RS §5.4).

import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { quarantineRows } from "@/lib/db/schema/quarantine";
import { requestOwnerQuotes } from "@/lib/db/schema/requestOwnerQuotes";
import { requestLines } from "@/lib/db/schema/requests";
import { resolveSenderCompany } from "@/lib/partners/repository";
import { publishRealtime } from "@/lib/realtime/notify";
import {
  canDecideQuote,
  parseQuoteDraft,
  planQuoteUpsert,
  type OwnerQuoteDecision,
} from "@/lib/rfq/quote-logic";

// чистая логика живёт в quote-logic.ts (тестируется без БД) — реэкспорт для API
export {
  canDecideQuote,
  parseQuoteDraft,
  planQuoteUpsert,
  type ExistingQuoteRow,
  type OwnerQuoteDecision,
  type QuoteDraft,
  type QuoteUpsertPlan,
} from "@/lib/rfq/quote-logic";

export class OwnerQuoteError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "OwnerQuoteError";
  }
}

// ── чтение: опросы по запросу ────────────────────────────────────────────────

export interface OwnerQuoteView {
  id: string;
  requestLineId: string;
  lineLabel: string; // "Качканар → Дёма"
  carrierName: string;
  status: string; // polled | responded | declined | accepted | expired
  costPerWagon: number | null;
  wagonsOffered: number | null;
  polledAt: string | null; // ISO
  respondedAt: string | null; // ISO
  notes: string | null;
}

function iso(d: Date | null): string | null {
  return d instanceof Date ? d.toISOString() : null;
}

/** Все опросы перевозчиков по строкам запроса — кто опрошен, когда, ответил ли,
 *  какая ставка. Питает блок «Ставки перевозчиков» на карточке запроса. */
export async function listOwnerQuotesForRequest(requestId: string): Promise<OwnerQuoteView[]> {
  const rows = await db
    .select({
      id: requestOwnerQuotes.id,
      requestLineId: requestOwnerQuotes.requestLineId,
      originRaw: requestLines.originRaw,
      destRaw: requestLines.destRaw,
      sortOrder: requestLines.sortOrder,
      carrierName: counterparties.nameCanonical,
      status: requestOwnerQuotes.status,
      costPerWagon: requestOwnerQuotes.costPerWagon,
      wagonsOffered: requestOwnerQuotes.wagonsOffered,
      polledAt: requestOwnerQuotes.polledAt,
      respondedAt: requestOwnerQuotes.respondedAt,
      notes: requestOwnerQuotes.notes,
    })
    .from(requestOwnerQuotes)
    .innerJoin(requestLines, eq(requestOwnerQuotes.requestLineId, requestLines.id))
    .innerJoin(counterparties, eq(requestOwnerQuotes.ownerId, counterparties.id))
    .where(eq(requestLines.requestId, requestId))
    .orderBy(asc(requestLines.sortOrder), desc(requestOwnerQuotes.createdAt));

  return rows.map((r) => ({
    id: r.id,
    requestLineId: r.requestLineId,
    lineLabel: `${r.originRaw} → ${r.destRaw}`,
    carrierName: r.carrierName,
    status: r.status,
    costPerWagon: r.costPerWagon == null ? null : Number(r.costPerWagon),
    wagonsOffered: r.wagonsOffered,
    polledAt: iso(r.polledAt),
    respondedAt: iso(r.respondedAt),
    notes: r.notes,
  }));
}

// ── решение оператора: принять / отклонить ставку ───────────────────────────

/** «Принять ставку» / «Отклонить» на responded-ряду. Перенос ставки в строку
 *  запроса НЕ делается — в request_lines нет поля закупки (см. шапку файла). */
export async function decideOwnerQuote(
  quoteId: string,
  decision: OwnerQuoteDecision,
): Promise<{ id: string; status: string; requestId: string }> {
  const found = await db
    .select({
      id: requestOwnerQuotes.id,
      status: requestOwnerQuotes.status,
      requestId: requestLines.requestId,
    })
    .from(requestOwnerQuotes)
    .innerJoin(requestLines, eq(requestOwnerQuotes.requestLineId, requestLines.id))
    .where(eq(requestOwnerQuotes.id, quoteId))
    .limit(1);

  const quote = found[0];
  if (!quote) throw new OwnerQuoteError(404, "Котировка не найдена");

  const guard = canDecideQuote(quote.status, decision);
  if (!guard.ok) throw new OwnerQuoteError(409, guard.reason);
  if (guard.noop) return { id: quote.id, status: quote.status, requestId: quote.requestId };

  await db
    .update(requestOwnerQuotes)
    .set({ status: decision, updatedAt: new Date() })
    .where(eq(requestOwnerQuotes.id, quoteId));

  await publishRealtime({ kind: "request", id: quote.requestId });
  return { id: quote.id, status: decision, requestId: quote.requestId };
}

// ── ручная привязка карантинного ответа перевозчика ──────────────────────────

export interface AttachQuoteResult {
  updated: number;
  inserted: number;
  ownerId: string;
  requestId: string;
}

/** Ручная привязка: карантинный ответ перевозчика (CARRIER_QUOTE_MANUAL) →
 *  request_owner_quotes по строкам выбранного запроса. ownerId можно не
 *  передавать — тогда перевозчик резолвится по from-адресу письма (контакты
 *  контрагентов). Карантин-ряд резолвится здесь же, в той же транзакции —
 *  НОВЫМ кодом, resolveQuarantine не изменяется (параллельная правка). */
export async function attachQuarantinedQuote(opts: {
  quarantineId: number;
  requestId: string;
  ownerId?: string | null;
  userId: string;
}): Promise<AttachQuoteResult> {
  if (!Number.isInteger(opts.quarantineId) || opts.quarantineId <= 0) {
    throw new OwnerQuoteError(400, "Некорректный идентификатор карантина");
  }

  const qRows = await db
    .select({
      id: quarantineRows.id,
      reasonCode: quarantineRows.reasonCode,
      resolved: quarantineRows.resolved,
      rawRowJson: quarantineRows.rawRowJson,
    })
    .from(quarantineRows)
    .where(eq(quarantineRows.id, opts.quarantineId))
    .limit(1);

  const qRow = qRows[0];
  if (!qRow) throw new OwnerQuoteError(404, "Запись карантина не найдена");
  if (qRow.resolved) throw new OwnerQuoteError(409, "Запись уже разобрана");
  if (qRow.reasonCode !== "CARRIER_QUOTE_MANUAL") {
    throw new OwnerQuoteError(400, "Привязать можно только ответ перевозчика");
  }

  const draft = parseQuoteDraft(qRow.rawRowJson);
  if (!draft) throw new OwnerQuoteError(400, "В записи нет сохранённой ставки (draft.quote)");

  // перевозчик: явный выбор оператора ИЛИ авто по from-адресу письма
  let ownerId = opts.ownerId ?? null;
  if (!ownerId && draft.from) {
    const sender = await resolveSenderCompany(draft.from);
    ownerId = sender?.companyId ?? null;
  }
  if (!ownerId) {
    throw new OwnerQuoteError(
      400,
      "Перевозчик не определён по отправителю — выберите его вручную",
    );
  }

  const lines = await db
    .select({ id: requestLines.id })
    .from(requestLines)
    .where(eq(requestLines.requestId, opts.requestId))
    .orderBy(asc(requestLines.sortOrder));
  if (lines.length === 0) throw new OwnerQuoteError(404, "В запросе нет направлений");

  const lineIds = lines.map((l) => l.id);
  const existing = await db
    .select({
      id: requestOwnerQuotes.id,
      requestLineId: requestOwnerQuotes.requestLineId,
      status: requestOwnerQuotes.status,
    })
    .from(requestOwnerQuotes)
    .where(
      and(eq(requestOwnerQuotes.ownerId, ownerId), inArray(requestOwnerQuotes.requestLineId, lineIds)),
    );

  // обновляем и polled (ответ пришёл), и responded (повторная/уточнённая привязка);
  // принятые/отклонённые решения не клоббируем.
  const plan = planQuoteUpsert(lineIds, existing, { updatableStatuses: ["polled", "responded"] });

  const now = new Date();
  const note = `[привязано вручную из карантина #${opts.quarantineId}${draft.validTo ? `, срок ${draft.validTo}` : ""}]`;
  const cost = draft.costPerWagon == null ? null : String(draft.costPerWagon);

  await db.transaction(async (tx) => {
    if (plan.updateIds.length > 0) {
      await tx
        .update(requestOwnerQuotes)
        .set({
          status: "responded",
          costPerWagon: cost,
          wagonsOffered: draft.wagonsOffered,
          respondedAt: now,
          updatedAt: now,
          notes: note,
        })
        .where(inArray(requestOwnerQuotes.id, plan.updateIds));
    }
    if (plan.insertLineIds.length > 0) {
      await tx.insert(requestOwnerQuotes).values(
        plan.insertLineIds.map((lineId) => ({
          requestLineId: lineId,
          ownerId: ownerId!,
          status: "responded" as const,
          polledVia: "manual" as const,
          costPerWagon: cost,
          wagonsOffered: draft.wagonsOffered,
          respondedAt: now,
          notes: note,
        })),
      );
    }
    // резолв карантин-ряда — новым кодом, НЕ через resolveQuarantine (см. шапку)
    await tx
      .update(quarantineRows)
      .set({ resolved: true, reviewAction: "approved", resolvedBy: opts.userId, resolvedAt: now })
      .where(eq(quarantineRows.id, opts.quarantineId));
  });

  await publishRealtime({ kind: "quarantine" });
  await publishRealtime({ kind: "request", id: opts.requestId });

  return {
    updated: plan.updateIds.length,
    inserted: plan.insertLineIds.length,
    ownerId,
    requestId: opts.requestId,
  };
}
