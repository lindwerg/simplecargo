import {
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { stations } from "./geo";

// ── Distance graph (TARIFF_CALCULATOR §4.1) — ТР-4 расстояние ─────────────────
// L = spur(origin→ТП) + backbone(ТП↔ТП) + spur(ТП→dest). Graph vertices are
// transit points (ТП); edges are split into two layers: free radial spurs (from
// CSV field[4]) and the published Книга-3 backbone (weights PINNED, never shortened).
// special_distance overrides win over any computed sum; hub_fixed_distance adds
// CONDITIONAL узел overrides (Moscow +54 / SPb +25) handled in compute code.

// transit points (graph vertices). Seed from CSV rows where field[4] == 'ТП'.
export const tpNode = pgTable("tp_node", {
  esrCode: char("esr_code", { length: 6 })
    .primaryKey()
    .references(() => stations.esrCode),
  name: text("name"),
  roadCode: text("road_code"),
  isBorder: boolean("is_border").notNull().default(false),
  country: text("country"), // 'RF' | CIS admin
});

// unified edge table (radial spur + backbone Книга 3). PK (from_esr, to_esr, layer)
// lets one ordered pair carry distinct spur and backbone weights. Store backbone
// symmetric with from_esr < to_esr; index on from_esr for the hot fan-out query.
export const tariffEdges = pgTable(
  "tariff_edges",
  {
    fromEsr: char("from_esr", { length: 6 })
      .notNull()
      .references(() => stations.esrCode),
    toEsr: char("to_esr", { length: 6 })
      .notNull()
      .references(() => stations.esrCode),
    km: integer("km").notNull(),
    layer: text("layer").notNull(), // 'spur' | 'backbone'
  },
  (t) => [
    primaryKey({ columns: [t.fromEsr, t.toEsr, t.layer] }),
    index("idx_tariff_edges_from").on(t.fromEsr),
    check("ck_tariff_edges_km", sql`${t.km} >= 0`),
    check("ck_tariff_edges_layer", sql`${t.layer} IN ('spur','backbone')`),
  ],
);

// узел fixed-distance overrides. Conditional same-line exclusion lives in compute
// code (skip the override when entry/exit ride the same line). Multi-node city
// decomposition (Moscow, SPb) reconciled in code via hub_name.
export const hubFixedDistance = pgTable(
  "hub_fixed_distance",
  {
    hubName: text("hub_name").notNull(),
    fromLine: text("from_line").notNull(),
    toLine: text("to_line").notNull(),
    km: integer("km").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.hubName, t.fromLine, t.toLine] }),
    check("ck_hub_fixed_distance_km", sql`${t.km} >= 0`),
  ],
);

// §2 особые/кратчайшие расстояния — hard overrides that win over computed sum.
export const specialDistance = pgTable(
  "special_distance",
  {
    aEsr: char("a_esr", { length: 6 })
      .notNull()
      .references(() => stations.esrCode),
    bEsr: char("b_esr", { length: 6 })
      .notNull()
      .references(() => stations.esrCode),
    km: integer("km").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.aEsr, t.bEsr] }),
    check("ck_special_distance_km", sql`${t.km} >= 0`),
    // Canonical ordering: always store the lexicographically smaller ESR as a_esr.
    // Seeds and callers must normalize pairs before insert; the compute engine looks
    // up both orientations (findSpecial handles reversal), but the DB constraint
    // prevents accidentally storing duplicates in both orders.
    check("ck_special_distance_order", sql`${t.aEsr} < ${t.bEsr}`),
  ],
);
