import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { setInboxCategory } from "@/lib/mail-intake/inbox-repo";
import { MAIL_PART_KINDS } from "@/lib/mail-intake/classify-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  category: z.enum(MAIL_PART_KINDS).nullable(),
});

// POST — менеджер вручную относит письмо к типу (или снимает ярлык: null). Writers.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!id) return apiFail("Некорректный идентификатор", 400);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return apiFail("Некорректный тип", 400);
    await setInboxCategory(id, parsed.data.category);
    return apiOk({ id, category: parsed.data.category });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] category failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось сменить тип", 500);
  }
}
