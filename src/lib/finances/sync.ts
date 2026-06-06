import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { bankAccounts, bankTransactions } from "@/lib/db/schema/tochkaFinance";
import {
  getStatement,
  initStatement,
  listAccounts,
  TochkaError,
} from "./tochka-client";
import { extractAccounts, extractStatements, isStatementReady } from "./extract";
import { parseTransaction, TochkaParseError } from "./parse-transaction";
import { reconcileByInn, reconcileToDeals } from "./reconcile";
import { reconcileInboundInvoices } from "./reconcile-invoices";

// Sync orchestration: pull accounts + statements from Tochka and upsert them
// idempotently. Read-only against the bank; the only writes are to our own DB.

const POLL_ATTEMPTS = 15;
const POLL_INTERVAL_MS = 2_000;
const DEFAULT_BACKFILL_MONTHS = 3;

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SyncResult {
  accounts: number;
  inserted: number;
  skipped: number; // already present (dedup)
  failed: number; // unparseable transactions
  linked: number; // newly auto-reconciled to a counterparty by ИНН
  dealsLinked: number; // newly auto-reconciled to a specific deal
  invoicesMatched: number; // pending mail-invoices linked to a payment
  warnings: string[];
}

/** Upsert company accounts. Returns a map externalAccountId → our DB uuid. */
async function syncAccounts(): Promise<Map<string, string>> {
  const response = await listAccounts();
  const accounts = extractAccounts(response);
  const map = new Map<string, string>();

  for (const acc of accounts) {
    const [row] = await db
      .insert(bankAccounts)
      .values({
        externalAccountId: acc.externalAccountId,
        customerCode: acc.customerCode,
        currency: acc.currency,
        status: acc.status,
        maskedNumber: acc.maskedNumber,
        title: acc.title,
      })
      .onConflictDoUpdate({
        target: bankAccounts.externalAccountId,
        set: {
          customerCode: acc.customerCode,
          currency: acc.currency,
          status: acc.status,
          maskedNumber: acc.maskedNumber,
          title: acc.title,
        },
      })
      .returning({ id: bankAccounts.id });
    map.set(acc.externalAccountId, row.id);
  }
  return map;
}

/** Poll a freshly-initiated statement until Ready (or attempts exhausted). */
async function pollStatement(externalAccountId: string, statementId: string): Promise<unknown> {
  let last: unknown = null;
  for (let i = 0; i < POLL_ATTEMPTS; i++) {
    last = await getStatement(externalAccountId, statementId);
    const [statement] = extractStatements(last);
    if (statement && isStatementReady(statement.status)) return last;
    await sleep(POLL_INTERVAL_MS);
  }
  return last; // best-effort: return whatever we last saw
}

/** Idempotently insert parsed transactions for one account. */
async function upsertTransactions(
  accountDbId: string,
  rawTxs: readonly unknown[],
): Promise<{ inserted: number; skipped: number; failed: number }> {
  let inserted = 0;
  let failed = 0;

  const rows = [];
  for (const raw of rawTxs) {
    try {
      const tx = parseTransaction(raw);
      rows.push({
        accountId: accountDbId,
        externalTxId: tx.externalTxId,
        paymentId: tx.paymentId,
        direction: tx.direction,
        amount: tx.amount.toFixed(2),
        amountNat: tx.amountNat === null ? null : tx.amountNat.toFixed(2),
        currency: tx.currency,
        postedAt: tx.postedAt,
        purposeRaw: tx.purposeRaw,
        counterpartyInn: tx.counterpartyInn,
        counterpartyKpp: tx.counterpartyKpp,
        counterpartyName: tx.counterpartyName,
        counterpartyAccount: tx.counterpartyAccount,
        counterpartyBankBic: tx.counterpartyBankBic,
        status: tx.status,
        source: "statement" as const,
        raw: tx.raw,
      });
    } catch (error: unknown) {
      if (error instanceof TochkaParseError) {
        failed++;
        continue;
      }
      throw error;
    }
  }

  if (rows.length > 0) {
    const insertedRows = await db
      .insert(bankTransactions)
      .values(rows)
      .onConflictDoNothing({
        target: [bankTransactions.accountId, bankTransactions.externalTxId],
      })
      .returning({ id: bankTransactions.id });
    inserted = insertedRows.length;
  }

  return { inserted, skipped: rows.length - inserted, failed };
}

/**
 * Full sync: accounts → statements for the backfill window → transactions.
 * Updates each account's balance snapshot from the statement's endDateBalance.
 */
export async function syncTochka(
  opts: { months?: number } = {},
): Promise<SyncResult> {
  const months = opts.months ?? DEFAULT_BACKFILL_MONTHS;
  const startDate = ymd(monthsAgo(months));
  const endDate = ymd(new Date());

  const result: SyncResult = {
    accounts: 0,
    inserted: 0,
    skipped: 0,
    failed: 0,
    linked: 0,
    dealsLinked: 0,
    invoicesMatched: 0,
    warnings: [],
  };

  const accountMap = await syncAccounts();
  result.accounts = accountMap.size;

  for (const [externalAccountId, accountDbId] of accountMap) {
    try {
      const init = await initStatement({ accountId: externalAccountId, startDate, endDate });
      const [initStatementRow] = extractStatements(init);
      const statementId = initStatementRow?.statementId;
      if (!statementId) {
        result.warnings.push(`Счёт ${externalAccountId}: банк не вернул id выписки`);
        continue;
      }

      const ready = await pollStatement(externalAccountId, statementId);
      const statements = extractStatements(ready);

      for (const statement of statements) {
        if (statement.endDateBalance !== null) {
          await db
            .update(bankAccounts)
            .set({
              balance: statement.endDateBalance.toFixed(2),
              balanceAt: statement.endDateTime ? new Date(statement.endDateTime) : new Date(),
            })
            .where(eq(bankAccounts.id, accountDbId));
        }
        const counts = await upsertTransactions(accountDbId, statement.transactions);
        result.inserted += counts.inserted;
        result.skipped += counts.skipped;
        result.failed += counts.failed;
      }
    } catch (error: unknown) {
      const message = error instanceof TochkaError ? error.message : "ошибка синхронизации";
      result.warnings.push(`Счёт ${externalAccountId}: ${message}`);
    }
  }

  // Разнос: Уровень 1 (контрагент по ИНН) → Уровень 2 (конкретная сделка).
  try {
    result.linked = await reconcileByInn();
    result.dealsLinked = await reconcileToDeals();
  } catch (error: unknown) {
    result.warnings.push(
      `Авто-разнос не выполнен: ${error instanceof Error ? error.message : "ошибка"}`,
    );
  }

  // Сшивка входящих счетов из почты с проведёнными платежами (по ИНН+№+сумма).
  try {
    result.invoicesMatched = await reconcileInboundInvoices();
  } catch (error: unknown) {
    result.warnings.push(
      `Сшивка счетов не выполнена: ${error instanceof Error ? error.message : "ошибка"}`,
    );
  }

  return result;
}
