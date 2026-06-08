import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { AiError, hasOpenRouterKey } from "@/lib/ai/openrouter";
import { PartnerError } from "@/lib/partners/repository";
import { answerContractQuestion } from "@/lib/partners/contract-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  documentId: z.uuid(),
  question: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

function aiErrorToResponse(error: AiError): Response {
  switch (error.code) {
    case "key_absent":
      return apiFail("ИИ по договору не настроен (нет ключа OPENROUTER_API_KEY).", 501);
    case "timeout":
      return apiFail("Модель не ответила вовремя — повторите.", 504);
    case "http":
      return apiFail("Сервис ИИ недоступен — повторите позже.", 502);
    default:
      return apiFail("Не удалось получить ответ модели.", 502);
  }
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    if (!hasOpenRouterKey()) {
      return apiFail("ИИ по договору не настроен (нет ключа OPENROUTER_API_KEY).", 501);
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const answer = await answerContractQuestion({
      partnerId: id,
      documentId: parsed.data.documentId,
      question: parsed.data.question,
      ...(parsed.data.history ? { history: parsed.data.history } : {}),
    });
    return apiOk({ answer });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof AiError) return aiErrorToResponse(error);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] contract chat failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обработать вопрос", 500);
  }
}
