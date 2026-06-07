import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { convertRequestSchema } from "@/lib/trades/schema";
import { convertRequestToTrade } from "@/lib/trades/conversion";
import { TradeError } from "@/lib/trades/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST — convert a won RFQ into a deal (Фаза 3). Idempotency is enforced in the
// repository (converted_order_id guard → 409) plus the partial unique index on
// orders.request_id as a second barrier.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = convertRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await convertRequestToTrade(id, parsed.data, user.id);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    // Unique-violation race: another request slipped past the guard concurrently.
    if (isUniqueViolation(error)) return apiFail("Запрос уже сконвертирован в сделку", 409);
    console.error("[requests] convert failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось сконвертировать запрос", 500);
  }
}

// Drizzle wraps the pg error in a DrizzleQueryError, so the SQLSTATE code can live on
// the error itself or on its `.cause` (mirrors directions/repository.ts).
function isUniqueViolation(error: unknown): boolean {
  const has23505 = (e: unknown): boolean =>
    typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
  if (has23505(error)) return true;
  if (typeof error === "object" && error !== null && "cause" in error) {
    return has23505((error as { cause?: unknown }).cause);
  }
  return false;
}
