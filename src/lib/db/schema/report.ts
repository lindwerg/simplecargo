import { char, date, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { deals } from "./deals";

// Denormalized export projection of COMPLETE deals (DB_SCHEMA §9). Fields map 1:1
// to the 17 Excel columns [0..16]. Regenerated (not overwritten) on data change;
// versioned via generation_id. margin lives here as a plain column, populated only
// when both inputs are present (D7).
export const reportRows = pgTable(
  "report_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generationId: uuid("generation_id").notNull(), // one batch = one export run (versioning)
    dealId: uuid("deal_id")
      .notNull()
      .references(() => deals.id),
    reportMonth: char("report_month", { length: 7 }).notNull(), // sheet selector

    // 17 columns, in report order [0..16]
    client: text("client"), // [0]
    origin: text("origin"), // [1] human place name
    destination: text("destination"), // [2] human place name
    revenueUa: numeric("revenue_ua", { precision: 14, scale: 2 }), // [3]
    dateTripEnd: date("date_trip_end"), // [4]
    dateArrivedLoading: date("date_arrived_loading"), // [5]
    turnoverDays: integer("turnover_days"), // [6]
    costOwner: numeric("cost_owner", { precision: 14, scale: 2 }), // [7]
    margin: numeric("margin", { precision: 14, scale: 2 }), // [8] = revenue - cost (both non-null)
    dateDispatched: date("date_dispatched"), // [9]
    wagonType: text("wagon_type"), // [10]
    wagonNumber: char("wagon_number", { length: 8 }), // [11] (written to xlsx as integer)
    waybillNumber: text("waybill_number"), // [12]
    cargoName: text("cargo_name"), // [13]
    invoiceNumber: text("invoice_number"), // [14]
    carrier: text("carrier"), // [15]
    company: text("company"), // [16]

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // export query: latest generation for a month, ordered by trip end
    index("idx_report_month_gen").on(t.reportMonth, t.generationId, t.dateTripEnd),
    index("idx_report_deal").on(t.dealId),
    index("idx_report_gen").on(t.generationId),
  ],
);
