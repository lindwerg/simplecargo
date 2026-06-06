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
  status: string;
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
  status: string;
  counterparty_name: string | null;
  counterparty_inn: string | null;
  purpose_raw: string | null;
  linked: boolean;
  matched_name: string | null;
  [k: string]: unknown;
}

const DEFAULT_TX_LIMIT = 100;
const MAX_TX_LIMIT = 500;

/** Recent operations, newest first. Filters: direction, unlinked-only, search. */
export async function listRecentTransactions(opts: {
  limit?: number;
  direction?: "in" | "out";
  onlyUnlinked?: boolean;
  search?: string;
} = {}): Promise<TransactionRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_TX_LIMIT, 1), MAX_TX_LIMIT);
  const dirFilter = opts.direction ? sql`AND t.direction = ${opts.direction}` : sql``;
  const unlinkedFilter = opts.onlyUnlinked
    ? sql`AND NOT EXISTS (SELECT 1 FROM bank_tx_links l WHERE l.transaction_id = t.id)`
    : sql``;
  const searchFilter =
    opts.search && opts.search.trim() !== ""
      ? sql`AND (t.counterparty_name ILIKE ${"%" + opts.search.trim() + "%"} OR t.counterparty_inn ILIKE ${"%" + opts.search.trim() + "%"} OR t.purpose_raw ILIKE ${"%" + opts.search.trim() + "%"})`
      : sql``;

  const { rows } = await db.execute<TxQueryRow>(sql`
    SELECT
      t.id,
      t.posted_at,
      t.direction,
      t.amount,
      t.currency,
      t.status,
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
    WHERE TRUE ${dirFilter} ${unlinkedFilter} ${searchFilter}
    ORDER BY t.posted_at DESC, t.synced_at DESC
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    postedAt: r.posted_at,
    direction: r.direction === "out" ? "out" : "in",
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status,
    counterpartyName: r.counterparty_name,
    counterpartyInn: r.counterparty_inn,
    purposeRaw: r.purpose_raw,
    linked: Boolean(r.linked),
    matchedName: r.matched_name,
  }));
}

export interface TransactionDetail {
  id: string;
  postedAt: string;
  direction: "in" | "out";
  amount: number;
  currency: string;
  status: string;
  documentNumber: string | null;
  paymentId: string | null;
  purposeRaw: string | null;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  counterpartyKpp: string | null;
  counterpartyAccount: string | null;
  counterpartyBankBic: string | null;
  counterpartyBankName: string | null;
  counterpartyCorrAccount: string | null;
  accountTitle: string | null;
  accountMasked: string | null;
  linked: boolean;
  matchedCounterparty: string | null;
  matchedCounterpartyId: string | null;
  matchedDealId: string | null;
}

interface DetailRow {
  id: string;
  posted_at: string;
  direction: string;
  amount: string;
  currency: string;
  status: string;
  payment_id: string | null;
  purpose_raw: string | null;
  counterparty_name: string | null;
  counterparty_inn: string | null;
  counterparty_kpp: string | null;
  counterparty_account: string | null;
  counterparty_bank_bic: string | null;
  document_number: string | null;
  bank_name: string | null;
  corr_account: string | null;
  account_title: string | null;
  account_masked: string | null;
  matched_counterparty: string | null;
  matched_counterparty_id: string | null;
  matched_deal_id: string | null;
  [k: string]: unknown;
}

/** Full operation card — all requisites + reconciliation, for the detail view. */
export async function getTransactionDetail(id: string): Promise<TransactionDetail | null> {
  const { rows } = await db.execute<DetailRow>(sql`
    SELECT
      t.id, t.posted_at, t.direction, t.amount, t.currency, t.status, t.payment_id,
      t.purpose_raw, t.counterparty_name, t.counterparty_inn, t.counterparty_kpp,
      t.counterparty_account, t.counterparty_bank_bic,
      (t.raw ->> 'documentNumber') AS document_number,
      COALESCE(t.raw -> 'CreditorAgent' ->> 'name', t.raw -> 'DebtorAgent' ->> 'name') AS bank_name,
      COALESCE(
        t.raw -> 'CreditorAgent' ->> 'accountIdentification',
        t.raw -> 'DebtorAgent' ->> 'accountIdentification'
      ) AS corr_account,
      a.title AS account_title,
      a.masked_number AS account_masked,
      l.counterparty_id AS matched_counterparty_id,
      l.deal_id AS matched_deal_id,
      c.name_canonical AS matched_counterparty
    FROM bank_transactions t
    JOIN bank_accounts a ON a.id = t.account_id
    LEFT JOIN LATERAL (
      SELECT counterparty_id, deal_id FROM bank_tx_links WHERE transaction_id = t.id LIMIT 1
    ) l ON TRUE
    LEFT JOIN counterparties c ON c.id = l.counterparty_id
    WHERE t.id = ${id}
    LIMIT 1
  `);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    postedAt: r.posted_at,
    direction: r.direction === "out" ? "out" : "in",
    amount: Number(r.amount),
    currency: r.currency,
    status: r.status,
    documentNumber: r.document_number,
    paymentId: r.payment_id,
    purposeRaw: r.purpose_raw,
    counterpartyName: r.counterparty_name,
    counterpartyInn: r.counterparty_inn,
    counterpartyKpp: r.counterparty_kpp,
    counterpartyAccount: r.counterparty_account,
    counterpartyBankBic: r.counterparty_bank_bic,
    counterpartyBankName: r.bank_name,
    counterpartyCorrAccount: r.corr_account,
    accountTitle: r.account_title,
    accountMasked: r.account_masked,
    linked: r.matched_counterparty_id !== null || r.matched_deal_id !== null,
    matchedCounterparty: r.matched_counterparty,
    matchedCounterpartyId: r.matched_counterparty_id,
    matchedDealId: r.matched_deal_id,
  };
}

export interface ExportRow {
  date: string;
  direction: string;
  amount: number;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  counterpartyAccount: string | null;
  counterpartyBankBic: string | null;
  purpose: string | null;
  documentNumber: string | null;
  status: string;
}

interface ExportQueryRow {
  posted_at: string;
  direction: string;
  amount: string;
  counterparty_name: string | null;
  counterparty_inn: string | null;
  counterparty_account: string | null;
  counterparty_bank_bic: string | null;
  purpose_raw: string | null;
  document_number: string | null;
  status: string;
  [k: string]: unknown;
}

/** Operations within [from, to] for statement export. `from`/`to` are YYYY-MM-DD. */
export async function listTransactionsForExport(opts: {
  from: string;
  to: string;
  direction?: "in" | "out";
  search?: string;
}): Promise<ExportRow[]> {
  const dirFilter = opts.direction ? sql`AND t.direction = ${opts.direction}` : sql``;
  const searchFilter =
    opts.search && opts.search.trim() !== ""
      ? sql`AND (t.counterparty_name ILIKE ${"%" + opts.search.trim() + "%"} OR t.counterparty_inn ILIKE ${"%" + opts.search.trim() + "%"})`
      : sql``;
  // `to` is inclusive of the whole day.
  const toExclusive = `${opts.to}T23:59:59.999Z`;

  const { rows } = await db.execute<ExportQueryRow>(sql`
    SELECT
      t.posted_at, t.direction, t.amount, t.counterparty_name, t.counterparty_inn,
      t.counterparty_account, t.counterparty_bank_bic, t.purpose_raw, t.status,
      (t.raw ->> 'documentNumber') AS document_number
    FROM bank_transactions t
    WHERE t.posted_at >= ${opts.from} AND t.posted_at <= ${toExclusive}
      ${dirFilter} ${searchFilter}
    ORDER BY t.posted_at ASC
  `);

  return rows.map((r) => ({
    date: r.posted_at,
    direction: r.direction,
    amount: Number(r.amount),
    counterpartyName: r.counterparty_name,
    counterpartyInn: r.counterparty_inn,
    counterpartyAccount: r.counterparty_account,
    counterpartyBankBic: r.counterparty_bank_bic,
    purpose: r.purpose_raw,
    documentNumber: r.document_number,
    status: r.status,
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
