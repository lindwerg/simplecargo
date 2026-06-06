import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { isTochkaConfigured, TochkaError } from "@/lib/finances/tochka-client";
import { PaymentError, refreshPaymentStatus } from "@/lib/finances/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST ?id= — re-poll Точка for a payment's signing status.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);
    if (!isTochkaConfigured()) return apiFail("Точка не подключена", 501);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id")?.trim();
    if (!id) return apiFail("Не указан платёж", 422);

    const status = await refreshPaymentStatus(id);
    return apiOk({ status });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PaymentError) return apiFail(error.message, error.status);
    if (error instanceof TochkaError) return apiFail(error.message, error.status >= 400 ? 502 : 500);
    console.error("[finances] payment refresh failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось обновить статус", 500);
  }
}
