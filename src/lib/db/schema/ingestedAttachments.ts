import { boolean, check, customType, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { ingestedFiles } from "./ingest";

// Original bytes of an inbound-mail document, stored so the operator can OPEN and
// review what actually arrived (счёт, ответ перевозчика, вложение, текст письма) —
// not just the AI's extracted text. The canonical copy now lives in object storage
// (storageKey); the bytea `content` is a legacy/fallback store kept nullable for
// rows written before object storage existed and for small bodies.
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
    storageKey: text("storage_key"), // object-storage key (canonical store)
    isInline: boolean("is_inline").notNull().default(false), // inline (cid) image vs real attachment
    contentId: text("content_id"), // RFC 2392 cid for inline images referenced in HTML body
    content: bytea("content"), // legacy/fallback bytes; NULL when stored only in object storage
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_ingested_attachments_file").on(t.sourceFileId),
    check("ck_ingested_attachments_kind", sql`${t.kind} IN ('attachment','body')`),
  ],
);
