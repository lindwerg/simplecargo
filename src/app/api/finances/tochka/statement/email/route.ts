import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireWriter } from "@/lib/api/session";
import { env } from "@/lib/env";
import { COMPANY } from "@/lib/config/company";
import { listAccounts, listTransactionsForExport } from "@/lib/finances/repository";
import {
  build1cBuffer,
  buildCsv,
  buildXlsx,
  type PartySide,
} from "@/lib/finances/export-builders";
import { isEmailConfigured, sendMail, type MailAttachment } from "@/lib/finances/mailer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Body {
  from?: unknown;
  to?: unknown;
  direction?: unknown;
  q?: unknown;
  format?: unknown;
  recipients?: unknown;
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

// POST — generate a statement and email it as an attachment (writer-only).
export async function POST(request: Request): Promise<Response> {
  try {
    await requireWriter(request.headers);
    if (!isEmailConfigured()) {
      return apiFail("Отправка по email не настроена (SMTP_URL)", 501);
    }

    const body = (await request.json()) as Body;
    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return apiFail("Некорректный период", 422);

    const recipients = Array.isArray(body.recipients)
      ? body.recipients.filter((r): r is string => typeof r === "string" && EMAIL_RE.test(r.trim())).map((r) => r.trim())
      : [];
    if (recipients.length === 0) return apiFail("Укажите хотя бы один email", 422);

    const format = body.format === "xlsx" || body.format === "1c" ? body.format : "csv";
    const dir = body.direction === "in" || body.direction === "out" ? body.direction : undefined;
    const search = typeof body.q === "string" && body.q.trim() ? body.q.trim() : undefined;

    const rows = await listTransactionsForExport({
      from,
      to,
      ...(dir ? { direction: dir } : {}),
      ...(search ? { search } : {}),
    });

    const base = `Выписка_${from}_${to}`;
    let attachment: MailAttachment;
    if (format === "xlsx") {
      attachment = {
        filename: `${base}.xlsx`,
        content: buildXlsx(rows),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    } else if (format === "1c") {
      attachment = {
        filename: `${base}.txt`,
        content: build1cBuffer(rows, { from, to, self: await selfParty() }),
        contentType: "text/plain; charset=windows-1251",
      };
    } else {
      attachment = { filename: `${base}.csv`, content: buildCsv(rows), contentType: "text/csv; charset=utf-8" };
    }

    await sendMail({
      to: recipients,
      subject: `${COMPANY.shortName}: выписка ${from} — ${to}`,
      text: `Во вложении выписка по счёту за период ${from} — ${to} (${rows.length} операций).`,
      attachments: [attachment],
    });

    return apiOk({ sent: recipients.length });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[finances] statement email failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось отправить выписку", 500);
  }
}
