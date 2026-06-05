import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { transitionDirectionSchema, updateDirectionSchema } from "@/lib/directions/schema";
import {
  deleteDirection,
  DirectionError,
  transitionDirection,
  updateDirection,
} from "@/lib/directions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// PATCH — a body with `to` is a status transition (runs the activation guard); otherwise
// it edits direction fields (draft/open only).
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);

    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);

    if (isRecord(body) && "to" in body) {
      const parsed = transitionDirectionSchema.safeParse(body);
      if (!parsed.success) {
        return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
      }
      const result = await transitionDirection(id, parsed.data, user.id);
      return apiOk(result);
    }

    const parsed = updateDirectionSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    const result = await updateDirection(id, parsed.data);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof DirectionError) return apiFail(error.message, error.status);
    console.error("[directions] patch failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить направление", 500);
  }
}

// DELETE — draft-only (cancel the rest).
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const result = await deleteDirection(id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof DirectionError) return apiFail(error.message, error.status);
    console.error("[directions] delete failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось удалить направление", 500);
  }
}
