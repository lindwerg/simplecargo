import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { deals } from "./deals";
import { directions } from "./directions";
import { ingestedFiles } from "./ingest";
import { bankTransactions } from "./tochkaFinance";

// Входящие счета, распознанные ИИ из писем mail.ru (MAIL_AI_INTEGRATION §5.4/§6.4).
// MVP: храним МЕТАДАННЫЕ + извлечённый текст, оригинал PDF/скана НЕ сохраняем
// (решение оператора #3 — нет object-storage). Сшивка с реальным платежом Точки
// (bankTransactions) идёт по ИНН + № счёта + сумме через finances/match-invoice.ts.
//
// House convention: enums = text column + CHECK constraint, never pgEnum.
export const inboundInvoices = pgTable(
  "inbound_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // incoming = счёт ОТ поставщика/перевозчика нам; outgoing = наш счёт клиенту
    direction: text("direction").notNull().default("incoming"),

    // контрагент: id (если опознан) + сырьё для ручной привязки/аудита
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    counterpartyInn: varchar("counterparty_inn", { length: 12 }),
    counterpartyNameRaw: text("counterparty_name_raw"),

    invoiceNumber: text("invoice_number"),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }),
    dueDate: timestamp("due_date", { withTimezone: true }),

    amountTotal: numeric("amount_total", { precision: 14, scale: 2 }),
    vatAmount: numeric("vat_amount", { precision: 14, scale: 2 }),
    currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
    purposeRaw: text("purpose_raw"), // назначение/предмет счёта как в письме

    // привязка к сделке/направлению (опционально, оператор подтверждает)
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    directionId: uuid("direction_id").references(() => directions.id, { onDelete: "set null" }),

    // сшитый проведённый платёж Точки (если найден)
    paidTxId: uuid("paid_tx_id").references(() => bankTransactions.id, { onDelete: "set null" }),

    status: text("status").notNull().default("pending"),
    // pending | matched | paid | review

    // источник: письмо/вложение (ingestedFiles, sourceType='E')
    sourceFileId: uuid("source_file_id").references(() => ingestedFiles.id, { onDelete: "set null" }),
    extractedText: text("extracted_text"), // распознанный текст счёта (без оригинала)

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_inbound_invoices_inn").on(t.counterpartyInn),
    index("idx_inbound_invoices_number").on(t.invoiceNumber),
    index("idx_inbound_invoices_status").on(t.status),
    check("ck_inbound_invoices_direction", sql`${t.direction} IN ('incoming','outgoing')`),
    check("ck_inbound_invoices_status", sql`${t.status} IN ('pending','matched','paid','review')`),
  ],
);
