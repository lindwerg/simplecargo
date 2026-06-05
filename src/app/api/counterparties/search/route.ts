import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { searchCounterparties, type CounterpartyMatch } from "@/lib/counterparties/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Default candidate count; mirrors searchCounterparties' own default.
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;

// Parse an optional ?limit= into a sane bounded integer.
function parseLimit(raw: string | null): number {
  if (raw === null || raw.trim() === "") return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

// GET — fuzzy "это они?" client lookup. ?q=&limit=. Read-only (any signed-in role).
// Empty q ⇒ { matches: [] } (no error; the picker just shows nothing yet).
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const limit = parseLimit(searchParams.get("limit"));

    const matches: CounterpartyMatch[] = await searchCounterparties(q, limit);
    return apiOk({ matches });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[counterparties] search failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось найти контрагентов", 500);
  }
}
