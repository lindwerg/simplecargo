import { char, check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { directions } from "./directions";
import { users } from "./auth";
import { priceProtocols } from "./pricing";

// Per-month rate version for a Direction (plan §4, Фаза 4). The operator agrees the
// rate for an upcoming month ahead of time (the rate for May is agreed at the end of
// April), so a Direction's commercial rate is versioned per `effective_month`.
//
// D16/H1: confirmed money is operator-entered. LLM/desired rates land in *_suggested;
// nothing here is auto-confirmed. A row is `proposed` until the operator promotes it to
// `agreed` — only `agreed` rows resolve onto a trip (deals) via rateResolve.ts.
//
// UNIQUE(direction_id, effective_month) — one rate version per month per direction; added
// in the migration SQL by hand (drizzle-kit does not always emit a composite unique).
export const directionMonthlyRates = pgTable(
  "direction_monthly_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    directionId: uuid("direction_id")
      .notNull()
      .references(() => directions.id, { onDelete: "cascade" }),
    effectiveMonth: char("effective_month", { length: 7 }).notNull(), // "2026-05" (MSK month)

    // Confirmed (agreed) rates — operator-entered (D16). NULL until set.
    rateClient: numeric("rate_client", { precision: 14, scale: 2 }),
    rateOwner: numeric("rate_owner", { precision: 14, scale: 2 }),
    // Suggested (LLM/desired) rates — display-only, never used in margin (H1/D16).
    rateClientSuggested: numeric("rate_client_suggested", { precision: 14, scale: 2 }),
    rateOwnerSuggested: numeric("rate_owner_suggested", { precision: 14, scale: 2 }),

    currency: char("currency", { length: 3 }).notNull().default("RUB"),
    rateBasis: text("rate_basis"), // per_trip | per_ton | per_wagon | lump_sum

    status: text("status").notNull().default("proposed"), // proposed | agreed
    agreedAt: timestamp("agreed_at", { withTimezone: true }),
    agreedBy: uuid("agreed_by").references(() => users.id, { onDelete: "set null" }),

    // Provenance: a ПСЦ protocol the rate was resolved/snapshotted from (optional).
    sourceProtocolId: uuid("source_protocol_id").references(() => priceProtocols.id, {
      onDelete: "set null",
    }),

    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // HOT PATH (rateResolve): direction + status='agreed' scan ordered by month.
    index("idx_dir_monthly_rates_direction_status").on(t.directionId, t.status),
    check("ck_dir_monthly_rates_status", sql`${t.status} IN ('proposed','agreed')`),
  ],
);
