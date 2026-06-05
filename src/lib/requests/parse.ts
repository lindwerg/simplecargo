// PURE: parse + validate the model's JSON reply into an ExtractionResult.
// Strips ```json fences, JSON.parse, then zod-validates. Returns a structured
// result (never throws) so the orchestrator can decide on a repair retry.

import { extractionResultSchema, type ExtractionResult } from "./schema";

export type ParseOutcome =
  | { ok: true; value: ExtractionResult }
  | { ok: false; error: string };

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  // ```json … ``` or ``` … ```
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fence) return fence[1].trim();
  return trimmed;
}

export function parseModelJson(raw: string): ParseOutcome {
  const text = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Ответ не является валидным JSON" };
  }
  const result = extractionResultSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "Ответ не прошёл валидацию" };
  }
  return { ok: true, value: result.data };
}
