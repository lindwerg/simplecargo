import { check, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { directions } from "./directions";
import { counterparties } from "./counterparties";

// Per-Direction email routing nodes (PRODUCT_DIRECTIONS §3.1, SCHEMA_DELTA §3.3/§3.4).
// An owner (provides wagons) is bound to a source mailbox (where its dislocations
// arrive); a client is bound to a forward email. P15-3 builds the tables + manual
// binding CRUD + activation enforcement; the actual email ingestion/forwarding is P3.
// House convention: enums as text + CHECK (no pgEnum).

// 1 direction → N owners (split wagon lots). `inbound_mailbox` is the PRIMARY routing
// key (R4: a scoping filter, not a matcher). A partial unique index
// `uq_owner_mailbox_live` (one active mailbox → one active binding) is added in the
// migration SQL (Drizzle does not emit partial unique indexes here).
export const directionOwnerBindings = pgTable(
  "direction_owner_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    directionId: uuid("direction_id")
      .notNull()
      .references(() => directions.id, { onDelete: "cascade" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => counterparties.id, { onDelete: "restrict" }),
    inboundMailbox: text("inbound_mailbox").notNull(), // normalized lowercase sender address
    expectedWagonIds: text("expected_wagon_ids").array(), // shared-mailbox discriminator (post-MVP fan-out)
    wagonCountAllocated: integer("wagon_count_allocated"),
    ownerRateOverride: numeric("owner_rate_override", { precision: 14, scale: 2 }),
    status: text("status").notNull().default("active"), // active | inactive
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_dir_owner_bind_direction").on(t.directionId),
    // HOT PATH (P3): inbound email → candidate scope lookup.
    index("idx_dir_owner_bind_mailbox").on(t.inboundMailbox),
    check("ck_dir_owner_bind_status", sql`${t.status} IN ('active','inactive')`),
  ],
);

// Forward target — the operator-confirmed paying client (D16), separate from the
// Грузополучатель/consignee.
export const directionClientBindings = pgTable(
  "direction_client_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    directionId: uuid("direction_id")
      .notNull()
      .references(() => directions.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => counterparties.id, { onDelete: "restrict" }),
    forwardToEmail: text("forward_to_email").notNull(),
    forwardCcEmails: text("forward_cc_emails").array(),
    status: text("status").notNull().default("active"), // active | inactive
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_dir_client_bind_direction").on(t.directionId),
    index("idx_dir_client_bind_forward").on(t.forwardToEmail),
    check("ck_dir_client_bind_status", sql`${t.status} IN ('active','inactive')`),
  ],
);
