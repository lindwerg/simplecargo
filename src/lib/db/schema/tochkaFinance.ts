import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { deals } from "./deals";
import { directions } from "./directions";
import { users } from "./auth";

// Финансы / Tochka Bank integration (read-only MVP). Three tables:
//   bank_accounts      — расчётные счета компании в Точке
//   bank_transactions  — сырьё операций из выписок/вебхуков (источник истины банка)
//   bank_tx_links      — разнос операции на контрагента/сделку/направление
// Контрагентов НЕ дублируем — переиспользуем `counterparties` (там уже есть inn).

// --- Расчётные счета компании в Точке -------------------------------------
export const bankAccounts = pgTable(
  "bank_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Точкин accountId формата "<номер счёта>/<БИК>" — стабильный внешний ключ.
    externalAccountId: text("external_account_id").notNull().unique(),
    customerCode: text("customer_code"), // код клиента в Точке (из JWT)
    currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
    maskedNumber: text("masked_number"), // для UI, без полного номера в логах
    title: text("title"), // человекочитаемое имя счёта
    status: text("status").notNull().default("active"), // active|closed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("ck_bank_account_status", sql`${t.status} IN ('active','closed')`)],
);

// --- Операции (сырьё из банка) --------------------------------------------
// Дедуп: unique(account_id, external_tx_id). Когда стабильного transactionId нет
// (редко), fallback на dedup_hash. Повторная доставка (webhook + повторный poll)
// → одна строка через ON CONFLICT DO NOTHING.
export const bankTransactions = pgTable(
  "bank_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    externalTxId: text("external_tx_id").notNull(), // Точкин transactionId
    paymentId: text("payment_id"), // сквозной id платежа Точки
    direction: text("direction").notNull(), // in|out (из creditDebitIndicator)
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    amountNat: numeric("amount_nat", { precision: 14, scale: 2 }), // в валюте счёта
    currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(), // documentProcessDate
    purposeRaw: text("purpose_raw"), // назначение платежа

    // контрагент операции: Debtor* при приходе (от кого), Creditor* при расходе (кому)
    counterpartyInn: varchar("counterparty_inn", { length: 12 }),
    counterpartyKpp: varchar("counterparty_kpp", { length: 9 }),
    counterpartyName: text("counterparty_name"),
    counterpartyAccount: text("counterparty_account"),
    counterpartyBankBic: varchar("counterparty_bank_bic", { length: 9 }),

    status: text("status").notNull().default("booked"), // booked|pending
    source: text("source").notNull().default("statement"), // statement|webhook
    raw: jsonb("raw"), // полный объект операции — на доразбор
    dedupHash: text("dedup_hash"), // fallback-ключ, см. sync.ts
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_bank_tx_account_extid").on(t.accountId, t.externalTxId),
    index("idx_bank_tx_account_posted").on(t.accountId, t.postedAt),
    index("idx_bank_tx_inn").on(t.counterpartyInn),
    index("idx_bank_tx_direction").on(t.direction),
    index("idx_bank_tx_payment").on(t.paymentId),
    check("ck_bank_tx_direction", sql`${t.direction} IN ('in','out')`),
    check("ck_bank_tx_status", sql`${t.status} IN ('booked','pending')`),
    check("ck_bank_tx_source", sql`${t.source} IN ('statement','webhook')`),
  ],
);

// --- Разнос операции (reconciliation) -------------------------------------
// Одна операция может разноситься на несколько сделок → отдельная таблица.
export const bankTxLinks = pgTable(
  "bank_tx_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => bankTransactions.id, { onDelete: "cascade" }),
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    directionId: uuid("direction_id").references(() => directions.id, { onDelete: "set null" }),
    amountAllocated: numeric("amount_allocated", { precision: 14, scale: 2 }),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }), // 0..1
    matchMethod: text("match_method").notNull(), // inn_amount_invoice|inn_fuzzy|name_fuzzy|subset_sum|manual
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_bank_tx_link_tx").on(t.transactionId),
    index("idx_bank_tx_link_counterparty").on(t.counterpartyId),
    index("idx_bank_tx_link_deal").on(t.dealId),
    index("idx_bank_tx_link_direction").on(t.directionId),
    check(
      "ck_bank_tx_link_method",
      sql`${t.matchMethod} IN ('inn_amount_invoice','inn_fuzzy','name_fuzzy','subset_sum','manual')`,
    ),
  ],
);
