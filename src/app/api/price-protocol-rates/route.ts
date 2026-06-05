import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { appendRatesSchema } from "@/lib/pricing/schema";
import { appendRates } from "@/lib/pricing/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — append rate line(s) to an existing protocol. Primary creation path is the
// nested POST /api/price-protocols; this is for later edits to a protocol's table.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = appendRatesSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const result = await appendRates(parsed.data);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error(
      "[price-protocol-rates] append failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось добавить ставки", 500);
  }
}
