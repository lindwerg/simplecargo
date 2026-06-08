import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { TradeError } from "@/lib/trades/repository";
import {
  dealLifecycleSchema,
  transitionDealLifecycle,
} from "@/lib/trades/quoteRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH — move a deal across the funnel: цена дана (quoted) → прошли (won) →
// Заявка (confirmed) → ГУ/заадресация (active) → Архив (cancelled). Status changes
// are gated by the lifecycle state machine (canTransition).
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);

    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = dealLifecycleSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const { action, lostReason, guNumber } = parsed.data;
    const result = await transitionDealLifecycle(id, action, { lostReason, guNumber }, user.id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error("[deals] lifecycle transition failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось изменить статус", 500);
  }
}
