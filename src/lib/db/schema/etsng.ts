import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── ЕТСНГ номенклатура + тарифный класс (TARIFF_CALCULATOR §4.2) ──────────────
// Maps a cargo's ЕТСНГ code to its Прейскурант 10-01 тарифный класс (1..3) and to
// МВН (минимальная весовая норма). mvnRaw keeps the source string ("кр, пв-г/п,
// пл-46" | "40" | "г/п"); mvnByWagon is the parsed per-wagon-type lookup
// ({ kr?, pv?, pl?, default? }, each number tons | "gp" = по грузоподъёмности).
export const etsng = pgTable(
  "etsng",
  {
    code: varchar("code", { length: 6 }).primaryKey(), // "232431"
    name: text("name").notNull(),
    tariffClass: integer("tariff_class").notNull(), // 1..3
    mvnRaw: text("mvn_raw"), // raw МВН string preserved
    mvnByWagon: jsonb("mvn_by_wagon"), // { kr?, pv?, pl?, default? } each number | "gp"
    groupCode: varchar("group_code", { length: 2 }), // "23"
    sourceUrl: text("source_url"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_etsng_class").on(t.tariffClass),
    index("idx_etsng_name").on(t.name),
    check("ck_etsng_class", sql`${t.tariffClass} IN (1,2,3)`),
  ],
);
