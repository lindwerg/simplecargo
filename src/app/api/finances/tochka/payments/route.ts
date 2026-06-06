import { apiFail, apiOk } from "@/lib/api/response";
import { AuthError, requireSession, requireWriter } from "@/lib/api/session";
import { isTochkaConfigured, TochkaError } from "@/lib/finances/tochka-client";
import { createPaymentDraft, listPaymentDrafts, PaymentError } from "@/lib/finances/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateBody {
  accountId?: unknown;
  amount?: unknown;
  paymentDate?: unknown;
  purpose?: unknown;
  counterpartyName?: unknown;
  counterpartyAccount?: unknown;
  counterpartyBankBic?: unknown;
  counterpartyInn?: unknown;
  counterpartyKpp?: unknown;
  counterpartyCorrAccount?: unknown;
  counterpartyId?: unknown;
  dealId?: unknown;
  paymentNumber?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const optStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// GET — list payment drafts (any signed-in role).
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    return apiOk({ payments: await listPaymentDrafts() });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    return apiFail("Не удалось загрузить платежи", 500);
  }
}

// POST — create a payment draft and send to Точка for signing (writer-only).
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireWriter(request.headers);
    if (!isTochkaConfigured()) return apiFail("Точка не подключена", 501);

    const body = (await request.json()) as CreateBody;
    const accountId = str(body.accountId);
    const amount = Number(body.amount);
    const paymentDate = str(body.paymentDate);
    if (!accountId) return apiFail("Не указан счёт списания", 422);
    if (!Number.isFinite(amount) || amount <= 0) return apiFail("Некорректная сумма", 422);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) return apiFail("Некорректная дата платежа", 422);
    if (!str(body.counterpartyName)) return apiFail("Не указан получатель", 422);
    if (!str(body.counterpartyAccount)) return apiFail("Не указан счёт получателя", 422);
    if (!str(body.counterpartyBankBic)) return apiFail("Не указан БИК получателя", 422);
    if (!str(body.purpose)) return apiFail("Не указано назначение платежа", 422);

    const paymentNumberRaw = Number(body.paymentNumber);
    const result = await createPaymentDraft(
      {
        accountId,
        amount,
        paymentDate,
        purpose: str(body.purpose),
        counterpartyName: str(body.counterpartyName),
        counterpartyAccount: str(body.counterpartyAccount),
        counterpartyBankBic: str(body.counterpartyBankBic),
        counterpartyInn: optStr(body.counterpartyInn),
        counterpartyKpp: optStr(body.counterpartyKpp),
        counterpartyCorrAccount: optStr(body.counterpartyCorrAccount),
        counterpartyId: optStr(body.counterpartyId),
        dealId: optStr(body.dealId),
        paymentNumber: Number.isFinite(paymentNumberRaw) && paymentNumberRaw > 0 ? paymentNumberRaw : null,
      },
      user.id,
    );
    return apiOk(result, 201);
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    if (error instanceof PaymentError) return apiFail(error.message, error.status);
    if (error instanceof TochkaError) {
      return apiFail(`Точка отклонила платёж: ${error.message}`, error.status >= 400 ? 502 : 500);
    }
    console.error("[finances] payment create failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось создать платёж", 500);
  }
}
