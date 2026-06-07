import { z } from "zod";

import { counterpartyInputSchema } from "@/lib/pricing/schema";

// Request validation for Direction CRUD (P15-3). Stations are free text (D15 raw
// fallback — never invent ESR). Money + parties are operator-entered/confirmed (D16).

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const optionalRate = z.coerce.number().positive("Ставка должна быть > 0").optional();

export const createDirectionSchema = z.object({
  // optional binding to a deal (Фаза 1): when set, the direction is attached to the
  // order on create and the order's deal_type cache is refreshed in the same tx.
  orderId: z.uuid().optional(),
  displayName: optionalText,
  stationOriginRaw: z.string().trim().min(1, "Станция отправления"),
  stationDestRaw: z.string().trim().min(1, "Станция назначения"),
  cargoName: optionalText,
  wagonCountPlanned: z.coerce.number().int().positive().optional(),
  tonnagePerWagon: z.coerce.number().positive().optional(),
  rateModel: z.enum(["per_wagon_trip", "lump_sum"]).default("per_wagon_trip"),
  // parties — NULLABLE in draft (D16: client never auto-filled)
  client: counterpartyInputSchema.optional(),
  owner: counterpartyInputSchema.optional(),
  // rates — persist to the confirmed columns ONLY when ratesConfirmed (explicit confirm gate)
  rateClient: optionalRate,
  rateOwner: optionalRate,
  ratesConfirmed: z.boolean().default(false),
  paymentTermsRaw: optionalText,
  validFrom: optionalText, // ISO date
  validTo: optionalText,
});

export const updateDirectionSchema = createDirectionSchema.partial();

const directionStatus = z.enum([
  "draft",
  "open",
  "active",
  "paused",
  "completed",
  "cancelled",
]);

export const transitionDirectionSchema = z.object({
  to: directionStatus,
});

export const ownerBindingSchema = z.object({
  owner: counterpartyInputSchema,
  inboundMailbox: z
    .string()
    .trim()
    .pipe(z.email("Укажите корректный e-mail ящика"))
    .transform((v) => v.toLowerCase()),
  expectedWagonIds: z.array(z.string().trim().min(1)).optional(),
  wagonCountAllocated: z.coerce.number().int().positive().optional(),
  ownerRateOverride: optionalRate,
});

export const clientBindingSchema = z.object({
  client: counterpartyInputSchema,
  forwardToEmail: z.string().trim().pipe(z.email("Укажите корректный e-mail пересылки")),
  forwardCcEmails: z.array(z.string().trim().pipe(z.email())).optional(),
});

export const resolveRateSchema = z.object({
  counterpartyId: z.uuid(),
  side: z.enum(["owner_cost", "client_revenue"]),
  originRaw: z.string().trim().min(1),
  destRaw: z.string().trim().min(1),
  wagonType: z.string().trim().min(1),
  onDate: optionalText, // ISO date
});

export type CreateDirectionInput = z.infer<typeof createDirectionSchema>;
export type UpdateDirectionInput = z.infer<typeof updateDirectionSchema>;
export type TransitionDirectionInput = z.infer<typeof transitionDirectionSchema>;
export type OwnerBindingInput = z.infer<typeof ownerBindingSchema>;
export type ClientBindingInput = z.infer<typeof clientBindingSchema>;
export type ResolveRateInput = z.infer<typeof resolveRateSchema>;
