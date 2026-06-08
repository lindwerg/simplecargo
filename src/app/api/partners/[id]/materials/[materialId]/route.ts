import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { PartnerError } from "@/lib/partners/repository";
import { deleteMaterial, materialSchema, updateMaterial } from "@/lib/partners/materials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; materialId: string }> };

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id, materialId } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(materialId).success) {
      return apiFail("Некорректный идентификатор", 400);
    }
    const parsed = materialSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    return apiOk(await updateMaterial(id, materialId, parsed.data));
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] material update failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить позицию", 500);
  }
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id, materialId } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(materialId).success) {
      return apiFail("Некорректный идентификатор", 400);
    }
    return apiOk(await deleteMaterial(id, materialId));
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] material delete failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось удалить позицию", 500);
  }
}
