import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

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
