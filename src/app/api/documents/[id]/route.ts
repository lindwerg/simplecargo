import { z } from "zod";

import { apiFail } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { deleteDocument, getDocument } from "@/lib/partners/repository";
import { deleteFile, readStoredFile } from "@/lib/storage/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// Encode a filename for Content-Disposition (RFC 5987) so Cyrillic names survive.
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// GET — stream the stored blob to any signed-in user.
export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const doc = await getDocument(id);
    if (!doc) return apiFail("Документ не найден", 404);

    let data: Buffer;
    try {
      data = await readStoredFile(doc.storageKey);
    } catch {
      return apiFail("Файл недоступен", 404);
    }

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(data.byteLength),
        "Content-Disposition": contentDisposition(doc.originalFilename),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[documents] download failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось скачать документ", 500);
  }
}

// DELETE — remove the metadata row and unlink the blob.
export async function DELETE(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const storageKey = await deleteDocument(id);
    if (storageKey === null) return apiFail("Документ не найден", 404);
    await deleteFile(storageKey);
    return Response.json({ success: true, data: { id } }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[documents] delete failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось удалить документ", 500);
  }
}
