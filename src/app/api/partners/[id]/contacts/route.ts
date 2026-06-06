import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { contactSchema } from "@/lib/partners/schema";
import { addContact, listContacts, PartnerError } from "@/lib/partners/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    return apiOk(await listContacts(id));
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[partners] contacts list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить контакты", 500);
  }
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const body: unknown = await request.json().catch(() => null);
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    const result = await addContact(id, parsed.data);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] contact add failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось добавить контакт", 500);
  }
}
