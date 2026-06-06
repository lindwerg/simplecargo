import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { createPartnerSchema } from "@/lib/partners/schema";
import { createPartner, listPartners, PartnerError } from "@/lib/partners/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — directory list with optional ?search= and ?role= filters.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { searchParams } = new URL(request.url);
    const rows = await listPartners({
      search: searchParams.get("search") ?? undefined,
      role: searchParams.get("role") ?? undefined,
    });
    return apiOk(rows);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[partners] list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить партнёров", 500);
  }
}

// POST — create a company.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const body: unknown = await request.json().catch(() => null);
    const parsed = createPartnerSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    const result = await createPartner(parsed.data);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] create failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось создать партнёра", 500);
  }
}
