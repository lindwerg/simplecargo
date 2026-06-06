import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Курсор IMAP-приёма для идемпотентности (MAIL_AI_INTEGRATION §3.2).
// Одна строка на отслеживаемую папку mail.ru. При реконнекте воркер читает
// UID > lastSeenUid; при смене uidValidity — сброс курсора + полный re-scan.
export const mailCursor = pgTable(
  "mail_cursor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    folder: text("folder").notNull().unique(), // напр. 'INBOX'
    lastSeenUid: bigint("last_seen_uid", { mode: "number" }).notNull().default(0),
    uidValidity: bigint("uid_validity", { mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_mail_cursor_folder").on(t.folder)],
);
