import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { deals } from "@/lib/db/schema/deals";
import { bankTransactions, bankTxLinks } from "@/lib/db/schema/tochkaFinance";

export class ReconcileError extends Error {
  constructor(
    public readonly status: 404 | 422,
    message: string,
  ) {
    super(message);
    this.name = "ReconcileError";
  }
}

// Reconciliation — сшивка банковских операций с нашими сущностями.
// Уровень 1 (этот модуль): точный матч по ИНН операции → counterparties.inn.
// Это закрывает «от кого пришли / кому оплатили → известный контрагент».
// Привязка к конкретной сделке (сумма + номер счёта из назначения) и fuzzy по
// имени — отдельные уровни (P-FIN-7).

interface CountRow {
  linked: string | null;
  [k: string]: unknown;
}

/**
 * Auto-link every still-unlinked transaction whose counterparty ИНН matches a
 * known counterparty. Idempotent: skips transactions that already have any link.
 * When several counterparties share an ИНН, picks the oldest deterministically.
 * Returns the number of new links created.
 */
export async function reconcileByInn(): Promise<number> {
  const { rows } = await db.execute<CountRow>(sql`
    WITH inserted AS (
      INSERT INTO bank_tx_links (transaction_id, counterparty_id, match_confidence, match_method)
      SELECT t.id, c.id, 1.000, 'inn_exact'
      FROM bank_transactions t
      JOIN LATERAL (
        SELECT id FROM counterparties
        WHERE inn = t.counterparty_inn
        ORDER BY created_at ASC, id ASC
        LIMIT 1
      ) c ON TRUE
      WHERE t.counterparty_inn IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM bank_tx_links l WHERE l.transaction_id = t.id)
      RETURNING 1
    )
    SELECT COUNT(*)::text AS linked FROM inserted
  `);
  return Number(rows[0]?.linked ?? 0);
}

/**
 * Уровень 2: привязать операцию к конкретной СДЕЛКЕ. Берём операции, уже сшитые
 * с контрагентом (Уровень 1), у которых ещё нет deal_id, и ищем сделку этого
 * контрагента с совпадающей суммой по нужной стороне (приход ↔ revenue_ua у
 * клиента; расход ↔ cost_owner у поставщика). Привязываем ТОЛЬКО когда кандидат
 * ровно один — иначе оставляем на ручной разнос. Тянем direction_id со сделки.
 * Возвращает число обновлённых связей. Idempotent; не трогает ручные связи.
 */
export async function reconcileToDeals(): Promise<number> {
  const { rows } = await db.execute<CountRow>(sql`
    WITH candidates AS (
      SELECT
        l.id AS link_id,
        d.id AS deal_id,
        d.direction_id AS direction_id,
        COUNT(*) OVER (PARTITION BY l.id) AS n
      FROM bank_tx_links l
      JOIN bank_transactions t ON t.id = l.transaction_id
      JOIN deals d ON (
        (t.direction = 'in'  AND d.client_id = l.counterparty_id AND d.revenue_ua = t.amount) OR
        (t.direction = 'out' AND d.owner_id  = l.counterparty_id AND d.cost_owner = t.amount)
      )
      WHERE l.deal_id IS NULL
        AND l.counterparty_id IS NOT NULL
        AND l.match_method <> 'manual'
    ),
    updated AS (
      UPDATE bank_tx_links l
      SET deal_id = c.deal_id,
          direction_id = c.direction_id,
          match_method = 'inn_amount_invoice',
          match_confidence = 0.950
      FROM candidates c
      WHERE l.id = c.link_id AND c.n = 1
      RETURNING 1
    )
    SELECT COUNT(*)::text AS linked FROM updated
  `);
  return Number(rows[0]?.linked ?? 0);
}

export interface ManualLinkInput {
  transactionId: string;
  counterpartyId?: string | null;
  dealId?: string | null;
  userId: string;
}

/**
 * Ручной разнос оператором: заменяет любые существующие связи операции на одну
 * подтверждённую (`manual`, confidence 1.0). direction_id берётся со сделки.
 */
export async function setManualLink(input: ManualLinkInput): Promise<void> {
  const [tx] = await db
    .select({ id: bankTransactions.id })
    .from(bankTransactions)
    .where(eq(bankTransactions.id, input.transactionId));
  if (!tx) throw new ReconcileError(404, "Операция не найдена");

  if (!input.counterpartyId && !input.dealId) {
    throw new ReconcileError(422, "Укажите контрагента или сделку");
  }

  let directionId: string | null = null;
  let counterpartyId = input.counterpartyId ?? null;
  if (input.dealId) {
    const [deal] = await db
      .select({ directionId: deals.directionId, clientId: deals.clientId, ownerId: deals.ownerId })
      .from(deals)
      .where(eq(deals.id, input.dealId));
    if (!deal) throw new ReconcileError(404, "Сделка не найдена");
    directionId = deal.directionId ?? null;
    // если контрагент не задан явно — берём со сделки (клиент по умолчанию)
    if (!counterpartyId) counterpartyId = deal.clientId ?? deal.ownerId ?? null;
  }

  await db.transaction(async (trx) => {
    await trx.delete(bankTxLinks).where(eq(bankTxLinks.transactionId, input.transactionId));
    await trx.insert(bankTxLinks).values({
      transactionId: input.transactionId,
      counterpartyId,
      dealId: input.dealId ?? null,
      directionId,
      matchMethod: "manual",
      matchConfidence: "1.000",
      confirmedBy: input.userId,
    });
  });
}

/** Снять разнос с операции (вернуть в очередь «не разнесено»). */
export async function unlinkTransaction(transactionId: string): Promise<void> {
  await db.delete(bankTxLinks).where(eq(bankTxLinks.transactionId, transactionId));
}
