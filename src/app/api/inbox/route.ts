import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { isInboxTab, listInbox } from "@/lib/mail-intake/inbox-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — одна страница писем выбранной вкладки «Входящих» (keyset-курсор). Любая роль.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const url = new URL(request.url);
    const tabRaw = url.searchParams.get("tab") ?? "all";
    const tab = isInboxTab(tabRaw) ? tabRaw : "all";
    const cursor = url.searchParams.get("cursor");
    const page = await listInbox({ tab, cursor });
    return apiOk(page);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить почту", 500);
  }
}
