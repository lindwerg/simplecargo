import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { confirmReview, RequestError } from "@/lib/requests/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST — operator confirms an AI-email request, clearing the needs_review gate.
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const result = await confirmReview(id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof RequestError) return apiFail(error.message, error.status);
    console.error("[requests] confirm-review failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось подтвердить запрос", 500);
  }
}
