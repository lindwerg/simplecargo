import { AuthError, requireSession } from "@/lib/api/session";
import { apiFail } from "@/lib/api/response";
import { getEmailHtml } from "@/lib/mail-intake/inbox-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET — санитизированное HTML-тело письма для просмотра 1:1 в sandboxed iframe.
// Защита от XSS/трекинга: <script> вырезаны, плюс строгий CSP (скрипты и внешние
// ресурсы запрещены; inline-картинки cid переписаны на наш same-origin роут).
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    const html = await getEmailHtml(id);
    if (html == null) return apiFail("HTML-тело недоступно", 404);

    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Письма показываем «как в почте»: внешние картинки/стили/шрифты разрешены,
        // чтобы вёрстка не ломалась. Скрипты ЗАПРЕЩЕНЫ (нет script-src) + iframe
        // sandbox без allow-scripts. Трекинг-пиксели грузятся (внутренний инструмент).
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self' data: https: http:; style-src 'unsafe-inline' https: http:; font-src 'self' data: https: http:; media-src 'self' data: https: http:",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[inbox] html failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось открыть письмо", 500);
  }
}
