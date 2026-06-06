import { check, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { requestLines } from "./requests";

// Трекинг опроса перевозчиков/собственников по плечу запроса
// (REQUESTS_SOURCING §5.4, минимальный MVP-подмножество под почтовый RFQ).
//
// ВАЖНО (см. ревизию RS §5.4 от 2026-06-06): канон — text + CHECK, НЕ pgEnum,
// в соответствии с house convention кода. Полный cost-stack/VAT/coverage из RS
// добавляется аддитивно позже. Перевозчик = собственник = роль carrier (решение #4).
export const requestOwnerQuotes = pgTable(
  "request_owner_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestLineId: uuid("request_line_id")
      .notNull()
      .references(() => requestLines.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => counterparties.id, { onDelete: "restrict" }),

    status: text("status").notNull().default("polled"),
    // polled | responded | declined | accepted | expired
    polledVia: text("polled_via").notNull().default("email"),
    // manual | email | phone | telegram

    polledAt: timestamp("polled_at", { withTimezone: true }),
    respondedAt: timestamp("responded_at", { withTimezone: true }),

    costPerWagon: numeric("cost_per_wagon", { precision: 14, scale: 2 }), // предложенная ставка
    wagonsOffered: integer("wagons_offered"),

    sourceMessageId: text("source_message_id"), // Message-ID исходящего RFQ / ответа (threading)
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_owner_quotes_line").on(t.requestLineId),
    index("idx_owner_quotes_owner").on(t.ownerId),
    index("idx_owner_quotes_status").on(t.status),
    check(
      "ck_owner_quotes_status",
      sql`${t.status} IN ('polled','responded','declined','accepted','expired')`,
    ),
    check(
      "ck_owner_quotes_polled_via",
      sql`${t.polledVia} IN ('manual','email','phone','telegram')`,
    ),
  ],
);
