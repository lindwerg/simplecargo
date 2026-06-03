import {
  type AnyPgColumn,
  bigint,
  bigserial,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { ingestedFiles } from "./ingest";
import { wagons } from "./wagons";

// Core append-only time-series fact table (DB_SCHEMA §6). One row per
// operation/snapshot per wagon per file. Never updated in place — only the
// is_primary / superseded_by / needs_review flags flip. Highest-volume table;
// carries the join-key indexes that power turnover and report queries.
export const wagonMovements = pgTable(
  "wagon_movements",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    fingerprint: char("fingerprint", { length: 64 }).notNull(), // row-level dedup hash (D6)
    eventKey: char("event_key", { length: 64 }).notNull(), // cross-source canonical event (D6)
    sourceFileId: uuid("source_file_id").references(() => ingestedFiles.id),
    sourceType: char("source_type", { length: 1 }).notNull(),

    // dedup / merge bookkeeping
    isPrimary: boolean("is_primary").notNull().default(true),
    supersededBy: bigint("superseded_by", { mode: "number" }).references(
      (): AnyPgColumn => wagonMovements.id,
    ),
    needsReview: boolean("needs_review").notNull().default(false),

    // identity
    wagonNumber: char("wagon_number", { length: 8 })
      .notNull()
      .references(() => wagons.wagonNumber),
    waybillNumber: text("waybill_number"), // secondary join key, nullable
    shipmentId: text("shipment_id"), // Source A "2024ЭУ477040"

    // operation
    operationCode: varchar("operation_code", { length: 16 }), // mnemonic "УВПП"
    operationName: text("operation_name"), // "ВЫГРУЗКА НА ПП"
    operationTs: timestamp("operation_ts", { withTimezone: true }),
    loadState: text("load_state"), // ГРУЖ|ПОР|UNKNOWN

    // trip timing (all UTC, parsed-as-MSK)
    tripStartTs: timestamp("trip_start_ts", { withTimezone: true }),
    departTs: timestamp("depart_ts", { withTimezone: true }),
    arriveTs: timestamp("arrive_ts", { withTimezone: true }), // arrival at current dislocation
    estArrivalTs: timestamp("est_arrival_ts", { withTimezone: true }),
    deliveryDeadlineTs: timestamp("delivery_deadline_ts", { withTimezone: true }),

    // stations (raw + resolved ESR)
    stationDepartEsr: char("station_depart_esr", { length: 6 }),
    stationDepartRaw: text("station_depart_raw"),
    roadDepartRaw: text("road_depart_raw"),
    stationCurrentEsr: char("station_current_esr", { length: 6 }),
    stationCurrentRaw: text("station_current_raw"),
    roadCurrentRaw: text("road_current_raw"),
    stationDestEsr: char("station_dest_esr", { length: 6 }),
    stationDestRaw: text("station_dest_raw"),
    roadDestRaw: text("road_dest_raw"),

    // cargo
    cargoName: text("cargo_name"),
    cargoCodeEtsng: varchar("cargo_code_etsng", { length: 16 }),
    cargoWeightKg: numeric("cargo_weight_kg", { precision: 12, scale: 2 }),
    shipperRaw: text("shipper_raw"),
    consigneeRaw: text("consignee_raw"),

    // KPIs / metrics
    idleDaysStation: numeric("idle_days_station", { precision: 6, scale: 2 }),
    idleDaysOperation: numeric("idle_days_operation", { precision: 6, scale: 2 }),
    daysNoOperation: integer("days_no_operation"),
    daysNoMovement: integer("days_no_movement"),
    distRemainingKm: integer("dist_remaining_km"),
    distTraveledKm: integer("dist_traveled_km"),
    distTotalKm: integer("dist_total_km"),
    trainIndex: text("train_index"),
    parkTypeRaw: text("park_type_raw"),

    rawJson: jsonb("raw_json"), // full original row for audit
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Row idempotency — fingerprint COALESCEs NULL operation_ts to a sentinel in
    // app code before hashing (SQL NULLs aren't equal → silent dups otherwise, D6).
    uniqueIndex("ux_wm_fingerprint").on(t.fingerprint),
    // join keys (D2/D5)
    index("idx_wm_wagon").on(t.wagonNumber),
    index("idx_wm_waybill").on(t.waybillNumber),
    // cross-source event collapse
    index("idx_wm_event").on(t.eventKey),
    // turnover / lifecycle: ordered scan of a wagon's events by time
    index("idx_wm_wagon_ts").on(t.wagonNumber, t.operationTs),
    // loading-event lookup for cycle turnover (partial: only loaded-at-origin)
    index("idx_wm_load_event")
      .on(t.wagonNumber, t.operationTs)
      .where(sql`${t.loadState} = 'ГРУЖ'`),
    // matching by (wagon, waybill, time-window)
    index("idx_wm_match").on(t.wagonNumber, t.waybillNumber, t.operationTs),
    // operator review queue (partial)
    index("idx_wm_review").on(t.needsReview).where(sql`${t.needsReview} = TRUE`),
    check("ck_wm_load_state", sql`${t.loadState} IN ('ГРУЖ','ПОР','UNKNOWN')`),
  ],
);
