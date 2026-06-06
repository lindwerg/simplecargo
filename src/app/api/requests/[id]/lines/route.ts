import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { lineTransitionSchema } from "@/lib/requests/schema";
import { RequestError, transitionLines } from "@/lib/requests/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH — transition one or many DIRECTIONS of this request (withdraw / quote /
// sourcing / …). Body: { lineIds: uuid[], to, lossReason? }. Only the chosen legs
// change; the parent request status is rolled up server-side (transitionLines).
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = lineTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await transitionLines(id, parsed.data);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof RequestError) return apiFail(error.message, error.status);
    console.error("[requests] line transition failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить направления", 500);
  }
}
