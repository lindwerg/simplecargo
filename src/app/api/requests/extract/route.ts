import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { AiError, hasOpenRouterKey } from "@/lib/ai/openrouter";
import { extractInputSchema, type ExtractInput } from "@/lib/requests/schema";
import { extractFromInput } from "@/lib/requests/extraction";
import { xlsxToText } from "@/lib/requests/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (xlsx / image)

function aiErrorToResponse(error: AiError): Response {
  switch (error.code) {
    case "key_absent":
      return apiFail("AI-распознавание не настроено (нет ключа OPENROUTER_API_KEY). Введите строки вручную.", 501);
    case "timeout":
      return apiFail("Модель не ответила вовремя — попробуйте ещё раз или введите вручную.", 504);
    case "http":
      return apiFail("Сервис распознавания недоступен — попробуйте позже или введите вручную.", 502);
    default:
      return apiFail("Не удалось распознать — введите строки вручную.", 502);
  }
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

// Build an ExtractInput from a multipart file (xlsx → table text; image → data URL).
async function inputFromFile(file: File, clientHint: string | undefined): Promise<ExtractInput> {
  if (file.size > MAX_FILE_BYTES) {
    throw new AiError("http", "Файл больше 10 МБ");
  }
  const ext = extOf(file.name);
  const mime = file.type;
  const buf = await file.arrayBuffer();

  if (ext === "xlsx" || ext === "xls" || mime.includes("spreadsheet") || mime.includes("excel")) {
    const text = await xlsxToText(buf);
    return { modality: "text", text: text || "(пустой файл)", isTable: true, clientHint };
  }

  if (mime.startsWith("image/")) {
    const b64 = Buffer.from(buf).toString("base64");
    return { modality: "image", dataUrl: `data:${mime};base64,${b64}`, clientHint };
  }

  // unknown binary → best-effort decode as UTF-8 text
  const text = Buffer.from(buf).toString("utf-8");
  return { modality: "text", text: text || "(пустой файл)", clientHint };
}

// POST — AI extraction. Accepts multipart/form-data (file) or application/json
// ({ modality, text|dataUrl, clientHint }). Always returns a normalized
// ExtractionResult for the operator to confirm; never writes to the DB.
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);

    if (!hasOpenRouterKey()) {
      return apiFail("AI-распознавание не настроено (нет ключа OPENROUTER_API_KEY). Введите строки вручную.", 501);
    }

    const contentType = request.headers.get("content-type") ?? "";
    let input: ExtractInput;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const clientHint = (form.get("clientHint") as string | null) ?? undefined;
      if (!(file instanceof File)) {
        return apiFail("Файл не передан", 400);
      }
      input = await inputFromFile(file, clientHint || undefined);
    } else {
      const body: unknown = await request.json().catch(() => null);
      const parsed = extractInputSchema.safeParse(body);
      if (!parsed.success) {
        return apiFail(parsed.error.issues[0]?.message ?? "Некорректные данные", 400);
      }
      input = parsed.data;
    }

    const result = await extractFromInput(input);
    return apiOk(result);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof AiError) return aiErrorToResponse(error);
    console.error("[requests] extract failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось распознать запрос", 500);
  }
}
