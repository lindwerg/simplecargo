import { z } from "zod";

import { counterpartyInputSchema } from "@/lib/pricing/schema";

// Validation for stone-line CRUD on a Deal (plan §3, Фаза 2). Prices/tonnage are
// operator-entered confirmed values (D16/H1) — coerced from numeric form inputs.
// stone_only deals may carry no station (open decision §3) → location is optional.

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// Non-negative money/tonnage; empty string → undefined (left NULL in DB).
const optionalAmount = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .refine((v) => v === undefined || v >= 0, { message: "Значение не может быть отрицательным" });

const reportMonth = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Месяц в формате ГГГГ-ММ")
  .optional();

const STONE_STATUSES = ["draft", "active", "completed", "cancelled"] as const;

export const createStoneLineSchema = z.object({
  // Quarry supplier (find-or-create with role 'quarry'). Optional — a raw label may be
  // kept before the supplier is identified.
  quarry: counterpartyInputSchema.optional(),
  quarryRaw: optionalText,
  locationRaw: optionalText,
  locationEsr: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Код ЕСР — 6 цифр")
    .optional(),
  fraction: optionalText,
  cargoName: optionalText, // defaults to 'щебень' at the DB level
  tonnage: optionalAmount,
  tonnageActual: optionalAmount,
  pricePurchase: optionalAmount,
  priceSale: optionalAmount,
  currency: z.string().trim().min(1).optional(),
  reportMonth,
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export const updateStoneLineSchema = createStoneLineSchema
  .extend({
    status: z.enum(STONE_STATUSES).optional(),
  })
  .partial();

export type CreateStoneLineInput = z.infer<typeof createStoneLineSchema>;
export type UpdateStoneLineInput = z.infer<typeof updateStoneLineSchema>;
