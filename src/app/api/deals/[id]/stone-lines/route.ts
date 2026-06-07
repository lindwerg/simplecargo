import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { createStoneLineSchema } from "@/lib/trades/stoneSchema";
import { addStoneLine } from "@/lib/trades/stoneRepository";
import { TradeError } from "@/lib/trades/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST — add a stone (товар) line to a deal. The quarry supplier is find-or-created with
// role 'quarry'; prices are operator-confirmed (D16). Refreshes deal_type in the same tx.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = createStoneLineSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await addStoneLine(id, parsed.data);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error("[deals] add stone line failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось добавить товарную линию", 500);
  }
}
