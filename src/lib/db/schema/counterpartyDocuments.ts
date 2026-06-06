import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { users } from "./auth";

// Files attached to a counterparty (company): contracts (договоры), requests
// (заявки), scans, and anything else. One unified table — `kind` separates them.
// The binary lives on a Railway volume; this row carries metadata + a server-built
// `storageKey` (relative path inside STORAGE_DIR). House convention: enums as text
// + CHECK; no pgEnum.
export const counterpartyDocuments = pgTable(
  "counterparty_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => counterparties.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("other"), // contract | request | other
    title: text("title").notNull(),
    docRef: text("doc_ref"), // № договора / № заявки (free text)
    docDate: timestamp("doc_date", { withTimezone: true }), // дата документа

    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(), // server-built relative path on the volume

    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_cp_doc_counterparty").on(t.counterpartyId, t.kind),
    check("ck_cp_doc_kind", sql`${t.kind} IN ('contract','request','other')`),
  ],
);
