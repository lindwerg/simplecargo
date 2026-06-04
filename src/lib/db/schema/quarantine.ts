import { bigserial, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { ingestedFiles } from "./ingest";

// Rows/files that fail validation land here with a reason code and the raw row
// preserved for operator review/reprocess (DB_SCHEMA §10).
export const quarantineRows = pgTable(
  "quarantine_rows",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceFileId: uuid("source_file_id").references(() => ingestedFiles.id),
    rowIndex: integer("row_index"), // 0-based row after header
    tier: text("tier").notNull(), // fatal | recoverable | row_warning
    severity: text("severity").notNull(), // CRITICAL|ERROR|WARNING|INFO
    ruleId: text("rule_id").notNull(), // 'W-03','D-02','CS-03',...
    reasonCode: text("reason_code").notNull(), // 'WAGON_CHECKSUM_FAIL', etc.
    fieldName: text("field_name"),
    rawValue: text("raw_value"),
    rawRowJson: jsonb("raw_row_json"),
    agentReason: text("agent_reason"), // LLM explanation (future)
    resolved: boolean("resolved").notNull().default(false),
    resolvedEsr: text("resolved_esr"), // for station-resolution cases
    reviewAction: text("review_action"), // approved|rejected|reprocessed
    resolvedBy: uuid("resolved_by"), // users.id (no hard FK; nullable)
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_quarantine_unresolved").on(t.resolved).where(sql`${t.resolved} = FALSE`),
    index("idx_quarantine_file").on(t.sourceFileId),
    index("idx_quarantine_reason").on(t.reasonCode),
    check("ck_quarantine_tier", sql`${t.tier} IN ('fatal','recoverable','row_warning')`),
    check("ck_quarantine_severity", sql`${t.severity} IN ('CRITICAL','ERROR','WARNING','INFO')`),
    check("ck_quarantine_review_action", sql`${t.reviewAction} IN ('approved','rejected','reprocessed')`),
  ],
);
