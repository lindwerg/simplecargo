import { z } from "zod";

// Request validation for ПСЦ creation (P15-2). The operator picks РНС's role; the
// side is derived (side.ts). Money fields are operator-entered. Stations are free
// text (origin/dest may be a station name OR a railroad code, e.g. СВР→ГРК — a ПСЦ
// is often road-to-road and shared across directions).

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// Counterparty: pick an existing one by id, OR create a new one inline by name (+ опц. ИНН).
export const counterpartyInputSchema = z.union([
  z.object({ id: z.uuid() }),
  z.object({
    name: z.string().trim().min(1, "Укажите контрагента"),
    inn: optionalText,
  }),
]);

export const rateLineSchema = z.object({
  originRaw: z.string().trim().min(1, "Станция/дорога отправления"),
  destRaw: z.string().trim().min(1, "Станция/дорога назначения"),
  wagonType: z.string().trim().min(1, "Вид вагона"),
  rate: z.coerce.number().positive("Ставка должна быть > 0"),
  rateBasis: z.string().trim().min(1).default("per_wagon"),
});

export const createPriceProtocolSchema = z.object({
  rnsRole: z.enum(["zakazchik", "ispolnitel"]),
  counterparty: counterpartyInputSchema,
  protocolNumber: optionalText,
  contractRef: optionalText,
  protocolDate: optionalText, // ISO date "2026-05-04"
  validFrom: optionalText,
  vatInclusive: z.enum(["yes", "no", "unknown"]).default("yes"),
  vatRate: z.coerce.number().min(0).max(100).default(22),
  supersedesProtocolId: z.uuid().optional(),
  rates: z.array(rateLineSchema).min(1, "Добавьте хотя бы одну строку ставки"),
});

export type CreatePriceProtocolInput = z.infer<typeof createPriceProtocolSchema>;
export type RateLineInput = z.infer<typeof rateLineSchema>;

// Append rate lines to an existing protocol (POST /api/price-protocol-rates).
export const appendRatesSchema = z.object({
  protocolId: z.uuid(),
  rates: z.array(rateLineSchema).min(1),
});

export type AppendRatesInput = z.infer<typeof appendRatesSchema>;
