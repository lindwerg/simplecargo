import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { suggestEmailContacts } from "@/lib/contacts/suggest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/contacts/suggest?q=<prefix>&limit=8 — email autosuggest from mail history.
// Authenticated-only (the directory is PII — §7). Empty q → [].
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const url = new URL(request.url);
    const q = url.searchParams.get("q") ?? "";
    const limitRaw = Number(url.searchParams.get("limit") ?? "8");
    const limit = Number.isFinite(limitRaw) ? limitRaw : 8;
    const rows = await suggestEmailContacts(q, limit);
    return apiOk(rows);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[contacts] suggest failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось получить подсказки", 500);
  }
}
