import { z } from "zod";

// PURE Zod schema for the cheap classifier (MAIL_AI_INTEGRATION §4.1). One LLM
// call per email looks at subject + body + attachment manifest and labels each
// part. No fetch/DB — unit-testable.

export const MAIL_PART_KINDS = ["client_rfq", "invoice", "carrier_quote", "other"] as const;
export type MailPartKind = (typeof MAIL_PART_KINDS)[number];

const confidence = z.number().min(0).max(1);

export const attachmentClassSchema = z.object({
  index: z.number().int().min(0), // index into ParsedEmail.attachments
  kind: z.enum(MAIL_PART_KINDS),
  confidence: confidence.default(0),
  reason: z.string().default(""),
});

export type AttachmentClass = z.infer<typeof attachmentClassSchema>;

export const classifyResultSchema = z.object({
  bodyKind: z.enum(MAIL_PART_KINDS).default("other"),
  bodyConfidence: confidence.default(0),
  // наш номер запроса (R-ГГГГ-ЧЧЧЧ) если виден в теме/треде — для привязки ответа перевозчика
  ourRequestRef: z.string().nullable().default(null),
  senderOrgGuess: z.string().nullable().default(null),
  attachments: z.array(attachmentClassSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type ClassifyResult = z.infer<typeof classifyResultSchema>;
