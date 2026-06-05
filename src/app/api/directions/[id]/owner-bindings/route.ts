import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { ownerBindingSchema } from "@/lib/directions/schema";
import { addOwnerBinding, DirectionError } from "@/lib/directions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// POST — bind an owner + inbound mailbox to the direction (P3 routing node, manual entry).
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const body: unknown = await request.json().catch(() => null);
    const parsed = ownerBindingSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await addOwnerBinding(id, parsed.data);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof DirectionError) return apiFail(error.message, error.status);
    console.error(
      "[directions] owner-binding create failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось добавить привязку собственника", 500);
  }
}
