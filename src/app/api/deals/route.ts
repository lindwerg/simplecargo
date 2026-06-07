import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { createTradeSchema } from "@/lib/trades/schema";
import { createTrade, TradeError } from "@/lib/trades/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — create a proactive deal (channel='proactive', status='draft'). The client is
// SUGGESTED only (D16). Composition is added afterwards on the deal card.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = createTradeSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await createTrade(parsed.data, user.id);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error("[deals] create failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось создать сделку", 500);
  }
}
