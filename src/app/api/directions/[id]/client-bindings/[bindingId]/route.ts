import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { DirectionError, removeClientBinding } from "@/lib/directions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; bindingId: string }> };

// DELETE — remove a client forward binding from the direction.
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const { id, bindingId } = await ctx.params;
    if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(bindingId).success) {
      return apiFail("Некорректный идентификатор", 400);
    }

    const result = await removeClientBinding(id, bindingId);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof DirectionError) return apiFail(error.message, error.status);
    console.error(
      "[directions] client-binding delete failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось удалить пересылку клиенту", 500);
  }
}
