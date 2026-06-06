import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { resolveAllQuarantine } from "@/lib/mail-intake/quarantine-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["approved", "rejected", "reprocessed"]).default("rejected"),
});

// POST — clear the whole open «Входящие» queue in one action. Writers only.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    const action = parsed.success ? parsed.data.action : "rejected";
    const result = await resolveAllQuarantine(action, user.id);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[quarantine] resolve-all failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось очистить очередь", 500);
  }
}
