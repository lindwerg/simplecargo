import {
  char,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { users } from "./auth";
import { requests } from "./requests";

// Order (Заявка) — transient intake record that spawns one or more Directions
// (SCHEMA_DELTA §3.1, PRODUCT_DIRECTIONS §1.1). Scaffolded empty in P1.5 (no UI);
// populated by the P5 drag-drop extractor. D16: the client is never auto-written —
// `client_suggested_id` is advisory only; the confirmed client lives on the Direction.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number"), // human ref, optional
    title: text("title"), // human label for proactive deals ("Щебень Асбест → Тюмень")
    status: text("status").notNull().default("draft"), // draft|confirmed|active|completed|cancelled

    // dealType — denormalised cache of the deal composition, derived from the attached
    // directions / stone lines (deriveDealType). NULL until the first component is added.
    // stone_only | wagons_only | stone_with_transport.
    dealType: text("deal_type"),

    // channel — how the deal entered the funnel. inbound = converted from a won RFQ;
    // proactive = operator-initiated cold sale (deals/new). NOT NULL, defaults inbound.
    channel: text("channel").notNull().default("inbound"),

    // request_id — the source RFQ this deal was converted from (Фаза 3). NULL for
    // proactive deals. Partial-unique: one request converts into at most one deal.
    requestId: uuid("request_id").references((): AnyPgColumn => requests.id, {
      onDelete: "set null",
    }),

    // reportMonth — YYYY-MM bucket the deal rolls up into for monthly P&L.
    reportMonth: char("report_month", { length: 7 }),

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
    // one RFQ → at most one deal (partial: proactive deals carry no request_id).
    // NOTE: drizzle-kit does not emit the WHERE clause — added by hand in the migration.
    uniqueIndex("ux_orders_request").on(t.requestId).where(sql`${t.requestId} IS NOT NULL`),
    check("ck_orders_status", sql`${t.status} IN ('draft','confirmed','active','completed','cancelled')`),
    check("ck_orders_channel", sql`${t.channel} IN ('inbound','proactive')`),
    check(
      "ck_orders_deal_type",
      sql`${t.dealType} IS NULL OR ${t.dealType} IN ('stone_only','wagons_only','stone_with_transport')`,
    ),
  ],
);
