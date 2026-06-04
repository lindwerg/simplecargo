import { char, check, date, integer, numeric, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// One row per physical wagon; the 8-digit number is the master join key (D2).
export const wagons = pgTable(
  "wagons",
  {
    wagonNumber: char("wagon_number", { length: 8 }).primaryKey(), // canonical 8-digit
    wagonType: varchar("wagon_type", { length: 20 }), // "ПВ"
    wagonSubtypeRaw: text("wagon_subtype_raw"), // "Полувагоны (60)"
    model: varchar("model", { length: 20 }), // "12-9837"
    volumeM3: numeric("volume_m3", { precision: 8, scale: 2 }),
    capacityTonnes: numeric("capacity_tonnes", { precision: 8, scale: 2 }),
    ownerAdministration: text("owner_administration"), // "РЖД (20)"
    buildDate: date("build_date"),
    nextPlannedRepairDate: date("next_planned_repair_date"),
    currentMileageKm: integer("current_mileage_km"),
    checksumValid: text("checksum_valid"), // 'ok'|'fail'|'unknown' — ADVISORY (D3)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("ck_wagons_checksum", sql`${t.checksumValid} IN ('ok','fail','unknown')`)],
);
