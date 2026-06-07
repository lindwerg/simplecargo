import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { setInboxLink } from "@/lib/mail-intake/inbox-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  directionId: z.string().uuid().nullable(),
});

// POST — привязать письмо к направлению (сделке) или отвязать (directionId=null).
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!id) return apiFail("Некорректный идентификатор", 400);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите directionId или null", 400);
    await setInboxLink(id, parsed.data.directionId);
    return apiOk({ id, directionId: parsed.data.directionId });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] link failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось привязать письмо", 500);
  }
}
