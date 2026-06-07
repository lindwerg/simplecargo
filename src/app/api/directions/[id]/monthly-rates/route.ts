import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { upsertMonthlyRateSchema } from "@/lib/trades/monthlyRateSchema";
import { upsertMonthlyRate } from "@/lib/trades/monthlyRateRepository";
import { TradeError } from "@/lib/trades/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST — upsert a per-month rate for a direction (plan §4, Фаза 4). Keyed on
// (direction, effective_month). Rates are operator-confirmed (D16); `agree=true` promotes
// the row proposed → agreed in the same write — the rate the operator settles ahead of
// the upcoming month.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);

    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = upsertMonthlyRateSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await upsertMonthlyRate(id, parsed.data, user.id);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error(
      "[directions] upsert monthly rate failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось сохранить помесячную ставку", 500);
  }
}
