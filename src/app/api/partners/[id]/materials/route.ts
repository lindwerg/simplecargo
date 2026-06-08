import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { PartnerError } from "@/lib/partners/repository";
import { createMaterial, listPartnerMaterials, materialSchema } from "@/lib/partners/materials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    return apiOk(await listPartnerMaterials(id));
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[partners] materials list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить каталог щебня", 500);
  }
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const parsed = materialSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    return apiOk(await createMaterial(id, parsed.data), 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] material create failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось добавить позицию", 500);
  }
}
