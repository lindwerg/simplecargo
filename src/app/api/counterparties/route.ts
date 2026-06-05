import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { listCounterparties } from "@/lib/counterparties/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — counterparties list for the client picker (intake).
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const rows = await listCounterparties();
    return apiOk(rows);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[counterparties] list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить контрагентов", 500);
  }
}
