import { check, customType, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { ingestedFiles } from "./ingest";

// Original bytes of an inbound-mail document, stored so the operator can OPEN and
// review what actually arrived (счёт, ответ перевозчика, вложение, текст письма) —
// not just the AI's extracted text. Bytes live in Postgres (bytea), NOT on a
// filesystem volume, because the mail-worker and web run as SEPARATE Railway
// services and can't share a mounted volume — the shared DB is the only common
// store. Capped per row; oversized files keep metadata with NULL content.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const ingestedAttachments = pgTable(
  "ingested_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceFileId: uuid("source_file_id")
      .notNull()
      .references(() => ingestedFiles.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("attachment"), // attachment | body
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    content: bytea("content"), // NULL when the file is over the size cap (audit-only)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_ingested_attachments_file").on(t.sourceFileId),
    check("ck_ingested_attachments_kind", sql`${t.kind} IN ('attachment','body')`),
  ],
);
