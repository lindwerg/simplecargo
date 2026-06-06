// IMPURE: run the classifier LLM call (cheap model) and validate the JSON reply.
// Mirrors requests/extraction.ts: one call + one repair retry, soft-fail to a
// safe "everything is other" result so a model hiccup never throws into the worker.

import { chatCompletion } from "@/lib/ai/openrouter";
import type { ChatMessage, ChatRequest } from "@/lib/ai/types";
import { buildClassifyMessages } from "./classify-prompt";
import { classifyResultSchema, type ClassifyResult } from "./classify-schema";
import type { ParsedEmail } from "./types";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

function model(): string {
  return process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

export function parseClassifyJson(
  raw: string,
): { ok: true; value: ClassifyResult } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    return { ok: false, error: "Ответ не является валидным JSON" };
  }
  const result = classifyResultSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Не прошло валидацию" };
  }
  return { ok: true, value: result.data };
}

/** Classify one email. Throws AiError only on hard transport failures; a model
 *  that returns garbage twice soft-fails to an all-"other" result. */
export async function classifyEmail(email: ParsedEmail): Promise<ClassifyResult> {
  const messages = buildClassifyMessages(email);
  const request: ChatRequest = {
    model: model(),
    temperature: 0,
    max_tokens: 1024,
    response_format: { type: "json_object" },
    messages,
  };

  const raw = await chatCompletion(request);
  let parsed = parseClassifyJson(raw);

  if (!parsed.ok) {
    const repair: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `Ответ не прошёл валидацию: ${parsed.error}. Верни ТОЛЬКО валидный JSON строго по схеме, без markdown.`,
      },
    ];
    const retryRaw = await chatCompletion({ ...request, messages: repair });
    parsed = parseClassifyJson(retryRaw);
  }

  if (!parsed.ok) {
    return classifyResultSchema.parse({
      bodyKind: "other",
      bodyConfidence: 0,
      warnings: ["Не удалось распознать ответ классификатора — письмо помечено как прочее"],
    });
  }

  return parsed.value;
}
