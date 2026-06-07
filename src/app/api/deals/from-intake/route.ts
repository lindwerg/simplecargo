import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { requestCreateSchema } from "@/lib/requests/schema";
import { createTradeFromLines } from "@/lib/trades/intakeToTrade";
import { TradeError } from "@/lib/trades/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/deals/from-intake — create a proactive deal (orders) WITH its directions
// straight from AI-extracted lines (voice/file/text), skipping the Запрос entity.
// Body matches requestCreateSchema (client + lines); channel is forced to 'proactive'.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = requestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await createTradeFromLines(parsed.data, user.id);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error(
      "[deals/from-intake] create failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось создать сделку из распознавания", 500);
  }
}
