import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { requestTransitionSchema, requestUpdateSchema } from "@/lib/requests/schema";
import {
  deleteRequest,
  getRequest,
  RequestError,
  transitionRequest,
  updateRequest,
} from "@/lib/requests/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// GET — full request + lines.
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const result = await getRequest(id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof RequestError) return apiFail(error.message, error.status);
    console.error("[requests] get failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить запрос", 500);
  }
}

// PATCH — a body with `to` is a status transition; otherwise edits header fields.
export async function PATCH(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);

    if (isRecord(body) && "to" in body) {
      const parsed = requestTransitionSchema.safeParse(body);
      if (!parsed.success) {
        return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
      }
      const result = await transitionRequest(id, parsed.data);
      return apiOk(result);
    }

    const parsed = requestUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    const result = await updateRequest(id, parsed.data);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof RequestError) return apiFail(error.message, error.status);
    console.error("[requests] patch failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить запрос", 500);
  }
}

// DELETE — new-status only.
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    const result = await deleteRequest(id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof RequestError) return apiFail(error.message, error.status);
    console.error("[requests] delete failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось удалить запрос", 500);
  }
}
