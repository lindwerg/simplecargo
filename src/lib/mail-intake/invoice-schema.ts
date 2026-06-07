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
  supplierKpp: z.string().nullable().default(null), // 9 цифр
  // банковские реквизиты получателя (для платежа — в counterparties их нет)
  supplierAccount: z.string().nullable().default(null), // р/с, 20 цифр
  supplierBankBic: z.string().nullable().default(null), // БИК, 9 цифр
  supplierCorrAccount: z.string().nullable().default(null), // к/с, 20 цифр
  supplierBankName: z.string().nullable().default(null),
  amountTotal: z.number().nullable().default(null),
  vatAmount: z.number().nullable().default(null),
  vatRate: z.number().nullable().default(null), // ставка НДС, % (22/20/0…)
  vatIncluded: z.boolean().nullable().default(null), // true=в т.ч.; false=без НДС
  currency: z.string().default("RUB"),
  purpose: z.string().nullable().default(null),
  serviceDescription: z.string().nullable().default(null), // «за что» — кратко
  // договор (часто в «Основании» счёта) — для назначения платежа
  contractNumber: z.string().nullable().default(null),
  contractDate: z.string().nullable().default(null), // ISO YYYY-MM-DD
  confidence: z.number().min(0).max(1).default(0),
  warnings: z.array(z.string()).default([]),
});

export type InvoiceResult = z.infer<typeof invoiceResultSchema>;
