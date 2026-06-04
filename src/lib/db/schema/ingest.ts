import { boolean, char, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
    storageKey: text("storage_key"), // object-storage path to original (never local volume)
    headerRow: integer("header_row"), // detected header row index
    columnShift: integer("column_shift").default(0), // Source B shift offset detected
    rowCount: integer("row_count"),
    status: text("status").notNull().default("pending"), // pending|processing|normalized|quarantined|committed
    quarantined: boolean("quarantined").notNull().default(false),
    errorDetail: jsonb("error_detail"),
    agentRunId: text("agent_run_id"), // Claude request id (future)
    receivedAt: timestamp("received_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_files_status").on(t.status),
    index("idx_files_source").on(t.sourceType),
    check(
      "ck_files_status",
      sql`${t.status} IN ('pending','processing','normalized','quarantined','committed')`,
    ),
  ],
);
