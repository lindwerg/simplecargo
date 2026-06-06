import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";

// Справочник ВСЕХ адресов из нашей переписки mail.ru (MAIL_AI_INTEGRATION §6.5).
// «Сервис знает всё из почты»: воркер копит каждый From/To/Cc (вх. и исх.), даже
// до того как контрагент заведён вручную. Источник автоподстановки (/api/contacts/
// suggest) и подсветки «новых» адресов. Привязанный адрес (counterpartyId) дальше
// автоматически резолвит входящие письма к клиенту.
export const knownEmailContacts = pgTable(
  "known_email_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    emailLower: text("email_lower").notNull().unique(), // trim + lowercase
    displayNameLast: text("display_name_last"), // последнее увиденное имя из заголовка
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    seenIncoming: integer("seen_incoming").notNull().default(0),
    seenOutgoing: integer("seen_outgoing").notNull().default(0),
    lastSubject: text("last_subject"),
    // если адрес опознан/привязан к компании — заполняется (иначе «новый из переписки»)
    counterpartyId: uuid("counterparty_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // HOT PATH (автокомплит): префиксный поиск по lower(email_lower).
    index("idx_known_email_prefix").on(sql`lower(${t.emailLower})`),
    index("idx_known_email_counterparty").on(t.counterpartyId),
    index("idx_known_email_last_seen").on(t.lastSeenAt),
  ],
);
