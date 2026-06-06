import { z } from "zod";

// PURE schema for invoice extraction (MAIL_AI_INTEGRATION §6.4). The model emits
// nullable fields (never omit); matching to a Tochka payment happens later via
// finances/match-invoice.ts. MVP stores metadata + text, not the original file.

export const invoiceResultSchema = z.object({
  invoiceNumber: z.string().nullable().default(null),
  invoiceDate: z.string().nullable().default(null), // ISO YYYY-MM-DD
  dueDate: z.string().nullable().default(null),
  supplierName: z.string().nullable().default(null),
  supplierInn: z.string().nullable().default(null), // 10 или 12 цифр
  amountTotal: z.number().nullable().default(null),
  vatAmount: z.number().nullable().default(null),
  currency: z.string().default("RUB"),
  purpose: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([]),
});

export type InvoiceResult = z.infer<typeof invoiceResultSchema>;
