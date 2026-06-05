import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { resolveRateSchema } from "@/lib/directions/schema";
import { resolvePriceRate } from "@/lib/pricing/lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — look up a snapshot rate from the ПСЦ price-book (P15-2 resolver) for the
// direction form. SUGGESTION ONLY: the operator must still confirm it (D16/H1); this
// never writes the direction.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const body: unknown = await request.json().catch(() => null);
    const parsed = resolveRateSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const { counterpartyId, side, originRaw, destRaw, wagonType, onDate } = parsed.data;
    const onDateValue = onDate ? new Date(onDate) : undefined;
    const resolved = await resolvePriceRate({
      counterpartyId,
      side,
      originRaw,
      destRaw,
      wagonType,
      ...(onDateValue && !Number.isNaN(onDateValue.getTime()) ? { onDate: onDateValue } : {}),
    });

    if (!resolved) return apiOk({ found: false });
    return apiOk({ found: true, rate: resolved.rate, protocolId: resolved.protocolId });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[directions] resolve-rate failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось получить ставку из ПСЦ", 500);
  }
}
