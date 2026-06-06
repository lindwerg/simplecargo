import { z } from "zod";

import { apiFail } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { getIngestedAttachment } from "@/lib/mail-intake/attachments-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  const kind = inline ? "inline" : "attachment";
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// PDFs/images/plain text render in a browser tab; everything else downloads.
function isInlineType(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf" || mime.startsWith("text/");
}

// GET — stream an inbound-mail document for the operator to review. Any signed-in
// user may view (read-only). Bytes come from Postgres (see attachments-repo).
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const blob = await getIngestedAttachment(id);
    if (!blob) return apiFail("Документ недоступен", 404);

    return new Response(new Uint8Array(blob.content), {
      status: 200,
      headers: {
        "Content-Type": blob.mimeType,
        "Content-Length": String(blob.content.byteLength),
        "Content-Disposition": contentDisposition(blob.filename, isInlineType(blob.mimeType)),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[ingested] download failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось открыть документ", 500);
  }
}
