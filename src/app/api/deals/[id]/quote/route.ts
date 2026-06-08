import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { TradeError } from "@/lib/trades/repository";
import {
  upsertDealQuote,
  upsertDealQuoteSchema,
} from "@/lib/trades/quoteRepository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST — upsert the «Запрос» worksheet for a deal: set its composition (cargoType →
// deal_type) and upsert the single primary transport direction and/or stone line.
// Counterparties (client/owner/quarry) are find-or-created inline; rates/prices are
// operator-confirmed (D16).
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);

    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = upsertDealQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await upsertDealQuote(id, parsed.data, user.id);
    return apiOk(result, 200);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error("[deals] upsert quote failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось сохранить запрос", 500);
  }
}
