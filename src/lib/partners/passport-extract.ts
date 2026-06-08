// ИИ-извлечение полей из паспорта качества щебня (PDF/скан) для предзаполнения
// формы. Gemini читает PDF нативно. Берём ВСЁ из паспорта: типовые поля ГОСТ
// отдельно + всё прочее в passportFields. Оператор подтверждает перед сохранением.

import { chatCompletion } from "@/lib/ai/openrouter";
import { z } from "zod";
import type { ChatMessage, ChatRequest, ContentPart } from "@/lib/ai/types";
import { getDocument, PartnerError } from "./repository";
import { readStoredFile } from "@/lib/storage/files";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const PDF_MIME = "application/pdf";
const IMAGE_MIME = new Set(["image/jpeg", "image/png"]);

// Структура, которую просим у модели. Все типовые поля — строки (диапазоны/марки),
// bulkDensity — число; всё прочее из паспорта → passportFields {название: значение}.
export const passportExtractionSchema = z.object({
  materialName: z.string().nullish(),
  fraction: z.string().nullish(),
  gost: z.string().nullish(),
  strengthGrade: z.string().nullish(),
  flakiness: z.string().nullish(),
  frostResistance: z.string().nullish(),
  radioactivityClass: z.string().nullish(),
  abrasion: z.string().nullish(),
  bulkDensity: z.number().nullish(),
  passportFields: z.record(z.string(), z.string()).nullish(),
});

export type PassportExtraction = z.infer<typeof passportExtractionSchema>;

function buildFilePart(mimeType: string, filename: string, bytes: Buffer): ContentPart {
  const base64 = bytes.toString("base64");
  if (mimeType === PDF_MIME) {
    return { type: "file", file: { filename, file_data: `data:${mimeType};base64,${base64}` } };
  }
  if (IMAGE_MIME.has(mimeType)) {
    return { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } };
  }
  throw new PartnerError(
    422,
    "Этот формат паспорта нельзя прочитать ИИ. Загрузите паспорт в PDF (или фото/скан JPG/PNG).",
  );
}

function systemPrompt(): string {
  return [
    "Ты извлекаешь характеристики щебня (или другого нерудного материала) из",
    "паспорта качества. Верни ТОЛЬКО JSON по схеме:",
    '{ "materialName": string|null, "fraction": string|null (напр. "5-20"),',
    '"gost": string|null, "strengthGrade": string|null (марка по дробимости, напр. "М1200"),',
    '"flakiness": string|null (лещадность/группа), "frostResistance": string|null (напр. "F150"),',
    '"radioactivityClass": string|null (класс 1/2), "abrasion": string|null (истираемость, напр. "И1"),',
    '"bulkDensity": number|null (насыпная плотность, кг/м³),',
    '"passportFields": { [название_показателя]: значение } }.',
    "В passportFields положи ВСЁ остальное из паспорта (содержание пылевидных и",
    "глинистых частиц, зёрна слабых пород, удельная эффективная активность Бк/кг,",
    "номер партии, дата и т.п.) как пары строка→строка.",
    "Если значения нет — ставь null. Ничего не выдумывай: бери только из паспорта.",
  ].join(" ");
}

function parse(raw: string): PassportExtraction | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const parsed = passportExtractionSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Read the passport document (owned by the partner) and ask Gemini to extract its
 * fields. One call + one repair retry. Returns null if the model can't produce
 * valid JSON. Throws AiError (transport) / PartnerError (404/422).
 */
export async function extractPassportFields(
  partnerId: string,
  documentId: string,
): Promise<PassportExtraction | null> {
  const doc = await getDocument(documentId);
  if (!doc || doc.counterpartyId !== partnerId) {
    throw new PartnerError(404, "Документ не найден");
  }

  const bytes = await readStoredFile(doc.storageKey);
  const filePart = buildFilePart(doc.mimeType, doc.originalFilename, bytes);

  const baseMessages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    {
      role: "user",
      content: [filePart, { type: "text", text: "Извлеки характеристики из этого паспорта." }],
    },
  ];

  const request: ChatRequest = {
    model: process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL,
    temperature: 0,
    max_tokens: 1500,
    response_format: { type: "json_object" },
    messages: baseMessages,
  };

  const raw = await chatCompletion(request, { timeoutMs: 90_000 });
  let result = parse(raw);
  if (!result) {
    const retry = await chatCompletion(
      {
        ...request,
        messages: [
          ...baseMessages,
          { role: "assistant", content: raw },
          { role: "user", content: "Верни ТОЛЬКО валидный JSON строго по схеме, без markdown." },
        ],
      },
      { timeoutMs: 90_000 },
    );
    result = parse(retry);
  }
  return result;
}
