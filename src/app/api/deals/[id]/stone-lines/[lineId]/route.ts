import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { updateStoneLineSchema } from "@/lib/trades/stoneSchema";
import { deleteStoneLine, updateStoneLine } from "@/lib/trades/stoneRepository";
import { TradeError } from "@/lib/trades/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; lineId: string }> };

// PATCH — edit a stone line (prices/tonnage/quarry/status). Composition is unchanged so
// deal_type is not recomputed.
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const { lineId } = await ctx.params;
    if (!z.uuid().safeParse(lineId).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = updateStoneLineSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await updateStoneLine(lineId, parsed.data);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error("[deals] update stone line failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить товарную линию", 500);
  }
}

// DELETE — remove a stone line and refresh deal_type (may revert to wagons_only / NULL).
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const { lineId } = await ctx.params;
    if (!z.uuid().safeParse(lineId).success) return apiFail("Некорректный идентификатор", 400);

    const result = await deleteStoneLine(lineId);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TradeError) return apiFail(error.message, error.status);
    console.error("[deals] delete stone line failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось удалить товарную линию", 500);
  }
}
