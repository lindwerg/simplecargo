import { z } from "zod";

import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { documentMetaSchema } from "@/lib/partners/schema";
import { createDocument, listDocuments, PartnerError } from "@/lib/partners/repository";
import {
  buildDocumentKey,
  isAllowedMime,
  MAX_DOCUMENT_BYTES,
  saveFile,
} from "@/lib/storage/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);
    return apiOk(await listDocuments(id));
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[partners] documents list failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить документы", 500);
  }
}

// POST — multipart upload: a `file` plus metadata fields (kind/title/docRef/docDate).
// Writes the blob to the volume, then records metadata. On a metadata failure the
// just-written blob is best-effort left in place (orphan sweep is out of scope).
export async function POST(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) return apiFail("Некорректный идентификатор", 400);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return apiFail("Ожидается multipart/form-data", 400);
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiFail("Файл не передан", 400);
    if (file.size === 0) return apiFail("Файл пустой", 400);
    if (file.size > MAX_DOCUMENT_BYTES) {
      return apiFail("Файл больше 20 МБ", 413);
    }
    if (!isAllowedMime(file.type)) {
      return apiFail("Тип файла не поддерживается (PDF, JPG, PNG, DOC/DOCX, XLS/XLSX)", 415);
    }

    const meta = documentMetaSchema.safeParse({
      kind: form.get("kind") ?? undefined,
      title: form.get("title") ?? undefined,
      docRef: form.get("docRef") ?? undefined,
      docDate: form.get("docDate") ?? undefined,
    });
    if (!meta.success) {
      return apiFail(meta.error.issues[0]?.message ?? "Некорректные данные", 400);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = buildDocumentKey(id, file.type, file.name);
    await saveFile(storageKey, buffer);

    const result = await createDocument(id, {
      ...meta.data,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      storageKey,
      uploadedBy: user.id,
    });
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PartnerError) return apiFail(error.message, error.status);
    console.error("[partners] document upload failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось загрузить документ", 500);
  }
}
