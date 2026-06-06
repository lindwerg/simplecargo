import { AuthError, requireSession } from "@/lib/api/session";
import { apiFail } from "@/lib/api/response";
import { subscribeRealtime } from "@/lib/realtime/pg-listener";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

// SSE stream of realtime events (MAIL_AI_INTEGRATION §2.1 / Фаза 4). Auth-gated;
// the browser EventSource triggers router.refresh() on each event. Heartbeat
// keeps proxies from closing the idle connection.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    return apiFail("Требуется вход", 401);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          /* stream already closed */
        }
      };

      safeEnqueue(`data: ${JSON.stringify({ kind: "hello" })}\n\n`);

      const unsub = subscribeRealtime((ev) => {
        safeEnqueue(`data: ${JSON.stringify(ev)}\n\n`);
      });
      const heartbeat = setInterval(() => safeEnqueue(`: ping\n\n`), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
