// Outbound RFQ to carriers (MAIL_AI_INTEGRATION §6.3). Reuses the existing
// owner-letter builder + SMTP mailer, and records one request_owner_quotes row
// per (line × carrier) so the operator can track who was polled. Carrier =
// owner = role `carrier` (operator decision #4).

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { requestOwnerQuotes } from "@/lib/db/schema/requestOwnerQuotes";
import { planQuoteUpsert } from "@/lib/rfq/quote-logic";
import { listContacts } from "@/lib/partners/repository";
import { getRequest } from "@/lib/requests/repository";
import { buildOwnerLetterForRequest, type OwnerLetterRoute } from "@/lib/documents/ownerLetter";
import { isEmailConfigured, sendMail } from "@/lib/mail/mailer";

export class OutreachError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 501,
    message: string,
  ) {
    super(message);
    this.name = "OutreachError";
  }
}

export interface OutreachInput {
  requestId: string;
  carrierIds: string[];
  lineIds?: string[]; // default: all lines of the request
}

export interface OutreachResult {
  sent: { carrierId: string; carrierName: string; email: string }[];
  skipped: { carrierId: string; reason: string }[];
  quotesCreated: number;
  quotesUpdated: number; // повторный RFQ — обновили существующий polled-ряд, не дубль
}

function fmtDate(d: Date | null): string | null {
  if (!d) return null;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

type RequestLineRow = Awaited<ReturnType<typeof getRequest>>["lines"][number];

function toRoute(line: RequestLineRow): OwnerLetterRoute {
  return {
    originName: line.originRaw,
    originRoad: line.originRoadRaw,
    destName: line.destRaw,
    destRoad: line.destRoadRaw,
    wagonsCount: line.wagonsRequested,
    cargoName: line.cargoName,
    rateText: line.targetRateRaw,
  };
}

async function primaryEmail(carrierId: string): Promise<string | null> {
  const contacts = await listContacts(carrierId); // primary-first ordered
  const withEmail = contacts.find((c) => c.email && c.email.trim().length > 0);
  return withEmail?.email ?? null;
}

export async function sendRfqToCarriers(
  input: OutreachInput,
): Promise<OutreachResult> {
  if (!isEmailConfigured()) {
    throw new OutreachError(501, "SMTP не настроен — отправка по почте недоступна");
  }
  if (input.carrierIds.length === 0) {
    throw new OutreachError(400, "Не выбран ни один перевозчик");
  }

  const request = await getRequest(input.requestId); // throws RequestError(404) if absent

  const selectedLines =
    input.lineIds && input.lineIds.length > 0
      ? request.lines.filter((l) => input.lineIds!.includes(l.id))
      : request.lines;

  if (selectedLines.length === 0) {
    throw new OutreachError(400, "Нет направлений для запроса");
  }

  const routes = selectedLines.map(toRoute);
  const periodFrom = fmtDate(request.periodFrom);
  const periodTo = fmtDate(request.periodTo);

  // carrier names in one query
  const carriers = await db
    .select({ id: counterparties.id, name: counterparties.nameCanonical })
    .from(counterparties)
    .where(inArray(counterparties.id, input.carrierIds));
  const nameById = new Map(carriers.map((c) => [c.id, c.name]));

  const result: OutreachResult = { sent: [], skipped: [], quotesCreated: 0, quotesUpdated: 0 };

  for (const carrierId of input.carrierIds) {
    const carrierName = nameById.get(carrierId);
    if (!carrierName) {
      result.skipped.push({ carrierId, reason: "Перевозчик не найден" });
      continue;
    }
    const email = await primaryEmail(carrierId);
    if (!email) {
      result.skipped.push({ carrierId, reason: `${carrierName}: нет e-mail в контактах` });
      continue;
    }

    const text = buildOwnerLetterForRequest({
      ownerName: carrierName,
      clientName: request.clientName,
      wagonTypeLabel: request.wagonType,
      periodFrom,
      periodTo,
      notes: request.notes,
      routes,
    });

    const subject = `Запрос ставок ${request.requestNumber ?? ""}: предоставление вагонов`.trim();
    const { messageId } = await sendMail({ to: [email], subject, text });

    // record one polled quote per selected line for this carrier. Store the REAL
    // outbound Message-ID so a carrier's reply (In-Reply-To/References) threads
    // straight back to these rows (matchCarrierQuote in intake-repo).
    //
    // Повторная отправка RFQ НЕ плодит дубли: существующий polled-ряд пары
    // (line, carrier) обновляется свежим Message-ID/polledAt; вставляются только
    // пары без единого ряда. Ряды с ответом/решением не трогаем (planQuoteUpsert).
    const lineIds = selectedLines.map((l) => l.id);
    const existing = await db
      .select({
        id: requestOwnerQuotes.id,
        requestLineId: requestOwnerQuotes.requestLineId,
        status: requestOwnerQuotes.status,
      })
      .from(requestOwnerQuotes)
      .where(
        and(
          eq(requestOwnerQuotes.ownerId, carrierId),
          inArray(requestOwnerQuotes.requestLineId, lineIds),
        ),
      );
    const plan = planQuoteUpsert(lineIds, existing, { updatableStatuses: ["polled"] });

    const polledAt = new Date();
    await db.transaction(async (tx) => {
      if (plan.updateIds.length > 0) {
        await tx
          .update(requestOwnerQuotes)
          .set({ sourceMessageId: messageId, polledAt, updatedAt: polledAt })
          .where(inArray(requestOwnerQuotes.id, plan.updateIds));
      }
      if (plan.insertLineIds.length > 0) {
        await tx.insert(requestOwnerQuotes).values(
          plan.insertLineIds.map((lineId) => ({
            requestLineId: lineId,
            ownerId: carrierId,
            status: "polled" as const,
            polledVia: "email" as const,
            polledAt,
            sourceMessageId: messageId,
          })),
        );
      }
    });
    result.quotesCreated += plan.insertLineIds.length;
    result.quotesUpdated += plan.updateIds.length;

    result.sent.push({ carrierId, carrierName, email });
  }

  return result;
}
