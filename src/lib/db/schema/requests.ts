import {
  char,
  check,
  index,
  integer,
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
import { counterparties } from "./counterparties";
import { stations } from "./geo";

// ── requests (ЗАПРОС / RFQ header) — REQUESTS_SOURCING §1, §5.2, §11 ──────────
// Pre-order intake: a client asks "can you give N wagons on these routes, at what
// price?". One row per client intake (upload / paste / voice / manual). EXPLODES
// into N request_lines, one per route — each becomes a Direction on win (R2).
//
// Locked decisions honoured:
//   D16 — clientSuggestedId is SUGGESTED only; a TEMP client lives as clientRaw
//         free-text with NO counterparty row until the operator links one.
//   D15 — routes keep raw text; ESR resolved separately, never invented.
//
// SCOPE (this slice): intake + board only. Owner-sourcing / coverage / margin /
// client-quote / win-conversion are deferred (RFQ-3..8). Therefore
// convertedOrderId + clonedFromRequestId are bare nullable uuid columns with NO
// REFERENCES yet — the FK constraints land in the RFQ-conversion migration once
// orders.request_id exists (mirrors directions.seededFromExtractedPriceId).
//
// House convention: enums = text column + CHECK constraint, never pgEnum.
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestNumber: text("request_number"), // R-YYYY-NNNN, app-generated at insert

    // D16: SUGGESTED only — never auto-confirmed downstream
    clientSuggestedId: uuid("client_suggested_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    clientRaw: text("client_raw"), // free-text label until a counterparty is linked

    status: text("status").notNull().default("new"),
    // new | sourcing | quoted | won | lost | no_bid | expired | cancelled
    channel: text("channel").notNull().default("manual"),
    // upload | voice | paste | manual

    wagonType: text("wagon_type").notNull().default("ПВ"),
    cargoName: text("cargo_name"),
    periodFrom: timestamp("period_from", { withTimezone: true }),
    periodTo: timestamp("period_to", { withTimezone: true }),

    receivedAt: timestamp("received_at", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }), // client SLA clock
    sourceRef: text("source_ref"), // filename / email message-id / "voice"
    notes: text("notes"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),

    // ── deferred FKs (bare uuid, no REFERENCES — see header note) ──
    convertedOrderId: uuid("converted_order_id"), // → orders(id), added in RFQ-conversion
    clonedFromRequestId: uuid("cloned_from_request_id"), // self-FK, added in RFQ-conversion

    // loss intelligence (terminal metadata) — REQUESTS_SOURCING §2.7
    lossReason: text("loss_reason"),
    // price | no_capacity | client_cancelled | timing | competitor | other
    competitorPrice: numeric("competitor_price", { precision: 14, scale: 2 }),
    lostTo: text("lost_to"),

    // terminal timestamps (set once on transition)
    wonAt: timestamp("won_at", { withTimezone: true }),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }), // no_bid

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_requests_status").on(t.status),
    index("idx_requests_client").on(t.clientSuggestedId),
    index("idx_requests_open").on(t.status, t.createdAt), // pipeline board scan
    check(
      "ck_requests_status",
      sql`${t.status} IN ('new','sourcing','quoted','won','lost','no_bid','expired','cancelled')`,
    ),
    check("ck_requests_channel", sql`${t.channel} IN ('upload','voice','paste','manual')`),
    check(
      "ck_requests_loss_reason",
      sql`${t.lossReason} IS NULL OR ${t.lossReason} IN ('price','no_capacity','client_cancelled','timing','competitor','other')`,
    ),
  ],
);

// ── request_lines — one origin→dest route per line (REQUESTS_SOURCING §5.3) ───
// Cascade-deleted with the parent request. Becomes one Direction on win (R2).
// D15: raw station + road always preserved; ESR nullable, resolved via dict later.
// targetRatePerWagon = the client's DESIRED rate (SUGGESTED, D16) — never a
// confirmed commercial number.
export const requestLines = pgTable(
  "request_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    sortOrder: smallint("sort_order").notNull().default(0),

    // D15: raw always present; ESR nullable (resolved via dict, never invented)
    originRaw: text("origin_raw").notNull(),
    originRoadRaw: text("origin_road_raw"), // RZD short code as written, e.g. "СВР"
    destRaw: text("dest_raw").notNull(),
    destRoadRaw: text("dest_road_raw"), // e.g. "ГОР"

    originEsr: char("origin_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),
    destEsr: char("dest_esr", { length: 6 }).references(() => stations.esrCode, {
      onDelete: "set null",
    }),

    cargoName: text("cargo_name"),
    etsngCode: varchar("etsng_code", { length: 8 }),
    wagonsRequested: integer("wagons_requested").notNull(),
    tonnagePerWagon: numeric("tonnage_per_wagon", { precision: 10, scale: 3 }),

    // D16: SUGGESTED desired rate — never auto-promoted to a confirmed rate
    targetRatePerWagon: numeric("target_rate_per_wagon", { precision: 14, scale: 2 }),
    targetRateRaw: text("target_rate_raw"), // raw rate string, e.g. "~1 900 р/ваг", "договорная"

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_request_lines_request").on(t.requestId),
    index("idx_request_lines_origin_road").on(t.originRoadRaw), // board "по дорогам"
    index("idx_request_lines_origin_station").on(t.originRaw), // board "по направлениям"
    index("idx_request_lines_stations_esr").on(t.originEsr, t.destEsr),
  ],
);
