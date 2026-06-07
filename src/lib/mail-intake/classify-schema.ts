import { z } from "zod";

// PURE Zod schema for the cheap classifier (MAIL_AI_INTEGRATION §4.1). One LLM
// call per email looks at subject + body + attachment manifest and labels each
// part. No fetch/DB — unit-testable.

export const MAIL_PART_KINDS = [
  "client_rfq",
  "invoice",
  "carrier_quote",
  "dislocation",
  "document",
  "gu12",
  "claim",
  "other",
] as const;
export type MailPartKind = (typeof MAIL_PART_KINDS)[number];

// Типы, по которым ИИ ИЗВЛЕКАЕТ данные (создаёт заявку/счёт/ответ перевозчика).
// Остальные (dislocation/document/gu12/claim/other) только архивируются и
// типизируются для вкладок «Входящих» — без авто-извлечения (см. orchestrator).
export const EXTRACTABLE_KINDS: ReadonlySet<MailPartKind> = new Set([
  "client_rfq",
  "invoice",
  "carrier_quote",
]);

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

// Эффективный тип ПИСЬМА для вкладок «Входящих». Многие письма приходят БЕЗ
// текста — только вложение (счёт.pdf, dislocation.xlsx). Тогда bodyKind="other",
// а реальный тип лежит во вложении. Берём bodyKind, если он содержательный, иначе
// — преобладающий тип вложений (по количеству, при равенстве — по уверенности).
export function effectiveEmailKind(c: ClassifyResult): { kind: MailPartKind; confidence: number } {
  if (c.bodyKind !== "other") return { kind: c.bodyKind, confidence: c.bodyConfidence };

  const typed = c.attachments.filter((a) => a.kind !== "other");
  if (typed.length === 0) return { kind: "other", confidence: c.bodyConfidence };

  const score = new Map<MailPartKind, { count: number; conf: number }>();
  for (const a of typed) {
    const s = score.get(a.kind) ?? { count: 0, conf: 0 };
    s.count += 1;
    s.conf = Math.max(s.conf, a.confidence);
    score.set(a.kind, s);
  }
  let best: MailPartKind = "other";
  let bestCount = -1;
  let bestConf = -1;
  for (const [k, s] of score) {
    if (s.count > bestCount || (s.count === bestCount && s.conf > bestConf)) {
      best = k;
      bestCount = s.count;
      bestConf = s.conf;
    }
  }
  return { kind: best, confidence: bestConf };
}
