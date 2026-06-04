import { index, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

// Unified table for clients, owners, shippers, consignees, carriers (DB_SCHEMA §3).
export const counterparties = pgTable(
  "counterparties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nameCanonical: text("name_canonical").notNull().unique(), // "Ураласбест"
    nameRawVariants: text("name_raw_variants").array(), // all raw strings seen, for fuzzy match
    roles: text("roles").array().notNull().default([]), // {client,owner,shipper,consignee,carrier}
    inn: varchar("inn", { length: 12 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_counterparty_inn").on(t.inn)],
);
