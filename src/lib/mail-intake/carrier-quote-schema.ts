import { z } from "zod";

// PURE schema for a carrier's quote reply (MAIL_AI_INTEGRATION §6.3). The rate is
// money-sensitive: it is NEVER auto-accepted — the extracted value lands as a
// review item for the operator to attach to the right request leg.

export const carrierQuoteResultSchema = z.object({
  ourRequestRef: z.string().nullable().default(null), // R-ГГГГ-ЧЧЧЧ from the thread, if present
  costPerWagon: z.number().nullable().default(null),
  wagonsOffered: z.number().nullable().default(null),
  currency: z.string().default("RUB"),
  validTo: z.string().nullable().default(null), // ISO срок действия предложения
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([]),
});

export type CarrierQuoteResult = z.infer<typeof carrierQuoteResultSchema>;
