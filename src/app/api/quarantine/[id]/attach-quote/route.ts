import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { attachQuarantinedQuote, OwnerQuoteError } from "@/lib/rfq/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  requestId: z.uuid("Выберите запрос"),
  ownerId: z.uuid().optional(), // не задан → авто-резолв перевозчика по from-адресу
});

// POST — ручная привязка карантинного ответа перевозчика (CARRIER_QUOTE_MANUAL)
// к запросу: upsert request_owner_quotes из сохранённого draft.quote + резолв
// карантин-ряда (одной транзакцией).
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    const { id } = await ctx.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) return apiFail("Некорректный идентификатор", 400);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await attachQuarantinedQuote({
      quarantineId: numericId,
      requestId: parsed.data.requestId,
      ownerId: parsed.data.ownerId ?? null,
      userId: user.id,
    });
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof OwnerQuoteError) return apiFail(error.message, error.status);
    console.error("[quarantine] attach-quote failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось привязать ответ перевозчика", 500);
  }
}
