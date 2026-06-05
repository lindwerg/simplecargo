// IMPURE: thin OpenRouter chat/completions client. Reads OPENROUTER_API_KEY
// DIRECTLY from process.env (mirrors seed-user.ts) so pure modules never couple
// to the env singleton. No domain knowledge — just transport + typed errors.

import type { ChatRequest, ChatResponse } from "./types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 60_000;

export type AiErrorCode = "key_absent" | "timeout" | "http" | "empty" | "parse";

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 0);
}

/**
 * Run one chat/completions call. Returns the first choice's text content.
 * Throws AiError on missing key / timeout / HTTP error / empty body.
 */
export async function chatCompletion(
  req: ChatRequest,
  opts: { timeoutMs?: number } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AiError("key_absent", "OPENROUTER_API_KEY не задан");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter attribution headers (optional, recommended)
        "HTTP-Referer": process.env.BETTER_AUTH_URL ?? "https://simplecargo.app",
        "X-Title": "SimpleCargo",
      },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiError("timeout", "Превышено время ожидания ответа модели");
    }
    throw new AiError("http", "Сбой сети при обращении к модели");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[openrouter] HTTP ${res.status}:`, body.slice(0, 500));
    throw new AiError("http", `Модель вернула ошибку (${res.status})`, res.status);
  }

  const json = (await res.json().catch(() => null)) as ChatResponse | null;
  const content = json?.choices?.[0]?.message?.content;
  if (!content || content.trim().length === 0) {
    throw new AiError("empty", "Пустой ответ модели");
  }
  return content;
}
