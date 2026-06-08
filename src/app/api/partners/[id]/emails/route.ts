import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { PartnerError } from "@/lib/partners/repository";
import { bindPartnerEmail, listPartnerMail, unbindPartnerEmail } from "@/lib/partners/general";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const emailBody = z.object({ email: z.string().min(1) });

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    return apiOk(await listPartnerMail(id));
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[partners] mail list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить почту", 500);
  }
}

export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const parsed = emailBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите адрес почты", 400);
    await bindPartnerEmail(id, parsed.data.email);
    return apiOk(await listPartnerMail(id), 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] mail bind failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось привязать почту", 500);
  }
}

export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const parsed = emailBody.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите адрес почты", 400);
    await unbindPartnerEmail(id, parsed.data.email);
    return apiOk(await listPartnerMail(id));
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] mail unbind failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось отвязать почту", 500);
  }
}
