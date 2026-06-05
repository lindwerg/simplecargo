import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { createDirectionSchema } from "@/lib/directions/schema";
import { createDirection, DirectionError } from "@/lib/directions/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — create a Direction (starts as draft; rates may be null).
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = createDirectionSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await createDirection(parsed.data, user.id);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof DirectionError) return apiFail(error.message, error.status);
    console.error("[directions] create failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось создать направление", 500);
  }
}
