import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { contactSchema } from "@/lib/partners/schema";
import { deleteContact, PartnerError, updateContact } from "@/lib/partners/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; contactId: string }> };

export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id, contactId } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(contactId).success) {
      return apiFail("Некорректный идентификатор", 400);
    }
    const body: unknown = await request.json().catch(() => null);
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    const result = await updateContact(id, contactId, parsed.data);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] contact update failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить контакт", 500);
  }
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id, contactId } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(contactId).success) {
      return apiFail("Некорректный идентификатор", 400);
    }
    const result = await deleteContact(id, contactId);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] contact delete failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось удалить контакт", 500);
  }
}
