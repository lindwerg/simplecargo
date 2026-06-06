import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { env } from "@/lib/env";
import {
  DEFAULT_WEBHOOK_EVENTS,
  getWebhooks,
  isTochkaConfigured,
  registerWebhook,
  TochkaError,
} from "@/lib/finances/tochka-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function webhookUrl(): string {
  return `${env.BETTER_AUTH_URL.replace(/\/+$/, "")}/api/finances/tochka/webhook`;
}

// GET — current webhook subscriptions (writer-only; reveals our URL).
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    if (!isTochkaConfigured()) return apiFail("Точка не подключена", 501);
    const current = await getWebhooks();
    return apiOk({ current, url: webhookUrl() });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TochkaError) return apiFail(error.message, error.status >= 400 ? 502 : 500);
    return apiFail("Не удалось получить подписки", 500);
  }
}

// POST — (re)register our webhook URL for payment events (writer-only).
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);
    if (!isTochkaConfigured()) return apiFail("Точка не подключена", 501);

    const url = webhookUrl();
    if (!url.startsWith("https://")) {
      return apiFail("Webhook требует публичный HTTPS-домен (BETTER_AUTH_URL)", 422);
    }
    await registerWebhook(url, DEFAULT_WEBHOOK_EVENTS);
    return apiOk({ url, events: DEFAULT_WEBHOOK_EVENTS });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TochkaError) return apiFail(error.message, error.status >= 400 ? 502 : 500);
    console.error("[finances] webhook register failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось зарегистрировать вебхук", 500);
  }
}
