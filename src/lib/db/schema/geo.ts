import { boolean, char, check, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Reference dictionaries (DB_SCHEMA §2). ESR is the canonical station identity
// (D4); human/report names map to ESR via station_aliases.
export const roads = pgTable(
  "roads",
  {
    rzdCode: integer("rzd_code").primaryKey(), // e.g. 24 (Горьковская), authoritative from Source A "(24)"
    shortCode: text("short_code").notNull(), // e.g. "ГОР" (Source B/D). NOT unique: codes drift.
    fullNameRu: text("full_name_ru").notNull(), // "ГОРЬКОВСКАЯ"
    fullNameTranslit: text("full_name_translit"),
  },
  (t) => [index("idx_roads_short").on(t.shortCode)],
);

export const stations = pgTable(
  "stations",
  {
    esrCode: char("esr_code", { length: 6 }).primaryKey(), // canonical key, e.g. "243309"
    nameEtran: text("name_etran").notNull(), // raw ЭТРАН name "ДОБРЯТИНО"
    nameNormalized: text("name_normalized").notNull(), // uppercase, NFKD, punctuation-stripped
    roadCode: integer("road_code").references(() => roads.rzdCode),
    region: text("region"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lon: numeric("lon", { precision: 9, scale: 6 }),
    isQuarantined: boolean("is_quarantined").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_stations_name_norm").on(t.nameNormalized),
    index("idx_stations_road").on(t.roadCode),
  ],
);

export const stationAliases = pgTable(
  "station_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    esrCode: char("esr_code", { length: 6 })
      .notNull()
      .references(() => stations.esrCode),
    alias: text("alias").notNull(), // "Асбест"
    aliasNormalized: text("alias_normalized").notNull().unique(), // one normalized alias → exactly one ESR
    source: text("source").notNull().default("manual"), // report | manual | fuzzy_confirmed
    confidence: numeric("confidence", { precision: 4, scale: 3 }), // 1.0 exact, <1.0 fuzzy
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_alias_esr").on(t.esrCode),
    check("ck_alias_source", sql`${t.source} IN ('report','manual','fuzzy_confirmed')`),
  ],
);
