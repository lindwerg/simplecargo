// IMPURE orchestrator: the single seam wiring the pure extractor pieces
// (prompt, parse, normalize) to the OpenRouter client. Picks the model per
// modality, runs one call + at most one repair retry, then normalizes.

import { chatCompletion, type AiErrorCode } from "@/lib/ai/openrouter";
import type { ChatMessage, ChatRequest } from "@/lib/ai/types";
import { buildExtractionMessages } from "./prompt";
import { parseModelJson } from "./parse";
import { normalizeExtraction } from "./normalize";
import type { ExtractInput, ExtractionResult } from "./schema";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const DEFAULT_AUDIO_MODEL = "google/gemini-2.5-flash";

function modelFor(modality: ExtractInput["modality"]): string {
  if (modality === "audio") {
    return process.env.OPENROUTER_AUDIO_MODEL ?? process.env.OPENROUTER_MODEL ?? DEFAULT_AUDIO_MODEL;
  }
  return process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

function buildRequest(input: ExtractInput): ChatRequest {
  const messages =
    input.modality === "text"
      ? buildExtractionMessages("text", {
          text: input.text,
          clientHint: input.clientHint,
          isTable: input.isTable,
        })
      : input.modality === "image"
        ? buildExtractionMessages("image", {
            imageDataUrl: input.dataUrl,
            clientHint: input.clientHint,
          })
        : buildExtractionMessages("audio", {
            audioDataUrl: input.dataUrl,
            clientHint: input.clientHint,
          });

  return {
    model: modelFor(input.modality),
    temperature: 0,
    max_tokens: 4096,
    response_format: { type: "json_object" },
    messages,
  };
}

// AiError codes the route maps to soft (200 + warnings) vs hard (5xx) failures.
export interface ExtractionFailure {
  kind: "ai_error";
  code: AiErrorCode;
  message: string;
}

/** Run extraction. Throws AiError (caller maps to HTTP); returns a normalized result. */
export async function extractFromInput(input: ExtractInput): Promise<ExtractionResult> {
  const request = buildRequest(input);

  const raw = await chatCompletion(request);
  let parsed = parseModelJson(raw);

  if (!parsed.ok) {
    // one repair retry — feed back the bad reply + the validation error
    const repairMessages: ChatMessage[] = [
      ...request.messages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `Предыдущий ответ не прошёл валидацию: ${parsed.error}. Верни ТОЛЬКО валидный JSON строго по схеме, без markdown.`,
      },
    ];
    const retryRaw = await chatCompletion({ ...request, messages: repairMessages });
    parsed = parseModelJson(retryRaw);
  }

  if (!parsed.ok) {
    // soft fail — never throw for a model hiccup; operator gets an empty review + hint
    return normalizeExtraction({
      clientGuess: null,
      wagonType: null,
      periodFrom: null,
      periodTo: null,
      lines: [],
      warnings: ["Не удалось распознать ответ модели — проверьте файл или введите вручную"],
    });
  }

  return normalizeExtraction(parsed.value);
}
