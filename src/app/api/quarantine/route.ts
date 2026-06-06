import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { listQuarantine } from "@/lib/mail-intake/quarantine-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — open quarantine items («Входящие» queue). Any signed-in role may read.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const items = await listQuarantine();
    return apiOk(items);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[quarantine] list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить очередь", 500);
  }
}
