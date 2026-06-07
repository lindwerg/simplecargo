import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { searchDirections } from "@/lib/directions/search-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — поиск направлений (сделок) для привязки письма. ?q=&limit=. Любая роль.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const limitRaw = Number(searchParams.get("limit"));
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 8;
    const matches = await searchDirections(q, limit);
    return apiOk({ matches });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[deals] search failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось найти сделки", 500);
  }
}
