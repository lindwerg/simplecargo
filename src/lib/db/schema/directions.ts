import { boolean, char, check, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { orders } from "./orders";
import { stations } from "./geo";
import { users } from "./auth";

// Direction (Направление) — the operator-facing operational hub: one route + rate
// card that accumulates Deals (SCHEMA_DELTA §3.2, PRODUCT_DIRECTIONS §1.2).
// Locked decisions honored:
//  D15 — ESR FK to stations with a raw-text fallback; never invent codes.
//  D16 — rates are nullable and operator-confirmed; LLM suggestions held separately
//        in *_suggested columns, never used in margin.
//  D17 — rate_model enables the lump-sum emit branch without breaking the
//        per-wagon revenue+cost gate.
// `direction_id` lives ONLY on deals (R1) — never on wagons/wagon_movements.
export const directions = pgTable(
  "directions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // NULLABLE (M3/R2): a Direction may be created manually or for historical import — no Order.
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    displayName: text("display_name"), // "Асбест → Голышманово / Июнь 2025"
    status: text("status").notNull().default("draft"), // draft|open|active|paused|completed|cancelled

    // route — ESR resolved (D15); raw preserved when unresolved
    stationOriginEsr: char("station_origin_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    stationDestEsr: char("station_dest_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    stationOriginRaw: text("station_origin_raw"),
    stationDestRaw: text("station_dest_raw"),
    cargoName: text("cargo_name"),

    wagonCountPlanned: integer("wagon_count_planned"),
    tonnagePerWagon: numeric("tonnage_per_wagon", { precision: 10, scale: 3 }),

    // pricing — NULLABLE (M3): historical directions carry no ПСЦ rate. Operator-confirmed (D16).
    rateClient: numeric("rate_client", { precision: 14, scale: 2 }),
    rateOwner: numeric("rate_owner", { precision: 14, scale: 2 }),
    // SUGGESTED values from LLM extraction — never used in margin, display only (H1/D16)
    rateClientSuggested: numeric("rate_client_suggested", { precision: 14, scale: 2 }),
    rateOwnerSuggested: numeric("rate_owner_suggested", { precision: 14, scale: 2 }),
    currency: char("currency", { length: 3 }).notNull().default("RUB"),
    rateBasis: text("rate_basis"), // per_trip | per_ton | per_wagon | lump_sum
    rateModel: text("rate_model").notNull().default("per_wagon_trip"), // per_wagon_trip | lump_sum (M4)
    paymentTermsRaw: text("payment_terms_raw"),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),

    // TRUE = historical-aggregation direction with no Order/mailbox/ПСЦ (M3)
    isSynthetic: boolean("is_synthetic").notNull().default(false),

    seededFromExtractedPriceId: uuid("seeded_from_extracted_price_id"), // FK added in P5 migration

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_directions_order").on(t.orderId),
    index("idx_directions_status").on(t.status),
    index("idx_directions_route").on(t.stationOriginEsr, t.stationDestEsr),
    check(
      "ck_directions_status",
      sql`${t.status} IN ('draft','open','active','paused','completed','cancelled')`,
    ),
    check("ck_directions_rate_model", sql`${t.rateModel} IN ('per_wagon_trip','lump_sum')`),
  ],
);
