import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { users } from "./auth";

// Order (Заявка) — transient intake record that spawns one or more Directions
// (SCHEMA_DELTA §3.1, PRODUCT_DIRECTIONS §1.1). Scaffolded empty in P1.5 (no UI);
// populated by the P5 drag-drop extractor. D16: the client is never auto-written —
// `client_suggested_id` is advisory only; the confirmed client lives on the Direction.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number"), // human ref, optional
    status: text("status").notNull().default("draft"), // draft|confirmed|active|completed|cancelled
    // SUGGESTED client from LLM; confirmed client is set per-direction (D16)
    clientSuggestedId: uuid("client_suggested_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_orders_status").on(t.status),
    check("ck_orders_status", sql`${t.status} IN ('draft','confirmed','active','completed','cancelled')`),
  ],
);
