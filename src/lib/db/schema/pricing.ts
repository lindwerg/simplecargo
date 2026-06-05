import {
  type AnyPgColumn,
  char,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { stations } from "./geo";

// Versioned, route-keyed price book (SCHEMA_DELTA §9.2). A real ПСЦ is NOT a scalar:
// it holds N rate lines keyed (origin, dest, wagon_type) → rate/wagon, issued as an
// Приложение to a parent Договор and superseded by a newer приложение (п.4). A
// Direction's rate_client/rate_owner are resolved SNAPSHOTS of the applicable line at
// trip time, frozen onto the deal (immutability D8/D17) — these tables are the source
// of truth they resolve against.

// Parent Договор with a counterparty (client OR owner).
export const counterpartyContracts = pgTable(
  "counterparty_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contractRef: text("contract_ref").notNull(), // "ТЭО/04-26/07", "№2 от 11.11.2025"
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => counterparties.id),
    signedOn: timestamp("signed_on", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_contracts_ref").on(t.contractRef)],
);

// ПСЦ header — one protocol, versioned via приложение (self-FK supersede chain).
export const priceProtocols = pgTable(
  "price_protocols",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolNumber: text("protocol_number"), // "ПРОТОКОЛ № 1"
    contractId: uuid("contract_id").references(() => counterpartyContracts.id, {
      onDelete: "set null",
    }),
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => counterparties.id),
    side: text("side").notNull(), // owner_cost | client_revenue — derived from РНС role (§9.1)
    protocolDate: timestamp("protocol_date", { withTimezone: true }),
    vatInclusive: text("vat_inclusive").notNull().default("yes"), // yes | no | unknown
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).default(sql`22.00`),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    supersededBy: uuid("superseded_by").references((): AnyPgColumn => priceProtocols.id, {
      onDelete: "set null",
    }), // newer приложение
    sourceDocumentId: uuid("source_document_id"), // FK → source_documents (P5)
    status: text("status").notNull().default("active"), // active | superseded
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_psc_counterparty").on(t.counterpartyId, t.side),
    check("ck_psc_side", sql`${t.side} IN ('owner_cost','client_revenue')`),
    check("ck_psc_status", sql`${t.status} IN ('active','superseded')`),
  ],
);

// The rate lines — the actual price book.
export const priceProtocolRates = pgTable(
  "price_protocol_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolId: uuid("protocol_id")
      .notNull()
      .references(() => priceProtocols.id, { onDelete: "cascade" }),
    originEsr: char("origin_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    destEsr: char("dest_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    originRaw: text("origin_raw").notNull(), // "ДОБРЯТИНО" (ПСЦ has bare names, no ESR)
    destRaw: text("dest_raw").notNull(), // "НОГИНСК"
    wagonType: text("wagon_type").notNull(), // "Полувагон"
    rate: numeric("rate", { precision: 14, scale: 2 }).notNull(), // 19000
    currency: char("currency", { length: 3 }).notNull().default("RUB"),
    rateBasis: text("rate_basis").notNull().default("per_wagon"),
    vatInclusive: text("vat_inclusive").notNull().default("yes"),
  },
  // HOT PATH: resolve a Direction's rate by (protocol, origin, dest, wagon_type).
  (t) => [index("idx_psc_rate_route").on(t.protocolId, t.originRaw, t.destRaw, t.wagonType)],
);
