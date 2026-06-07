import { z } from "zod";

import { apiFail } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { getIngestedAttachmentRef } from "@/lib/mail-intake/attachments-repo";
import { getObjectStream } from "@/lib/storage/object-store";

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

    const ref = await getIngestedAttachmentRef(id);
    if (!ref) return apiFail("Документ недоступен", 404);

    const headersBase: Record<string, string> = {
      "Content-Type": ref.mimeType,
      "Content-Disposition": contentDisposition(ref.filename, isInlineType(ref.mimeType)),
      "Cache-Control": "private, no-store",
    };

    // Канонично — стрим из object storage; иначе bytea (legacy/fallback).
    if (ref.storageKey) {
      const obj = await getObjectStream(ref.storageKey);
      if (obj) {
        return new Response(obj.stream, {
          status: 200,
          headers: {
            ...headersBase,
            ...(obj.contentLength != null ? { "Content-Length": String(obj.contentLength) } : {}),
          },
        });
      }
      // ключ есть, но объект недоступен — попробуем bytea ниже
    }
    if (ref.content) {
      return new Response(new Uint8Array(ref.content), {
        status: 200,
        headers: { ...headersBase, "Content-Length": String(ref.content.byteLength) },
      });
    }
    return apiFail("Документ недоступен", 404);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[ingested] download failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось открыть документ", 500);
  }
}
