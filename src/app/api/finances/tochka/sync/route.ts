import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { isTochkaConfigured, TochkaError } from "@/lib/finances/tochka-client";
import { syncTochka } from "@/lib/finances/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MONTHS = 24;

function parseMonths(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
  return Math.min(Math.max(Math.trunc(raw), 1), MAX_MONTHS);
}

// POST — pull accounts + statements from Точка and upsert them. Writer-only.
// The bank side is read-only; we only write to our own DB. Idempotent (dedup).
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);

    if (!isTochkaConfigured()) {
      return apiFail("Точка не подключена: задайте TOCHKA_JWT_TOKEN", 501);
    }

    let months: number | undefined;
    try {
      const body = (await request.json()) as { months?: unknown };
      months = parseMonths(body?.months);
    } catch {
      // empty/invalid body → default backfill window
    }

    const result = await syncTochka(months === undefined ? {} : { months });
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof TochkaError) return apiFail(error.message, error.status >= 400 ? 502 : 500);
    console.error("[finances] sync failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось синхронизировать данные с Точкой", 500);
  }
}
