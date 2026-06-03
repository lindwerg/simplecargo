import { char, check, date, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";

// Rate cards for auto-resolving revenue_ua (client) / cost_owner (owner) when a
// deal is created. Operator-entered prices always override (D8). DB_SCHEMA §8.
export const contractPrices = pgTable(
  "contract_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => counterparties.id),
    counterpartyType: text("counterparty_type").notNull(), // CLIENT | OWNER
    wagonType: text("wagon_type"), // "ПВ" or NULL = any
    routeOriginEsr: char("route_origin_esr", { length: 6 }), // NULL = any
    routeDestEsr: char("route_dest_esr", { length: 6 }), // NULL = any
    rateRub: numeric("rate_rub", { precision: 14, scale: 2 }).notNull(),
    rateBasis: text("rate_basis").notNull(), // PER_TRIP | PER_TON | PER_DAY
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_contract_lookup").on(
      t.counterpartyType,
      t.wagonType,
      t.routeOriginEsr,
      t.routeDestEsr,
      t.validFrom,
      t.validTo,
    ),
    index("idx_contract_cp").on(t.counterpartyId),
    check("ck_contract_cp_type", sql`${t.counterpartyType} IN ('CLIENT','OWNER')`),
    check("ck_contract_rate_basis", sql`${t.rateBasis} IN ('PER_TRIP','PER_TON','PER_DAY')`),
  ],
);
