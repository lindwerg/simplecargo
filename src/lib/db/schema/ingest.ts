import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { deals } from "./deals";
import { directions } from "./directions";

// File-level idempotency (D6). One row per parsed attachment/upload, keyed by
// content hash (DB_SCHEMA §5).
export const ingestedFiles = pgTable(
  "ingested_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentSha256: char("content_sha256", { length: 64 }).notNull().unique(), // idempotency key
    filename: text("filename").notNull(),
    sourceType: char("source_type", { length: 1 }).notNull(), // A/B/C/D (REPORT_IMPORT/MANUAL elsewhere)
    senderEmail: text("sender_email"),
    gmailMessageId: text("gmail_message_id"),
    storageKey: text("storage_key"), // object-storage key of the raw .eml (никогда не локальный том)
    htmlStorageKey: text("html_storage_key"), // object-storage key of the rendered HTML body
    bodyPreview: text("body_preview"), // короткий сниппет тела письма для списка «Входящих» (~200 симв.)
    headerRow: integer("header_row"), // detected header row index
    columnShift: integer("column_shift").default(0), // Source B shift offset detected
    rowCount: integer("row_count"),
    status: text("status").notNull().default("pending"), // pending|processing|normalized|quarantined|committed
    quarantined: boolean("quarantined").notNull().default(false),
    errorDetail: jsonb("error_detail"),
    agentRunId: text("agent_run_id"), // Claude request id (future)

    // Тип письма от ИИ-классификатора (= MAIL_PART_KINDS). NULL = ещё не размечено.
    // Намеренно без CHECK: расширение таксономии не должно требовать миграции.
    kind: text("kind"),
    kindConfidence: numeric("kind_confidence", { precision: 4, scale: 3 }),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),

    // Прочтение во «Входящих»: NULL = новое/непрочитанное (для счётчиков вкладок).
    readAt: timestamp("read_at", { withTimezone: true }),

    // Привязка письма к сделке/направлению (оператор подтверждает руками).
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    directionId: uuid("direction_id").references(() => directions.id, { onDelete: "set null" }),

    receivedAt: timestamp("received_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_files_status").on(t.status),
    index("idx_files_source").on(t.sourceType),
    index("idx_files_kind_received").on(t.kind, t.receivedAt),
    index("idx_files_deal").on(t.dealId),
    check(
      "ck_files_status",
      sql`${t.status} IN ('pending','processing','normalized','quarantined','committed')`,
    ),
  ],
);
