import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { counterparties } from "./counterparties";

// Contact persons attached to a counterparty (company). The Партнёры tab is
// company-centric: phones/emails hang off the company so the operator can fill the
// base by company. The lowercased-email index is the reverse-resolution key
// "incoming e-mail address → company" — the foundation for the future inbound-mail
// flow (auto-identify the sender company, auto-form a request). House convention:
// enums as text + CHECK; no pgEnum.
export const counterpartyContacts = pgTable(
  "counterparty_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    counterpartyId: uuid("counterparty_id")
      .notNull()
      .references(() => counterparties.id, { onDelete: "cascade" }),
    fullName: text("full_name"), // ФИО контактного лица
    position: text("position"), // должность
    phone: text("phone"),
    email: text("email"), // stored normalized (trim + lowercase)
    isPrimary: boolean("is_primary").notNull().default(false),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_cp_contact_counterparty").on(t.counterpartyId),
    // HOT PATH (future inbound mail): resolve a sender address → company.
    // Functional index on lower(email); Drizzle emits the expression via sql``.
    index("idx_cp_contact_email_lower").on(sql`lower(${t.email})`),
  ],
);
