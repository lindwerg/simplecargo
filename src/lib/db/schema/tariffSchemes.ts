import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ── ТР-1 rate schemes + coefficient tables (TARIFF_CALCULATOR §4.3 / §4.4) ─────
// Прейскурант 10-01 loaded-car tariff = И(iScheme,L)×K1(class,L)×K3×K4×K5
//   + [В(vScheme,L) if ownership='rzd'] + [порожний if ownership='own'].
// Rates are stored as пояса дальности (distance belts), one row per belt. K1 is a
// (class, distance) TABLE with a max-of-two rule (class_coeff vs distance_corr),
// NOT a scalar. Coefficient/indexation stack (порожний/контейнер/Минстрой) lives
// in tariff_coefficients because tariff_indexations cannot discriminate them.

// Scheme dictionary: 'И1'..'И18' (kind 'I') and 'В1'..'В15' (kind 'V').
export const tariffScheme = pgTable(
  "tariff_scheme",
  {
    schemeCode: text("scheme_code").primaryKey(),
    kind: text("kind").notNull(), // 'I' | 'V'
    classDependent: boolean("class_dependent").notNull().default(false),
    description: text("description"),
  },
  (t) => [check("ck_tariff_scheme_kind", sql`${t.kind} IN ('I','V')`)],
);

// (wagon, ownership, shipment) → (И-scheme, В-scheme). v_scheme null for own wagons.
export const wagonSchemeMap = pgTable(
  "wagon_scheme_map",
  {
    wagonType: text("wagon_type").notNull(), // canonical (src/lib/wagons)
    ownership: text("ownership").notNull(), // 'rzd' | 'own'
    shipmentType: text("shipment_type").notNull(), // 'wagon' | 'group' | 'route'
    iSchemeCode: text("i_scheme_code").references(() => tariffScheme.schemeCode),
    vSchemeCode: text("v_scheme_code").references(() => tariffScheme.schemeCode), // null for own
  },
  (t) => [
    primaryKey({ columns: [t.wagonType, t.ownership, t.shipmentType] }),
    check("ck_wagon_scheme_ownership", sql`${t.ownership} IN ('rzd','own')`),
    check(
      "ck_wagon_scheme_shipment",
      sql`${t.shipmentType} IN ('wagon','group','route')`,
    ),
  ],
);

// пояс дальности → ставка for a scheme. One row per (scheme, dist_from, weight_t).
// weight_t = -1 for 1-D schemes (И2–И7, В*) and a positive integer (tons) for
// 2-D weight×distance schemes (N8, И1 — 70 weight breakpoints × 129 distance belts).
// Using -1 as the "no weight dimension" sentinel allows a NOT NULL PK column while
// still distinguishing 1-D rows from the 2-D rows that N8/И1 require. Seeds for 1-D
// schemes set weight_t = -1; seeds for N8/И1 set the actual tonnage breakpoint.
export const tariffRateBelt = pgTable(
  "tariff_rate_belt",
  {
    schemeCode: text("scheme_code")
      .notNull()
      .references(() => tariffScheme.schemeCode),
    distFromKm: integer("dist_from_km").notNull(),
    distToKm: integer("dist_to_km").notNull(),
    // -1 = 1-D scheme (no weight dimension); positive = weight breakpoint in tons.
    weightT: smallint("weight_t").notNull().default(-1),
    rateRub: numeric("rate_rub", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.schemeCode, t.distFromKm, t.weightT] }),
    check("ck_tariff_rate_belt_range", sql`${t.distToKm} >= ${t.distFromKm}`),
    check("ck_tariff_rate_belt_rate", sql`${t.rateRub} >= 0`),
    check("ck_tariff_rate_belt_weight", sql`${t.weightT} = -1 OR ${t.weightT} > 0`),
  ],
);

// K1 as a (class, distance) lookup — NOT a scalar (§2.4). class 2 = 1.0.
// For class 3, two rows share the same (freightClass, distFromKm): one has a
// specific etsng_group note (k1=1.74 for listed positions), the other is the
// default fallback (k1=1.54 for everything else). etsng_group='' is the default.
export const classCoeff = pgTable(
  "class_coeff",
  {
    freightClass: smallint("freight_class").notNull(),
    distFromKm: integer("dist_from_km").notNull(),
    distToKm: integer("dist_to_km").notNull(),
    k1: numeric("k1", { precision: 6, scale: 4 }).notNull(),
    // Non-empty for the named-ETSNG-group variant of a class belt (class 3 only).
    // '' (empty string) is the default/fallback row for any cargo not in the named group.
    etsngGroup: text("etsng_group").notNull().default(""),
  },
  (t) => [
    primaryKey({ columns: [t.freightClass, t.distFromKm, t.etsngGroup] }),
    check("ck_class_coeff_class", sql`${t.freightClass} IN (1,2,3)`),
    check("ck_class_coeff_range", sql`${t.distToKm} >= ${t.distFromKm}`),
  ],
);

// long-haul taper (Таблица 5); max-of-two with class_coeff per pt 16.7.3.
export const distanceCorr = pgTable(
  "distance_corr",
  {
    distFromKm: integer("dist_from_km").primaryKey(),
    distToKm: integer("dist_to_km").notNull(),
    kTable5: numeric("k_table5", { precision: 6, scale: 4 }).notNull(),
  },
  (t) => [check("ck_distance_corr_range", sql`${t.distToKm} >= ${t.distFromKm}`)],
);

// per-axle порожний (empty-run) rate by distance belt; applies when ownership='own'.
export const emptyRunScheme = pgTable(
  "empty_run_scheme",
  {
    axles: smallint("axles").notNull(),
    distFromKm: integer("dist_from_km").notNull(),
    distToKm: integer("dist_to_km").notNull(),
    rateRub: numeric("rate_rub", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.axles, t.distFromKm] }),
    check("ck_empty_run_range", sql`${t.distToKm} >= ${t.distFromKm}`),
    check("ck_empty_run_rate", sql`${t.rateRub} >= 0`),
  ],
);

// coefficient stack (§4.4): индексации (kind 'index') + multiplier coefs (kind
// 'coef') with a discriminator (порожний/контейнер/Минстрой/класс) and date window.
export const tariffCoefficients = pgTable(
  "tariff_coefficients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    kind: text("kind").notNull(), // 'index' | 'coef'
    multiplier: numeric("multiplier", { precision: 8, scale: 4 }).notNull(), // 1.1, 0.9492, …
    appliesTo: text("applies_to").notNull(), // 'all'|'porozhny'|'container'|'minstroy'|'class'
    appliesToClass: smallint("applies_to_class"), // when applies_to='class'
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
  },
  (t) => [
    index("idx_tariff_coeff_effective").on(t.effectiveFrom),
    check("ck_tariff_coeff_kind", sql`${t.kind} IN ('index','coef')`),
    check(
      "ck_tariff_coeff_applies_to",
      sql`${t.appliesTo} IN ('all','porozhny','container','minstroy','class')`,
    ),
    check(
      "ck_tariff_coeff_class",
      sql`${t.appliesToClass} IS NULL OR ${t.appliesToClass} IN (1,2,3)`,
    ),
  ],
);
