import { z } from "zod";

import { counterpartyInputSchema } from "@/lib/pricing/schema";

// Request validation for Deal (orders) CRUD (Фаза 1). A proactive deal is created
// with only a label and an OPTIONAL suggested client (D16: the client is advisory
// until confirmed per-direction). Composition (directions / stone) is added later.

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// YYYY-MM bucket for monthly P&L. Optional; validated when present.
const reportMonth = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Месяц в формате ГГГГ-ММ")
  .optional();

export const createTradeSchema = z.object({
  title: optionalText,
  orderNumber: optionalText,
  // D16: SUGGESTED client only — never auto-confirmed downstream.
  client: counterpartyInputSchema.optional(),
  reportMonth,
  notes: optionalText,
});

export const updateTradeSchema = z
  .object({
    title: optionalText,
    orderNumber: optionalText,
    client: counterpartyInputSchema.optional(),
    reportMonth,
    notes: optionalText,
  })
  .partial();

export type CreateTradeInput = z.infer<typeof createTradeSchema>;
export type UpdateTradeInput = z.infer<typeof updateTradeSchema>;

// ── Conversion scenario (Фаза 3) — Запрос → Сделка ───────────────────────────
// Each request line becomes a transport direction and/or a stone line. "auto" lets the
// converter decide by line shape (route+wagons → transport, else stone).
const lineComponent = z.enum(["transport", "stone", "auto"]);

export const convertRequestSchema = z.object({
  // Default applied to every line; "auto" by default.
  default: lineComponent.default("auto"),
  // Optional per-line overrides keyed by request_line id.
  perLine: z.record(z.uuid(), lineComponent).optional(),
});

export type ConvertRequestInput = z.infer<typeof convertRequestSchema>;
