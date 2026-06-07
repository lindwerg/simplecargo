import { AuthError, requireSession } from "@/lib/api/session";
import { apiFail } from "@/lib/api/response";
import { getEmailRawStorageKey } from "@/lib/mail-intake/inbox-repo";
import { getObjectStream } from "@/lib/storage/object-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET — скачать оригинал письма (.eml) из object storage.
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    const key = await getEmailRawStorageKey(id);
    if (!key) return apiFail("Оригинал письма недоступен", 404);
    const obj = await getObjectStream(key);
    if (!obj) return apiFail("Оригинал письма недоступен", 404);
    return new Response(obj.stream, {
      status: 200,
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": `attachment; filename="email-${id}.eml"`,
        ...(obj.contentLength != null ? { "Content-Length": String(obj.contentLength) } : {}),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] eml failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось скачать письмо", 500);
  }
}
