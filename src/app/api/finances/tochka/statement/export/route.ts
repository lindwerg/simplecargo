import { apiFail } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { env } from "@/lib/env";
import { COMPANY } from "@/lib/config/company";
import { listAccounts, listTransactionsForExport } from "@/lib/finances/repository";
import { build1cBuffer, buildCsv, buildXlsx, type PartySide } from "@/lib/finances/export-builders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function contentDisposition(name: string, ext: string): string {
  // Header values are ByteStrings — the plain filename must be ASCII; the Cyrillic
  // name goes in the RFC 5987 filename* field.
  return `attachment; filename="statement.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

async function selfParty(): Promise<PartySide> {
  const accounts = await listAccounts();
  return {
    accountNumber: accounts[0]?.maskedNumber ?? "",
    bic: env.TOCHKA_PAYER_BIC,
    name: COMPANY.name,
    inn: COMPANY.inn,
    kpp: COMPANY.kpp,
  };
}

// GET ?format=csv|xlsx|1c&from=&to=&direction=&q= — download a statement.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") ?? "csv";
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return apiFail("Некорректный период", 422);
    const dirParam = searchParams.get("direction");
    const direction = dirParam === "in" || dirParam === "out" ? dirParam : undefined;
    const search = searchParams.get("q") ?? undefined;

    const rows = await listTransactionsForExport({
      from,
      to,
      ...(direction ? { direction } : {}),
      ...(search ? { search } : {}),
    });
    const base = `Выписка_${from}_${to}`;

    if (format === "xlsx") {
      return new Response(new Uint8Array(buildXlsx(rows)), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDisposition(`${base}.xlsx`, "xlsx"),
        },
      });
    }

    if (format === "1c") {
      const buf = build1cBuffer(rows, { from, to, self: await selfParty() });
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "text/plain; charset=windows-1251",
          "Content-Disposition": contentDisposition(`${base}.txt`, "txt"),
        },
      });
    }

    return new Response(buildCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`${base}.csv`, "csv"),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[finances] export failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось сформировать выписку", 500);
  }
}
