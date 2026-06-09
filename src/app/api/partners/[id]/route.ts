import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { updatePartnerSchema } from "@/lib/partners/schema";
import {
  deletePartner,
  getPartnerDossier,
  isForeignKeyViolation,
  PartnerError,
  updatePartner,
} from "@/lib/partners/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET — full dossier (company + contacts + documents + deal history).
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const dossier = await getPartnerDossier(id);
    return apiOk(dossier);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] dossier failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить партнёра", 500);
  }
}

// PATCH — edit company fields.
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const body: unknown = await request.json().catch(() => null);
    const parsed = updatePartnerSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    const result = await updatePartner(id, parsed.data);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] update failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить партнёра", 500);
  }
}

// DELETE — remove a company (cascades contacts + document rows). A company with
// history (deals/directions/quotes/invoices) is refused with a 409 by deletePartner.
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const result = await deletePartner(id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    // Подстраховка: FK, не учтённый предварительным подсчётом, — тоже дружелюбный 409.
    if (isForeignKeyViolation(error)) {
      return apiFail(
        "У партнёра есть связанные записи — удаление запрещено, связи будут потеряны",
        409,
      );
    }
    console.error("[partners] delete failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось удалить партнёра", 500);
  }
}
