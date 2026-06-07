import { z } from "zod";

// Validation for per-month direction-rate CRUD (plan §4, Фаза 4). Rates are operator-
// entered confirmed values (D16/H1) coerced from numeric form inputs; *_suggested fields
// hold LLM/desired values and are display-only.

const month = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Месяц в формате ГГГГ-ММ");

// Non-negative money; empty string → undefined (left NULL in DB).
const optionalAmount = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === "" || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  })
  .refine((v) => v === undefined || v >= 0, { message: "Ставка не может быть отрицательной" });

// Upsert a monthly rate (keyed on direction + month). `agree` promotes the row to
// 'agreed' in the same write — the confirm step the operator takes ahead of the month.
export const upsertMonthlyRateSchema = z.object({
  effectiveMonth: month,
  rateClient: optionalAmount,
  rateOwner: optionalAmount,
  rateClientSuggested: optionalAmount,
  rateOwnerSuggested: optionalAmount,
  currency: z.string().trim().min(1).optional(),
  rateBasis: z.string().trim().min(1).optional(),
  agree: z.boolean().optional(),
});

export type UpsertMonthlyRateInput = z.infer<typeof upsertMonthlyRateSchema>;
