import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { requestCreateSchema, requestListFilterSchema } from "@/lib/requests/schema";
import { createRequestWithLines, listDirectionCards } from "@/lib/requests/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/requests?bucket=active|archive&clientId=&originRaw=&roadRaw=&page=&pageSize=
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = requestListFilterSchema.safeParse(params);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректный фильтр", 400);
    }
    const rows = await listDirectionCards(parsed.data);
    return apiOk(rows);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[requests] list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить запросы", 500);
  }
}

// POST /api/requests — create one request header + N route lines.
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    const body: unknown = await request.json().catch(() => null);
    const parsed = requestCreateSchema.safeParse(body);
    if (!parsed.success) {
      return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
    }
    const result = await createRequestWithLines(parsed.data, user.id);
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[requests] create failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось создать запрос", 500);
  }
}
