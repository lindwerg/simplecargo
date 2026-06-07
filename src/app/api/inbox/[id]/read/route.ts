import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { markInboxRead } from "@/lib/mail-intake/inbox-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST — отметить письмо прочитанным (снимает бейдж «новое»). Writers only.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!id) return apiFail("Некорректный идентификатор", 400);
    await markInboxRead(id);
    return apiOk({ id, read: true });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] mark read failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось отметить прочтение", 500);
  }
}
