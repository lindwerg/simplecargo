import { apiFail } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { buildCounterpartyRegistry, buildRegistryCsv } from "@/lib/partners/registry-build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentDisposition(name: string): string {
  // Заголовок — ByteString: ASCII-имя + RFC 5987 для кириллицы.
  return `attachment; filename="counterparties.csv"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// GET — сводная выгрузка контрагентов из банка + почты в CSV (read-only).
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const rows = await buildCounterpartyRegistry();
    return new Response(buildRegistryCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition("Контрагенты_из_банка.csv"),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error(
      "[partners] from-bank export failed:",
      error instanceof Error ? error.message : error,
    );
    return apiFail("Не удалось сформировать выгрузку", 500);
  }
}
