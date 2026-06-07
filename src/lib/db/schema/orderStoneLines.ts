import {
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { orders } from "./orders";
import { counterparties } from "./counterparties";
import { stations } from "./geo";

// Stone (товар) component of a Deal (PRODUCT_DIRECTIONS §1.1, plan §3). A deal of type
// stone_only / stone_with_transport carries one or more stone lines: a quarry supplier,
// a fraction, planned/actual tonnage and purchase/sale price. marginPerTon is a generated
// STORED column — Postgres yields NULL when either input is NULL (same idiom as
// deals.margin), so a half-filled line never shows a misleading margin.
//
// D16/H1: prices here are operator-entered confirmed values. LLM/desired rates land in
// separate *_suggested fields upstream; nothing on this table is auto-confirmed.
export const orderStoneLines = pgTable(
  "order_stone_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),

    // Quarry supplier — find-or-created with role 'quarry'. Raw text kept for audit /
    // pre-resolve display, mirroring the station raw+ESR fallback (D15).
    quarrySupplierId: uuid("quarry_supplier_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    quarryRaw: text("quarry_raw"),

    // Loading point. stone_only deals may have no station (plan open decision §3) —
    // both ESR and raw are nullable. ESR FK to stations; never invent codes.
    locationEsr: char("location_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    locationRaw: text("location_raw"),

    fraction: text("fraction"), // e.g. "5-20", "20-40"
    cargoName: text("cargo_name").notNull().default("щебень"),

    // tonnage = planned, tonnageActual = shipped (accrues over the month).
    tonnage: numeric("tonnage", { precision: 12, scale: 3 }),
    tonnageActual: numeric("tonnage_actual", { precision: 12, scale: 3 }),

    // Confirmed prices (per ton). marginPerTon generated STORED (NULL if either NULL).
    pricePurchase: numeric("price_purchase", { precision: 14, scale: 2 }),
    priceSale: numeric("price_sale", { precision: 14, scale: 2 }),
    marginPerTon: numeric("margin_per_ton", { precision: 14, scale: 2 }).generatedAlwaysAs(
      sql`price_sale - price_purchase`,
    ),

    currency: text("currency").notNull().default("RUB"),
    reportMonth: char("report_month", { length: 7 }), // "2026-08" bucket for monthly P&L

    status: text("status").notNull().default("draft"), // draft|active|completed|cancelled
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_stone_lines_order").on(t.orderId),
    index("idx_stone_lines_quarry").on(t.quarrySupplierId),
    index("idx_stone_lines_month").on(t.reportMonth),
    check(
      "ck_stone_lines_status",
      sql`${t.status} IN ('draft','active','completed','cancelled')`,
    ),
  ],
);
