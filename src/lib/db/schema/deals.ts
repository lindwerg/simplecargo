import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";
import { directions } from "./directions";
import { wagons } from "./wagons";

// One completed trip = one report row (DB_SCHEMA §7). Unit of margin and turnover.
// Money/commercial fields are operator-entered or contract-resolved; movement-derived
// fields come from the matched rows.
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wagonNumber: char("wagon_number", { length: 8 })
      .notNull()
      .references(() => wagons.wagonNumber),
    waybillNumber: text("waybill_number"), // primary movement→deal join key
    reportMonth: char("report_month", { length: 7 }).notNull(), // "2026-08" (month of trip_end_ts, MSK)

    // commercial parties
    clientId: uuid("client_id").references(() => counterparties.id), // Клиент (pays us)
    ownerId: uuid("owner_id").references(() => counterparties.id), // Поставщик вагона (we pay)
    carrierRaw: text("carrier_raw"), // перевозчик "Алькон"
    companyRaw: text("company_raw").default("Приоритет Логистика"),

    // route (ESR resolved → human name on export)
    stationOriginEsr: char("station_origin_esr", { length: 6 }),
    stationDestEsr: char("station_dest_esr", { length: 6 }),
    cargoName: text("cargo_name"),
    wagonType: varchar("wagon_type", { length: 20 }).default("ПВ"),

    // financials (D7). margin is a generated STORED column — Postgres yields NULL
    // when either input is NULL, so a half-filled deal never shows a misleading
    // margin. The report-export path additionally gates on both-non-null.
    revenueUa: numeric("revenue_ua", { precision: 14, scale: 2 }), // Сумма УА
    costOwner: numeric("cost_owner", { precision: 14, scale: 2 }), // Сумма от Поставщика
    margin: numeric("margin", { precision: 14, scale: 2 }).generatedAlwaysAs(
      sql`revenue_ua - cost_owner`,
    ),
    revenueSource: text("revenue_source"), // manual | contract
    costSource: text("cost_source"), // manual | contract

    // dates (UTC)
    dateTripEndTs: timestamp("date_trip_end_ts", { withTimezone: true }), // Дата окончания рейса [4]
    dateArrivedLoadingTs: timestamp("date_arrived_loading_ts", { withTimezone: true }), // дата прибытия на погрузку [5]
    dateDispatchedTs: timestamp("date_dispatched_ts", { withTimezone: true }), // Дата выполнения (отправки) [9]

    // turnover (D5: cycle, cross-row computed)
    turnoverDays: integer("turnover_days"),
    turnoverProvisional: boolean("turnover_provisional").notNull().default(false), // excluded from KPI avgs

    invoiceNumber: text("invoice_number"), // Счет фактура [14]

    // Direction binding at TRIP grain (R1). Nullable for legacy/historical deals;
    // wagon_movements is deliberately NOT given a direction_id.
    directionId: uuid("direction_id").references(() => directions.id, { onDelete: "set null" }),
    directionMatchMethod: text("direction_match_method"), // email_scope | manual | historical_import

    status: text("status").notNull().default("OPEN"), // OPEN|ACTIVE|COMPLETE|CONFLICT|ABANDONED
    sourceMovementIds: bigint("source_movement_ids", { mode: "number" }).array(),
    conflictFlags: jsonb("conflict_flags"), // field-level disagreements
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_deals_wagon").on(t.wagonNumber),
    index("idx_deals_waybill").on(t.waybillNumber),
    index("idx_deals_month").on(t.reportMonth),
    index("idx_deals_status").on(t.status),
    index("idx_deals_client").on(t.clientId),
    // KPI aggregation at trip grain (R1)
    index("idx_deals_direction").on(t.directionId),
    // report query: a month's completed deals ordered by trip end
    index("idx_deals_month_end").on(t.reportMonth, t.dateTripEndTs),
    // matching open deals by wagon + dispatch-time window
    index("idx_deals_match").on(t.wagonNumber, t.dateDispatchedTs),
    // deals still missing financials (alert/pending UI) — partial
    index("idx_deals_pending")
      .on(t.reportMonth)
      .where(sql`${t.status} = 'COMPLETE' AND (${t.revenueUa} IS NULL OR ${t.costOwner} IS NULL)`),
    check("ck_deals_status", sql`${t.status} IN ('OPEN','ACTIVE','COMPLETE','CONFLICT','ABANDONED')`),
    check("ck_deals_revenue_source", sql`${t.revenueSource} IN ('manual','contract')`),
    check("ck_deals_cost_source", sql`${t.costSource} IN ('manual','contract')`),
    check(
      "ck_deals_direction_match_method",
      sql`${t.directionMatchMethod} IS NULL OR ${t.directionMatchMethod} IN ('email_scope','manual','historical_import')`,
    ),
  ],
);
