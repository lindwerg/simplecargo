import { z } from "zod";

// Validation for tariff (Прейскурант 10-01) entry (Goal 4). The operator enters the
// РЖД base tariff (₽/wagon, un-indexed) for a route and the periodic indexations.
// Stations are free text (a tariff key is origin/dest + wagon type + freight class).
// Money fields are coerced; freightClass is the тарифный класс груза (1|2|3).

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

const DEFAULT_TARIFF_REF = "10-01";

export const tariffRateInputSchema = z.object({
  originRaw: z.string().trim().min(1, "Станция/дорога отправления"),
  destRaw: z.string().trim().min(1, "Станция/дорога назначения"),
  wagonType: optionalText,
  freightClass: z.coerce.number().int().min(1).max(3).optional(),
  etsngCode: optionalText,
  baseAmount: z.coerce.number().positive("Тариф должен быть > 0"),
  vatInclusive: z.enum(["yes", "no", "unknown"]).default("no"),
  effectiveFrom: optionalText, // ISO date "2026-01-01"
  tariffRef: z.string().trim().min(1).default(DEFAULT_TARIFF_REF),
  notes: optionalText,
});

export type TariffRateInput = z.infer<typeof tariffRateInputSchema>;

export const indexationInputSchema = z.object({
  label: z.string().trim().min(1, "Укажите название индексации"),
  pct: z.coerce.number(),
  effectiveFrom: z.string().trim().min(1, "Укажите дату вступления в силу"), // ISO date, required
  appliesToClass: z.coerce.number().int().min(1).max(3).optional(),
  tariffRef: z.string().trim().min(1).default(DEFAULT_TARIFF_REF),
  notes: optionalText,
});

export type IndexationInput = z.infer<typeof indexationInputSchema>;
