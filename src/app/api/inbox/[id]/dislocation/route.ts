import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { applyDislocationToDirection } from "@/lib/mail-intake/apply-dislocation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  directionId: z.string().uuid(),
});

// POST — привязать письмо-дислокацию к направлению: разбираем пономерной список
// вагонов из тела/вложений, линкуем письмо к направлению, дописываем номера в
// expected_wagon_ids активной owner-привязки и сохраняем разбор в wagon_movements.
// Общая логика с авто-роутингом оркестратора — в apply-dislocation.ts.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!id) return apiFail("Некорректный идентификатор", 400);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите направление", 400);

    const result = await applyDislocationToDirection(id, parsed.data.directionId);

    return apiOk({
      directionId: parsed.data.directionId,
      summary: result.summary,
      savedToBinding: result.savedToBinding,
      expectedCount: result.expectedCount,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] dislocation failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось привязать дислокацию", 500);
  }
}
