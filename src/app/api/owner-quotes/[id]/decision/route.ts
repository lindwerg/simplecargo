import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { decideOwnerQuote, OwnerQuoteError } from "@/lib/rfq/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["accept", "decline"]),
});

// POST — оператор принимает («Принять ставку») или отклоняет ответ перевозчика.
// Допустимо только из status='responded'; ставка в строку запроса НЕ переносится
// (в request_lines нет поля закупки — см. src/lib/rfq/quotes.ts).
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите действие", 400);

    const result = await decideOwnerQuote(
      id,
      parsed.data.action === "accept" ? "accepted" : "declined",
    );
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof OwnerQuoteError) return apiFail(error.message, error.status);
    console.error("[owner-quotes] decision failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось сохранить решение по ставке", 500);
  }
}
