import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { AiError, chatCompletion, hasOpenRouterKey } from "@/lib/ai/openrouter";
import type { ChatMessage, ChatRequest } from "@/lib/ai/types";
import { db } from "@/lib/db/client";
import { resolveStationName, type StationCandidate } from "@/lib/geo/resolver";
import { computeQuoteMatrix, type MatrixResult } from "@/lib/tariff/quoteMatrix";
import { buildVoiceMessages } from "@/lib/tariff/voicePrompt";
import { voiceIntentSchema, type VoiceIntent } from "@/lib/tariff/voiceIntent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

const voiceSchema = z
  .object({
    dataUrl: z.string().trim().min(1).optional(),
    text: z.string().trim().min(1).optional(),
    clientHint: z.string().optional(),
  })
  .refine((v) => Boolean(v.dataUrl) || Boolean(v.text), {
    message: "Передайте аудио (dataUrl) или текст",
  });

interface StationResolution {
  status: "exact" | "ambiguous" | "none";
  esr: string | null;
  name: string | null;
  candidates: StationCandidate[];
}

interface VoiceResponse {
  intent: VoiceIntent;
  origin: StationResolution;
  dest: StationResolution;
  matrix: MatrixResult | null;
}

function modelFor(modality: "text" | "audio"): string {
  if (modality === "audio") {
    return (
      process.env.OPENROUTER_AUDIO_MODEL ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL
    );
  }
  return process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

/** Strip ```json fences and parse → validate against the voice-intent schema. */
function parseIntent(raw: string): { ok: true; value: VoiceIntent } | { ok: false; error: string } {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let json: unknown;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "ответ не является JSON" };
  }
  const parsed = voiceIntentSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "не прошёл валидацию" };
  }
  return { ok: true, value: parsed.data };
}

/** One call + at most one repair retry (mirror requests/extraction.ts). */
async function extractIntent(request: ChatRequest): Promise<VoiceIntent | null> {
  const raw = await chatCompletion(request);
  let parsed = parseIntent(raw);
  if (!parsed.ok) {
    const repairMessages: ChatMessage[] = [
      ...request.messages,
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `Предыдущий ответ не прошёл валидацию: ${parsed.error}. Верни ТОЛЬКО валидный JSON строго по схеме, без markdown.`,
      },
    ];
    const retryRaw = await chatCompletion({ ...request, messages: repairMessages });
    parsed = parseIntent(retryRaw);
  }
  return parsed.ok ? parsed.value : null;
}

async function resolveStation(raw: string | null): Promise<StationResolution> {
  if (!raw || !raw.trim()) {
    return { status: "none", esr: null, name: null, candidates: [] };
  }
  const result = await resolveStationName(db, raw);
  const best = result.status === "exact" ? (result.best ?? null) : null;
  return {
    status: result.status,
    esr: best?.esrCode ?? null,
    name: best?.name ?? null,
    candidates: result.candidates,
  };
}

function aiErrorToResponse(error: AiError): Response {
  switch (error.code) {
    case "key_absent":
      return apiFail("Голосовой ввод не настроен (нет ключа OPENROUTER_API_KEY).", 501);
    case "timeout":
      return apiFail("Модель не ответила вовремя — повторите.", 504);
    case "http":
      return apiFail("Сервис распознавания недоступен — повторите позже.", 502);
    default:
      return apiFail("Не удалось распознать команду.", 502);
  }
}

// POST — голосовая команда «посчитать тариф». Распознаёт фразу (OpenRouter), резолвит станции
// и, если обе однозначны, сразу считает матрицу. Read-only; любой вошедший. Никаких записей в БД.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);

    if (!hasOpenRouterKey()) {
      return apiFail("Голосовой ввод не настроен (нет ключа OPENROUTER_API_KEY).", 501);
    }

    const body: unknown = await request.json().catch(() => null);
    const parsed = voiceSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const modality: "text" | "audio" = parsed.data.dataUrl ? "audio" : "text";
    const messages = buildVoiceMessages(
      modality,
      modality === "audio"
        ? { audioDataUrl: parsed.data.dataUrl }
        : { text: parsed.data.text },
    );
    const chatRequest: ChatRequest = {
      model: modelFor(modality),
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
      messages,
    };

    const intent = await extractIntent(chatRequest);
    if (!intent) {
      return apiFail("Не удалось распознать команду — повторите чётче или введите вручную.", 422);
    }

    const [origin, dest] = await Promise.all([
      resolveStation(intent.originRaw),
      resolveStation(intent.destRaw),
    ]);

    let matrix: MatrixResult | null = null;
    if (origin.status === "exact" && origin.esr && dest.status === "exact" && dest.esr) {
      matrix = await computeQuoteMatrix({
        originEsr: origin.esr,
        destEsr: dest.esr,
        ...(intent.markupPct != null ? { markupPct: intent.markupPct } : {}),
        ...(intent.classicCapacityT != null
          ? { classicCapacityT: intent.classicCapacityT }
          : {}),
        ...(intent.innovativeCapacityT != null
          ? { innovativeCapacityT: intent.innovativeCapacityT }
          : {}),
      });
    }

    const response: VoiceResponse = { intent, origin, dest, matrix };
    return apiOk(response);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof AiError) return aiErrorToResponse(error);
    const message = error instanceof Error ? error.message : "Не удалось обработать команду";
    console.error("[tariff] voice failed:", message);
    return apiFail(message, 500);
  }
}
