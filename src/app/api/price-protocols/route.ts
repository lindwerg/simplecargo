import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { createPriceProtocolSchema } from "@/lib/pricing/schema";
import { createPriceProtocol } from "@/lib/pricing/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — create a ПСЦ header + its rate lines (and optionally supersede a prior one).
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = createPriceProtocolSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await createPriceProtocol(parsed.data);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error(
      "[price-protocols] create failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось сохранить протокол", 500);
  }
}
