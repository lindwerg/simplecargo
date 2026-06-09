// ЧИСТАЯ логика опроса перевозчиков (без БД/env) — юнит-тестируется напрямую.
// Эффектная сторона (запросы к Postgres) живёт в src/lib/rfq/quotes.ts.

// ── решение оператора: принять / отклонить ставку ───────────────────────────

export type OwnerQuoteDecision = "accepted" | "declined";

/** Гард перехода статуса котировки. Решение допустимо только из responded;
 *  повторное то же решение — идемпотентный no-op. */
export function canDecideQuote(
  currentStatus: string,
  decision: OwnerQuoteDecision,
): { ok: true; noop: boolean } | { ok: false; reason: string } {
  if (currentStatus === decision) return { ok: true, noop: true };
  if (currentStatus !== "responded") {
    return {
      ok: false,
      reason:
        currentStatus === "polled"
          ? "Перевозчик ещё не ответил — принимать нечего"
          : `Ставка уже в статусе «${currentStatus}» — решение не изменить`,
    };
  }
  return { ok: true, noop: false };
}

// ── план upsert'а (общий для outreach-повтора и ручной привязки) ─────────────

export interface ExistingQuoteRow {
  id: string;
  requestLineId: string;
  status: string;
}

export interface QuoteUpsertPlan {
  updateIds: string[]; // существующие ряды, которые обновляем
  insertLineIds: string[]; // пары (line, owner) без единого ряда — вставляем
}

/** Разбиение line×owner на update/insert:
 *  • ряд в updatable-статусе → обновить;
 *  • ни одного ряда по линии → вставить новый;
 *  • ряд есть, но статус решённый (accepted/declined/…) → не трогать и не
 *    дублировать. Это убирает дубли при повторной отправке RFQ. */
export function planQuoteUpsert(
  lineIds: string[],
  existing: ExistingQuoteRow[],
  opts: { updatableStatuses: string[] },
): QuoteUpsertPlan {
  const byLine = new Map<string, ExistingQuoteRow[]>();
  for (const row of existing) {
    byLine.set(row.requestLineId, [...(byLine.get(row.requestLineId) ?? []), row]);
  }

  const updateIds: string[] = [];
  const insertLineIds: string[] = [];
  for (const lineId of lineIds) {
    const rows = byLine.get(lineId) ?? [];
    if (rows.length === 0) {
      insertLineIds.push(lineId);
      continue;
    }
    updateIds.push(...rows.filter((r) => opts.updatableStatuses.includes(r.status)).map((r) => r.id));
  }
  return { updateIds, insertLineIds };
}

// ── разбор draft'а карантинного ответа перевозчика ───────────────────────────

export interface QuoteDraft {
  costPerWagon: number | null;
  wagonsOffered: number | null;
  validTo: string | null;
  from: string | null;
}

/** Достаём draft.quote из rawRowJson карантин-ряда CARRIER_QUOTE_MANUAL.
 *  Форма пишется оркестратором: { quote: CarrierQuoteResult, from, subject }. */
export function parseQuoteDraft(raw: unknown): QuoteDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const q = d.quote;
  if (!q || typeof q !== "object") return null;
  const quote = q as Record<string, unknown>;
  return {
    costPerWagon: typeof quote.costPerWagon === "number" ? quote.costPerWagon : null,
    wagonsOffered: typeof quote.wagonsOffered === "number" ? quote.wagonsOffered : null,
    validTo: typeof quote.validTo === "string" ? quote.validTo : null,
    from: typeof d.from === "string" ? d.from : null,
  };
}
