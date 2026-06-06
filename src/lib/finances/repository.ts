import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

// Read side for the «Финансы» tab. Plain SQL via db.execute (mirrors the partners
// repository). All amounts come back as JS numbers for the UI.

export interface FinanceSummary {
  totalBalance: number;
  balanceAt: string | null;
  monthIn: number;
  monthOut: number;
  netFlow: number;
  txCount: number;
  unlinkedCount: number;
}

function startOfCurrentMonthIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

interface SummaryRow {
  total_balance: string | null;
  balance_at: string | null;
  month_in: string | null;
  month_out: string | null;
  tx_count: string | null;
  unlinked_count: string | null;
  [k: string]: unknown;
}

export async function getFinanceSummary(): Promise<FinanceSummary> {
  const monthStart = startOfCurrentMonthIso();

  const { rows } = await db.execute<SummaryRow>(sql`
    SELECT
      (SELECT COALESCE(SUM(balance), 0) FROM bank_accounts WHERE status = 'active') AS total_balance,
      (SELECT MAX(balance_at) FROM bank_accounts) AS balance_at,
      COALESCE(SUM(CASE WHEN direction = 'in'  AND posted_at >= ${monthStart} THEN amount END), 0) AS month_in,
      COALESCE(SUM(CASE WHEN direction = 'out' AND posted_at >= ${monthStart} THEN amount END), 0) AS month_out,
      COUNT(*) AS tx_count,
      COUNT(*) FILTER (
        WHERE NOT EXISTS (SELECT 1 FROM bank_tx_links l WHERE l.transaction_id = bank_transactions.id)
      ) AS unlinked_count
    FROM bank_transactions
  `);

  const r = rows[0];
  const monthIn = Number(r?.month_in ?? 0);
  const monthOut = Number(r?.month_out ?? 0);
  return {
    totalBalance: Number(r?.total_balance ?? 0),
    balanceAt: r?.balance_at ?? null,
    monthIn,
    monthOut,
    netFlow: monthIn - monthOut,
    txCount: Number(r?.tx_count ?? 0),
    unlinkedCount: Number(r?.unlinked_count ?? 0),
  };
}

export interface TransactionRow {
  id: string;
  postedAt: string;
  direction: "in" | "out";
  amount: number;
  currency: string;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  purposeRaw: string | null;
  linked: boolean;
  matchedName: string | null; // counterparty name if reconciled
}

interface TxQueryRow {
  id: string;
  posted_at: string;
  direction: string;
  amount: string;
  currency: string;
  counterparty_name: string | null;
  counterparty_inn: string | null;
  purpose_raw: string | null;
  linked: boolean;
  matched_name: string | null;
  [k: string]: unknown;
}

const DEFAULT_TX_LIMIT = 100;
const MAX_TX_LIMIT = 500;

/** Recent operations, newest first. `direction` optionally filters in/out. */
export async function listRecentTransactions(opts: {
  limit?: number;
  direction?: "in" | "out";
} = {}): Promise<TransactionRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_TX_LIMIT, 1), MAX_TX_LIMIT);
  const dirFilter = opts.direction ? sql`AND t.direction = ${opts.direction}` : sql``;

  const { rows } = await db.execute<TxQueryRow>(sql`
    SELECT
      t.id,
      t.posted_at,
      t.direction,
      t.amount,
      t.currency,
      t.counterparty_name,
      t.counterparty_inn,
      t.purpose_raw,
      EXISTS (SELECT 1 FROM bank_tx_links l WHERE l.transaction_id = t.id) AS linked,
      (
        SELECT c.name_canonical
        FROM bank_tx_links l
        JOIN counterparties c ON c.id = l.counterparty_id
        WHERE l.transaction_id = t.id
        LIMIT 1
      ) AS matched_name
    FROM bank_transactions t
    WHERE TRUE ${dirFilter}
    ORDER BY t.posted_at DESC, t.synced_at DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    postedAt: r.posted_at,
    direction: r.direction === "out" ? "out" : "in",
    amount: Number(r.amount),
    currency: r.currency,
    counterpartyName: r.counterparty_name,
    counterpartyInn: r.counterparty_inn,
    purposeRaw: r.purpose_raw,
    linked: Boolean(r.linked),
    matchedName: r.matched_name,
  }));
}

export interface AccountRow {
  id: string;
  title: string | null;
  maskedNumber: string | null;
  currency: string;
  balance: number | null;
  balanceAt: string | null;
}

interface AccQueryRow {
  id: string;
  title: string | null;
  masked_number: string | null;
  currency: string;
  balance: string | null;
  balance_at: string | null;
  [k: string]: unknown;
}

export async function listAccounts(): Promise<AccountRow[]> {
  const { rows } = await db.execute<AccQueryRow>(sql`
    SELECT id, title, masked_number, currency, balance, balance_at
    FROM bank_accounts
    WHERE status = 'active'
    ORDER BY created_at ASC
  `);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    maskedNumber: r.masked_number,
    currency: r.currency,
    balance: r.balance === null ? null : Number(r.balance),
    balanceAt: r.balance_at,
  }));
}
