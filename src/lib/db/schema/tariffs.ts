import {
  char,
  check,
  index,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users } from "./auth";
import { stations } from "./geo";

// ── tariff_rates — operator-entered Прейскурант 10-01 base, REMEMBERED per route ──
// Operator decision (RFQ upgrade, Goal 4): we do NOT integrate a licensed live 10-01
// calculator. Instead the operator enters the РЖД base tariff (₽/wagon) for a route
// when they look it up; we remember it keyed by (origin, dest, wagon type, freight
// class) so a REPEAT route auto-substitutes the known base. The тариф depends on the
// cargo's тарифный класс (1/2/3 of Прейскурант 10-01, derived from ЕТСНГ) — different
// groups carry different tariffs — so class is part of the key.
//
// The stored amount is the UN-indexed base as of `effectiveFrom`. Periodic РЖД
// increases live in tariff_indexations and are applied at resolve time (so an old
// base stays correct, and the indexed value recomputes for new trips). D15: raw
// route text always preserved; ESR nullable.
export const tariffRates = pgTable(
  "tariff_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    originEsr: char("origin_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    destEsr: char("dest_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    originRaw: text("origin_raw").notNull(),
    destRaw: text("dest_raw").notNull(),

    wagonType: text("wagon_type"), // canonical code (src/lib/wagons), nullable = any
    freightClass: smallint("freight_class"), // 1|2|3 — тарифный класс груза (10-01)
    etsngCode: varchar("etsng_code", { length: 8 }), // optional ЕТСНГ for precision

    baseAmount: numeric("base_amount", { precision: 14, scale: 2 }).notNull(), // ₽/wagon, un-indexed
    currency: char("currency", { length: 3 }).notNull().default("RUB"),
    tariffRef: text("tariff_ref").notNull().default("10-01"),
    vatInclusive: text("vat_inclusive").notNull().default("no"), // 10-01 обычно без НДС

    effectiveFrom: timestamp("effective_from", { withTimezone: true }), // base as-of date
    source: text("source").notNull().default("manual"), // manual | imported
    notes: text("notes"),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // HOT PATH: look up a remembered tariff by route + wagon type + class.
    index("idx_tariff_rates_route").on(t.originRaw, t.destRaw, t.wagonType, t.freightClass),
    index("idx_tariff_rates_esr").on(t.originEsr, t.destEsr),
    check("ck_tariff_rates_class", sql`${t.freightClass} IS NULL OR ${t.freightClass} IN (1,2,3)`),
    check(
      "ck_tariff_rates_vat",
      sql`${t.vatInclusive} IN ('yes','no','unknown')`,
    ),
  ],
);

// ── tariff_indexations — РЖД periodic % increases (settings-level) ────────────
// "иногда РЖД увеличивает стоимость тарифа на пару процентов" — the operator records
// each indexation here; resolveTariff() compounds every indexation effective between a
// base's effectiveFrom and the as-of date, so remembered bases recompute to the correct
// current tariff without re-entry. appliesToClass NULL = applies to all classes.
export const tariffIndexations = pgTable(
  "tariff_indexations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(), // "Индексация РЖД с 01.01.2026"
    pct: numeric("pct", { precision: 6, scale: 3 }).notNull(), // +1.500 (% applied multiplicatively)
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    appliesToClass: smallint("applies_to_class"), // NULL = all classes
    tariffRef: text("tariff_ref").notNull().default("10-01"),
    notes: text("notes"),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_tariff_idx_effective").on(t.effectiveFrom),
    check(
      "ck_tariff_idx_class",
      sql`${t.appliesToClass} IS NULL OR ${t.appliesToClass} IN (1,2,3)`,
    ),
  ],
);
