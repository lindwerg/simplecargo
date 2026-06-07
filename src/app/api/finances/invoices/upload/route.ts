import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { InvoiceUploadError, processUploadedInvoice } from "@/lib/finances/invoice-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 МБ (как кап вложений)

// POST — загрузить счёт (multipart `file`), ИИ распознаёт его и возвращает
// префилл платежа (реквизиты + сумма/остаток + готовое назначение). Writer-only.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiFail("Файл не передан", 422);
    if (file.size === 0) return apiFail("Пустой файл", 422);
    if (file.size > MAX_UPLOAD_BYTES) return apiFail("Файл больше 15 МБ", 422);

    const buffer = Buffer.from(await file.arrayBuffer());
    const prefill = await processUploadedInvoice(file.name, file.type, buffer);
    return apiOk({ prefill }, 200);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof InvoiceUploadError) return apiFail(error.message, error.status);
    console.error("[finances] invoice upload failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось распознать счёт", 500);
  }
}
