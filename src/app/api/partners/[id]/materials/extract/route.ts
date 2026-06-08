import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { AiError, hasOpenRouterKey } from "@/lib/ai/openrouter";
import { PartnerError } from "@/lib/partners/repository";
import { extractPassportFields } from "@/lib/partners/passport-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ documentId: z.uuid() });

function aiErrorToResponse(error: AiError): Response {
  switch (error.code) {
    case "key_absent":
      return apiFail("Извлечение из паспорта не настроено (нет ключа OPENROUTER_API_KEY).", 501);
    case "timeout":
      return apiFail("Модель не ответила вовремя — повторите.", 504);
    case "http":
      return apiFail("Сервис ИИ недоступен — повторите позже.", 502);
    default:
      return apiFail("Не удалось разобрать паспорт.", 502);
  }
}

// POST — ИИ читает паспорт (PDF/скан) и возвращает извлечённые поля для
// предзаполнения формы. В БД ничего не пишет — оператор подтверждает и сохраняет.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    if (!hasOpenRouterKey()) {
      return apiFail("Извлечение из паспорта не настроено (нет ключа OPENROUTER_API_KEY).", 501);
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите документ паспорта", 400);

    const fields = await extractPassportFields(id, parsed.data.documentId);
    if (!fields) {
      return apiFail("Не удалось извлечь характеристики — заполните вручную.", 422);
    }
    return apiOk(fields);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof AiError) return aiErrorToResponse(error);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] passport extract failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось разобрать паспорт", 500);
  }
}
