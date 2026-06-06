import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { QuarantineError, resolveQuarantine } from "@/lib/mail-intake/quarantine-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  action: z.enum(["approved", "rejected", "reprocessed"]),
});

// POST — resolve one quarantine item with the operator's verdict. Writers only.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    const { id } = await ctx.params;
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) return apiFail("Некорректный идентификатор", 400);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Укажите действие", 400);

    const result = await resolveQuarantine(numericId, parsed.data.action, user.id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof QuarantineError) return apiFail(error.message, error.status);
    console.error("[quarantine] resolve failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обработать запись", 500);
  }
}
