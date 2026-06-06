import { env } from "@/lib/env";

// Thin typed client for the Tochka Open Banking API. Server-only — the JWT never
// reaches the browser. Endpoints are version-pathed UNDER the base URL, so the
// base carries the env prefix (sandbox `/sandbox/v2` or prod `/uapi`) and the
// paths below stay identical across both.

const OPEN_BANKING = "/open-banking/v1.0";
const PAYMENT = "/payment/v1.0";
const DEFAULT_TIMEOUT_MS = 30_000;

export class TochkaError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "TochkaError";
  }
}

interface TochkaConfig {
  baseUrl: string;
  token: string;
  customerCode: string | undefined;
}

/** True when a JWT is configured. Routes use this to degrade to 501 cleanly. */
export function isTochkaConfigured(): boolean {
  return Boolean(env.TOCHKA_JWT_TOKEN);
}

function getConfig(): TochkaConfig {
  if (!env.TOCHKA_JWT_TOKEN) {
    throw new TochkaError(501, "Точка не подключена: задайте TOCHKA_JWT_TOKEN");
  }
  return {
    baseUrl: env.TOCHKA_BASE_URL.replace(/\/+$/, ""),
    token: env.TOCHKA_JWT_TOKEN,
    customerCode: env.TOCHKA_CUSTOMER_CODE,
  };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
}

async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const cfg = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.token}`,
    Accept: "application/json",
  };
  if (cfg.customerCode) {
    headers.CustomerCode = cfg.customerCode;
  }
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
    signal: controller.signal,
    cache: "no-store",
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }

  let response: Response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, init);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TochkaError(504, "Точка не ответила вовремя");
    }
    throw new TochkaError(502, "Не удалось связаться с Точкой");
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  if (!response.ok) {
    throw new TochkaError(response.status, `Точка вернула ошибку ${response.status}`, json);
  }
  return json as T;
}

// accountId формата "<счёт>/<БИК>" содержит слэш → кодируем для пути.
function encodeAccountId(accountId: string): string {
  return encodeURIComponent(accountId);
}

// --- Endpoints -------------------------------------------------------------

/** GET список счетов компании. Возвращает сырой JSON (envelope `{ Data: ... }`). */
export function listAccounts(): Promise<unknown> {
  return request(`${OPEN_BANKING}/accounts`);
}

/** GET остатки по счёту. */
export function getBalances(accountId: string): Promise<unknown> {
  return request(`${OPEN_BANKING}/accounts/${encodeAccountId(accountId)}/balances`);
}

export interface StatementRequest {
  accountId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

/** POST инициализация выписки за период. Возвращает id выписки (для poll). */
export function initStatement(req: StatementRequest): Promise<unknown> {
  return request(`${OPEN_BANKING}/statements`, {
    method: "POST",
    body: {
      Data: {
        Statement: {
          accountId: req.accountId,
          startDateTime: req.startDate,
          endDateTime: req.endDate,
        },
      },
    },
  });
}

/** GET готовую выписку (poll по статусу до Ready, затем чтение операций). */
export function getStatement(accountId: string, statementId: string): Promise<unknown> {
  return request(
    `${OPEN_BANKING}/accounts/${encodeAccountId(accountId)}/statements/${encodeURIComponent(statementId)}`,
  );
}

// --- Платежи (создание на подписание) -------------------------------------
// Схема выверена по OpenAPI Точки: тело — плоский { Data: { ... } }, банк сам
// деньги НЕ списывает; ответ — { Data: { requestId } }. Подпись — за директором.

export interface PaymentForSignPayload {
  accountCode: string; // счёт плательщика (наш), 20 цифр
  bankCode: string; // БИК банка плательщика (Точка)
  counterpartyAccountNumber: string;
  counterpartyBankBic: string;
  counterpartyName: string;
  paymentAmount: number;
  paymentDate: string; // YYYY-MM-DD (МСК)
  paymentPurpose: string; // 1..210
  counterpartyINN?: string;
  counterpartyKPP?: string;
  counterpartyBankCorrAccount?: string;
  paymentNumber?: number;
  paymentPriority?: string; // очередность, по умолчанию "5"
}

/** POST создать платёж «на подписание». Возвращает requestId Точки. */
export async function createPaymentForSign(payload: PaymentForSignPayload): Promise<string> {
  const response = await request<{ Data?: { requestId?: string } }>(`${PAYMENT}/for-sign`, {
    method: "POST",
    body: { Data: payload },
  });
  const requestId = response?.Data?.requestId;
  if (!requestId) {
    throw new TochkaError(502, "Точка не вернула requestId платежа", response);
  }
  return requestId;
}

/** GET статус платежа по requestId. */
export function getPaymentStatus(requestId: string): Promise<unknown> {
  return request(`${PAYMENT}/status/${encodeURIComponent(requestId)}`);
}

// --- Вебхуки (регистрация подписки) ---------------------------------------
const WEBHOOK = "/webhook/v1.0";

// События, на которые подписываемся (в рамках прав токена).
export const DEFAULT_WEBHOOK_EVENTS = [
  "incomingPayment",
  "outgoingPayment",
  "incomingSbpPayment",
] as const;

function webhookClientId(): string {
  if (!env.TOCHKA_CLIENT_ID) {
    throw new TochkaError(501, "Не задан TOCHKA_CLIENT_ID для вебхуков");
  }
  return env.TOCHKA_CLIENT_ID;
}

/** PUT зарегистрировать (заменить) подписку на вебхуки: { webhooksList, url }. */
export function registerWebhook(url: string, webhooksList: readonly string[]): Promise<unknown> {
  return request(`${WEBHOOK}/${encodeURIComponent(webhookClientId())}`, {
    method: "PUT",
    body: { url, webhooksList: [...webhooksList] },
  });
}

/** GET текущие подписки. */
export function getWebhooks(): Promise<unknown> {
  return request(`${WEBHOOK}/${encodeURIComponent(webhookClientId())}`);
}
