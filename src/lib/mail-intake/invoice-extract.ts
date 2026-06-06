// IMPURE: run invoice extraction (one call + repair retry; soft-fail to an empty
// low-confidence result). Mirrors requests/extraction.ts.

import { chatCompletion } from "@/lib/ai/openrouter";
import type { ChatMessage, ChatRequest } from "@/lib/ai/types";
import type { ExtractInput } from "@/lib/requests/schema";
import { buildInvoiceMessages } from "./invoice-prompt";
import { invoiceResultSchema, type InvoiceResult } from "./invoice-schema";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

function model(): string {
  return process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

export function parseInvoiceJson(
  raw: string,
): { ok: true; value: InvoiceResult } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, error: "Ответ не является валидным JSON" };
  }
  const result = invoiceResultSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Не прошло валидацию" };
  }
  return { ok: true, value: result.data };
}

export async function extractInvoice(input: ExtractInput): Promise<InvoiceResult> {
  const messages = buildInvoiceMessages(input);
  const request: ChatRequest = {
    model: model(),
    temperature: 0,
    max_tokens: 2048,
    response_format: { type: "json_object" },
    messages,
  };

  const raw = await chatCompletion(request);
  let parsed = parseInvoiceJson(raw);

  if (!parsed.ok) {
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `Ответ не прошёл валидацию: ${parsed.error}. Верни ТОЛЬКО валидный JSON строго по схеме.`,
      },
    ];
    const retryRaw = await chatCompletion({ ...request, messages: repair });
    parsed = parseInvoiceJson(retryRaw);
  }

  if (!parsed.ok) {
    return invoiceResultSchema.parse({
      confidence: 0,
      warnings: ["Не удалось распознать счёт — нужен ручной разбор"],
    });
  }
  return parsed.value;
}
