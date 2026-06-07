import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { env } from "@/lib/env";
import { bankAccounts, paymentDrafts } from "@/lib/db/schema/tochkaFinance";
import { inboundInvoices } from "@/lib/db/schema/inboundInvoices";
import {
  createPaymentForSign,
  getPaymentStatus,
  NON_BUDGET_TAX_INFO,
  type PaymentForSignPayload,
} from "./tochka-client";
import { sanitizePaymentPurpose } from "./payment-purpose";

// Платежи: создание черновика «на подписание» + опрос статуса. Банк деньги не
// списывает — подписывает директор в интернет-банке.

export class PaymentError extends Error {
  constructor(
    public readonly status: 404 | 422,
    message: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface CreatePaymentInput {
  accountId: string; // наш bank_accounts.id (счёт плательщика)
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  purpose: string;
  counterpartyName: string;
  counterpartyAccount: string;
  counterpartyBankBic: string;
  counterpartyInn?: string | null;
  counterpartyKpp?: string | null;
  counterpartyCorrAccount?: string | null;
  counterpartyId?: string | null;
  dealId?: string | null;
  paymentNumber?: number | null;
  inboundInvoiceId?: string | null; // счёт, по которому платим (для остатка)
}

const MAX_PURPOSE = 210;

// Черновики, занимающие остаток счёта (отправлен на подпись или уже оплачен).
const ACTIVE_DRAFT_STATUSES = ["on_sign", "paid"] as const;

// Tochka payment lifecycle → our coarse local status.
function mapStatus(raw: string | null): "on_sign" | "paid" | "rejected" {
  if (!raw) return "on_sign";
  const v = raw.toLowerCase();
  if (v === "paid") return "paid";
  if (v === "rejected" || v === "canceled" || v === "notallowed") return "rejected";
  return "on_sign";
}

function readTochkaStatus(response: unknown): string | null {
  const data = (response as { Data?: { status?: unknown } } | null)?.Data;
  return typeof data?.status === "string" ? data.status : null;
}

/** Create a payment draft and send it to Точка for signing. */
export async function createPaymentDraft(
  input: CreatePaymentInput,
  userId: string,
): Promise<{ id: string; requestId: string; redirectURL: string | null }> {
  // Точка запрещает em-dash «—» и режет назначение по 210 символов.
  const purpose = sanitizePaymentPurpose(input.purpose);
  if (!purpose) throw new PaymentError(422, "Не указано назначение платежа");
  if (purpose.length > MAX_PURPOSE) {
    throw new PaymentError(422, `Назначение длиннее ${MAX_PURPOSE} символов`);
  }
  if (!(input.amount > 0)) throw new PaymentError(422, "Сумма должна быть больше нуля");

  const [account] = await db
    .select({ id: bankAccounts.id, externalAccountId: bankAccounts.externalAccountId })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, input.accountId));
  if (!account) throw new PaymentError(404, "Счёт плательщика не найден");

  // externalAccountId Точки = "<20 цифр счёта>/<БИК>". accountCode — только счёт.
  const [accountCode, bicFromAccount] = account.externalAccountId.split("/");

  const payload: PaymentForSignPayload = {
    accountCode,
    bankCode: bicFromAccount || env.TOCHKA_PAYER_BIC,
    counterpartyAccountNumber: input.counterpartyAccount,
    counterpartyBankBic: input.counterpartyBankBic,
    counterpartyName: input.counterpartyName,
    paymentAmount: input.amount,
    paymentDate: input.paymentDate,
    paymentPurpose: purpose,
    supplierBillId: "0",
    taxInfo: NON_BUDGET_TAX_INFO,
    ...(input.counterpartyInn ? { counterpartyINN: input.counterpartyInn } : {}),
    ...(input.counterpartyKpp ? { counterpartyKPP: input.counterpartyKpp } : {}),
    ...(input.counterpartyCorrAccount
      ? { counterpartyBankCorrAccount: input.counterpartyCorrAccount }
      : {}),
    ...(input.paymentNumber ? { paymentNumber: input.paymentNumber } : {}),
  };

  // Bank call first — only persist a draft once Точка accepted it.
  const { requestId, redirectURL } = await createPaymentForSign(payload);

  const [row] = await db
    .insert(paymentDrafts)
    .values({
      accountId: account.id,
      externalRequestId: requestId,
      redirectUrl: redirectURL,
      inboundInvoiceId: input.inboundInvoiceId ?? null,
      amount: input.amount.toFixed(2),
      paymentDate: input.paymentDate,
      paymentNumber: input.paymentNumber ?? null,
      purpose,
      counterpartyName: input.counterpartyName,
      counterpartyInn: input.counterpartyInn ?? null,
      counterpartyKpp: input.counterpartyKpp ?? null,
      counterpartyAccount: input.counterpartyAccount,
      counterpartyBankBic: input.counterpartyBankBic,
      counterpartyCorrAccount: input.counterpartyCorrAccount ?? null,
      counterpartyId: input.counterpartyId ?? null,
      dealId: input.dealId ?? null,
      status: "on_sign",
      createdBy: userId,
    })
    .returning({ id: paymentDrafts.id });

  // Пересчитать остаток по счёту и обновить его статус (partial/paid).
  if (input.inboundInvoiceId) {
    await refreshInvoiceRemaining(input.inboundInvoiceId);
  }

  return { id: row.id, requestId, redirectURL };
}

/** Остаток к оплате по счёту = сумма счёта − Σ активных черновиков (на подписи/оплачены). */
export async function getInvoiceRemaining(
  invoiceId: string,
): Promise<{ amountTotal: number; paid: number; remaining: number } | null> {
  const [inv] = await db
    .select({ amountTotal: inboundInvoices.amountTotal })
    .from(inboundInvoices)
    .where(eq(inboundInvoices.id, invoiceId));
  if (!inv) return null;
  const amountTotal = Number(inv.amountTotal ?? 0);

  const [agg] = await db
    .select({ paid: sql<string>`COALESCE(SUM(${paymentDrafts.amount}), 0)` })
    .from(paymentDrafts)
    .where(
      and(
        eq(paymentDrafts.inboundInvoiceId, invoiceId),
        inArray(paymentDrafts.status, [...ACTIVE_DRAFT_STATUSES]),
      ),
    );
  const paid = Number(agg?.paid ?? 0);
  return { amountTotal, paid, remaining: Math.max(0, amountTotal - paid) };
}

/** Обновить статус счёта по остатку: 0 → paid, частично → partial. */
async function refreshInvoiceRemaining(invoiceId: string): Promise<void> {
  const r = await getInvoiceRemaining(invoiceId);
  if (!r || r.amountTotal <= 0) return;
  const status = r.remaining <= 0 ? "paid" : r.paid > 0 ? "partial" : "pending";
  await db
    .update(inboundInvoices)
    .set({ status, updatedAt: new Date() })
    .where(eq(inboundInvoices.id, invoiceId));
}

/** Poll Точка for the latest status of one draft and persist it. */
export async function refreshPaymentStatus(id: string): Promise<string> {
  const [draft] = await db
    .select({ id: paymentDrafts.id, requestId: paymentDrafts.externalRequestId })
    .from(paymentDrafts)
    .where(eq(paymentDrafts.id, id));
  if (!draft) throw new PaymentError(404, "Платёж не найден");
  if (!draft.requestId) throw new PaymentError(422, "У платежа нет requestId");

  const response = await getPaymentStatus(draft.requestId);
  const tochkaStatus = readTochkaStatus(response);
  await db
    .update(paymentDrafts)
    .set({ tochkaStatus, status: mapStatus(tochkaStatus), updatedAt: new Date() })
    .where(eq(paymentDrafts.id, id));
  return tochkaStatus ?? "unknown";
}

export interface PaymentDraftRow {
  id: string;
  amount: number;
  paymentDate: string;
  purpose: string;
  counterpartyName: string;
  status: string;
  tochkaStatus: string | null;
  createdAt: string;
}

export async function listPaymentDrafts(limit = 50): Promise<PaymentDraftRow[]> {
  const rows = await db
    .select({
      id: paymentDrafts.id,
      amount: paymentDrafts.amount,
      paymentDate: paymentDrafts.paymentDate,
      purpose: paymentDrafts.purpose,
      counterpartyName: paymentDrafts.counterpartyName,
      status: paymentDrafts.status,
      tochkaStatus: paymentDrafts.tochkaStatus,
      createdAt: paymentDrafts.createdAt,
    })
    .from(paymentDrafts)
    .orderBy(desc(paymentDrafts.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    paymentDate: r.paymentDate,
    purpose: r.purpose,
    counterpartyName: r.counterpartyName,
    status: r.status,
    tochkaStatus: r.tochkaStatus,
    createdAt: r.createdAt.toISOString(),
  }));
}
