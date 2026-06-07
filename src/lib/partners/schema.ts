import { z } from "zod";

// Validation for the Партнёры tab (company-centric counterparty CRM). Pure module
// (zod only) → safe to import in unit tests without a live DB.

// Commercial roles a company can hold. `expeditor` (другой экспедитор) is added on
// top of the existing counterparties vocabulary. Stored in counterparties.roles[].
export const PARTNER_ROLES = [
  "client",
  "owner",
  "expeditor",
  "shipper",
  "consignee",
  "carrier",
  "quarry",
] as const;
export type PartnerRole = (typeof PARTNER_ROLES)[number];

export const ROLE_LABELS_RU: Readonly<Record<PartnerRole, string>> = {
  client: "Клиент",
  owner: "Собственник ПС",
  expeditor: "Экспедитор",
  shipper: "Грузоотправитель",
  consignee: "Грузополучатель",
  carrier: "Перевозчик",
  quarry: "Карьер",
};

export const DOCUMENT_KINDS = ["contract", "request", "other"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABELS_RU: Readonly<Record<DocumentKind, string>> = {
  contract: "Договор",
  request: "Заявка",
  other: "Документ",
};

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

// PURE: canonical form for storage + reverse lookup ("e-mail → company").
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? normalizeEmail(v) : undefined))
  .refine((v) => v === undefined || z.email().safeParse(v).success, {
    message: "Некорректный e-mail",
  });

export const createPartnerSchema = z.object({
  name: z.string().trim().min(1, "Укажите название компании"),
  roles: z.array(z.enum(PARTNER_ROLES)).min(1, "Выберите хотя бы одну роль"),
  inn: optionalText,
  notes: optionalText,
});

export const updatePartnerSchema = z.object({
  name: z.string().trim().min(1, "Укажите название компании").optional(),
  roles: z.array(z.enum(PARTNER_ROLES)).min(1, "Выберите хотя бы одну роль").optional(),
  inn: optionalText,
  notes: optionalText,
});

export const contactSchema = z
  .object({
    fullName: optionalText,
    position: optionalText,
    phone: optionalText,
    email: optionalEmail,
    isPrimary: z.boolean().default(false),
    note: optionalText,
  })
  .refine((c) => c.fullName || c.phone || c.email, {
    message: "Заполните ФИО, телефон или e-mail",
  });

// Metadata that travels alongside the multipart file upload (parsed from form fields).
export const documentMetaSchema = z.object({
  kind: z.enum(DOCUMENT_KINDS).default("other"),
  title: z.string().trim().min(1, "Укажите название документа"),
  docRef: optionalText,
  docDate: optionalText, // ISO date "2026-05-04"
});

export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;
