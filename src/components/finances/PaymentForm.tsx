"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Upload, RefreshCw, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildPaymentPurpose } from "@/lib/finances/payment-purpose";

interface AccountOption {
  id: string;
  title: string | null;
  maskedNumber: string | null;
}

interface PaymentFormProps {
  accounts: readonly AccountOption[];
}

const FIELD =
  "w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text outline-none focus-visible:[box-shadow:var(--ring-focus)]";
const LABEL = "block text-xs text-text-tertiary mb-1";

function todayMsk(): string {
  const now = new Date(Date.now() + 3 * 3600_000);
  return now.toISOString().slice(0, 10);
}

// НДС-режим формы: ставка в процентах + «в т.ч.»; "none" = без НДС.
type VatMode = "22" | "20" | "10" | "0" | "none";

function vatParts(mode: VatMode): { vatRate: number | null; vatIncluded: boolean } {
  if (mode === "none") return { vatRate: 0, vatIncluded: false };
  return { vatRate: Number(mode), vatIncluded: true };
}

interface RefState {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  contractNumber: string | null;
  contractDate: string | null;
  serviceDescription: string | null;
}

const EMPTY_REFS: RefState = {
  invoiceNumber: null,
  invoiceDate: null,
  contractNumber: null,
  contractDate: null,
  serviceDescription: null,
};

/**
 * Платёж в Точку «на подписание». Можно загрузить счёт (ИИ заполнит реквизиты,
 * сумму и назначение) или ввести вручную. Сумма редактируется (частичная оплата) —
 * НДС и назначение пересчитываются. Банк деньги не списывает: подписывает директор.
 */
export function PaymentForm({ accounts }: PaymentFormProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [signUrl, setSignUrl] = useState<string | null>(null);
  const [purposeEdited, setPurposeEdited] = useState(false);
  const [refs, setRefs] = useState<RefState>(EMPTY_REFS);
  const [inboundInvoiceId, setInboundInvoiceId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [vatMode, setVatMode] = useState<VatMode>("22");
  const [form, setForm] = useState({
    accountId: accounts[0]?.id ?? "",
    counterpartyName: "",
    counterpartyInn: "",
    counterpartyKpp: "",
    counterpartyAccount: "",
    counterpartyBankBic: "",
    counterpartyCorrAccount: "",
    amount: "",
    paymentDate: todayMsk(),
    purpose: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Пересобрать назначение из текущих реквизитов/суммы/НДС, если оператор не правил вручную.
  function rebuildPurpose(
    next: { amount?: string; mode?: VatMode; refs?: RefState } = {},
  ): void {
    const amount = Number(next.amount ?? form.amount);
    const { vatRate, vatIncluded } = vatParts(next.mode ?? vatMode);
    const r = next.refs ?? refs;
    const purpose = buildPaymentPurpose({
      invoiceNumber: r.invoiceNumber,
      invoiceDate: r.invoiceDate,
      contractNumber: r.contractNumber,
      contractDate: r.contractDate,
      serviceDescription: r.serviceDescription,
      amount: Number.isFinite(amount) ? amount : 0,
      vatRate,
      vatIncluded,
    });
    setForm((f) => ({ ...f, purpose }));
  }

  function onAmount(value: string) {
    set("amount", value);
    if (!purposeEdited) rebuildPurpose({ amount: value });
  }

  function onVat(mode: VatMode) {
    setVatMode(mode);
    if (!purposeEdited) rebuildPurpose({ mode });
  }

  async function onUpload(file: File) {
    setRecognizing(true);
    setError(null);
    setWarnings([]);
    setSignUrl(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/finances/invoices/upload", { method: "POST", body: fd });
      const json: { success: boolean; data?: { prefill: PrefillDTO }; error?: string } =
        await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Не удалось распознать счёт");
      }
      applyPrefill(json.data.prefill);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось распознать счёт");
    } finally {
      setRecognizing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function applyPrefill(p: PrefillDTO) {
    const nextRefs: RefState = {
      invoiceNumber: p.invoiceNumber,
      invoiceDate: p.invoiceDate,
      contractNumber: p.contractNumber,
      contractDate: p.contractDate,
      serviceDescription: p.serviceDescription,
    };
    const mode: VatMode =
      p.vatIncluded === false ? "none" : (String(p.vatRate ?? 22) as VatMode);
    setRefs(nextRefs);
    setInboundInvoiceId(p.inboundInvoiceId);
    setRemaining(p.remaining);
    setVatMode(mode);
    setPurposeEdited(false);
    setWarnings(p.warnings ?? []);
    setForm((f) => ({
      ...f,
      counterpartyName: p.counterpartyName ?? "",
      counterpartyInn: p.counterpartyInn ?? "",
      counterpartyKpp: p.counterpartyKpp ?? "",
      counterpartyAccount: p.counterpartyAccount ?? "",
      counterpartyBankBic: p.counterpartyBankBic ?? "",
      counterpartyCorrAccount: p.counterpartyCorrAccount ?? "",
      amount: p.amount ? String(p.amount) : "",
      purpose: p.purpose,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSignUrl(null);
    try {
      const res = await fetch("/api/finances/tochka/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount), inboundInvoiceId }),
      });
      const json: { success: boolean; data?: { redirectURL?: string | null }; error?: string } =
        await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Ошибка создания платежа");
      setSignUrl(json.data?.redirectURL ?? null);
      setWarnings([]);
      setInboundInvoiceId(null);
      setRemaining(null);
      setRefs(EMPTY_REFS);
      setForm((f) => ({ ...f, counterpartyName: "", counterpartyAccount: "", amount: "", purpose: "" }));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось создать платёж");
    } finally {
      setBusy(false);
    }
  }

  const amountNum = Number(form.amount);
  const overRemaining = remaining != null && Number.isFinite(amountNum) && amountNum > remaining + 0.005;

  return (
    <div className="space-y-4">
      {/* Загрузка счёта — ИИ заполнит платёж (клик или drag-and-drop) */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => !recognizing && fileRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !recognizing) fileRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !recognizing) void onUpload(f);
        }}
        className={`cursor-pointer rounded-md border-2 border-dashed p-4 text-center transition-colors ${
          dragging ? "border-accent bg-accent-quiet" : "border-border bg-surface-2 hover:bg-surface-1"
        } ${recognizing ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
          }}
        />
        <Upload className="mx-auto mb-1 size-5 text-text-secondary" aria-hidden />
        <p className="text-sm font-medium text-text">
          {recognizing ? "Распознаю счёт…" : "Перетащите счёт сюда или нажмите, чтобы выбрать"}
        </p>
        <p className="text-xs text-text-tertiary">
          PDF, фото или Excel — любой формат счёта. ИИ сам заполнит реквизиты, сумму и назначение.
        </p>
      </div>

      {warnings.length > 0 && (
        <ul className="rounded-md border border-warn/40 bg-warn-quiet px-3 py-2 text-xs text-warn">
          {warnings.map((w, i) => (
            <li key={i}>• {w}</li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className={LABEL} htmlFor="pf-account">Счёт списания</label>
          <select id="pf-account" className={FIELD} value={form.accountId} onChange={(e) => set("accountId", e.target.value)} required>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title ?? "Счёт"} {a.maskedNumber ? `· ${a.maskedNumber}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={LABEL} htmlFor="pf-name">Получатель</label>
          <input id="pf-name" className={FIELD} value={form.counterpartyName} onChange={(e) => set("counterpartyName", e.target.value)} placeholder="ООО «Контрагент»" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} htmlFor="pf-inn">ИНН</label>
            <input id="pf-inn" className={FIELD} value={form.counterpartyInn} onChange={(e) => set("counterpartyInn", e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label className={LABEL} htmlFor="pf-kpp">КПП</label>
            <input id="pf-kpp" className={FIELD} value={form.counterpartyKpp} onChange={(e) => set("counterpartyKpp", e.target.value)} inputMode="numeric" />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="pf-acc">Счёт получателя</label>
          <input id="pf-acc" className={FIELD} value={form.counterpartyAccount} onChange={(e) => set("counterpartyAccount", e.target.value)} inputMode="numeric" placeholder="40702810…" required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} htmlFor="pf-bic">БИК банка</label>
            <input id="pf-bic" className={FIELD} value={form.counterpartyBankBic} onChange={(e) => set("counterpartyBankBic", e.target.value)} inputMode="numeric" placeholder="044525…" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="pf-corr">Корсчёт (необяз.)</label>
            <input id="pf-corr" className={FIELD} value={form.counterpartyCorrAccount} onChange={(e) => set("counterpartyCorrAccount", e.target.value)} inputMode="numeric" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={LABEL} htmlFor="pf-amount">Сумма, ₽</label>
            <input id="pf-amount" className={FIELD} value={form.amount} onChange={(e) => onAmount(e.target.value)} inputMode="decimal" placeholder="100000" required />
          </div>
          <div>
            <label className={LABEL} htmlFor="pf-vat">НДС</label>
            <select id="pf-vat" className={FIELD} value={vatMode} onChange={(e) => onVat(e.target.value as VatMode)}>
              <option value="22">в т.ч. 22%</option>
              <option value="20">в т.ч. 20%</option>
              <option value="10">в т.ч. 10%</option>
              <option value="0">в т.ч. 0%</option>
              <option value="none">Без НДС</option>
            </select>
          </div>
          <div>
            <label className={LABEL} htmlFor="pf-date">Дата платежа</label>
            <input id="pf-date" type="date" className={FIELD} value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} max={todayMsk()} required />
          </div>
        </div>

        {remaining != null && (
          <p className={`text-xs ${overRemaining ? "text-danger" : "text-text-tertiary"}`}>
            Остаток к оплате по счёту: {remaining.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽
            {overRemaining ? " — сумма превышает остаток" : ""}
          </p>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className={LABEL} htmlFor="pf-purpose">Назначение платежа</label>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text"
              onClick={() => {
                setPurposeEdited(false);
                rebuildPurpose();
              }}
            >
              <RefreshCw className="size-3" aria-hidden /> собрать назначение
            </button>
          </div>
          <textarea
            id="pf-purpose"
            className={FIELD}
            rows={3}
            maxLength={210}
            value={form.purpose}
            onChange={(e) => {
              setPurposeEdited(true);
              set("purpose", e.target.value);
            }}
            placeholder="Оплата по счёту № … от …, в т.ч. НДС 22% - … руб."
            required
          />
          <p className="mt-1 text-right text-xs text-text-tertiary">{form.purpose.length}/210</p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {signUrl !== null && (
          <p className="text-sm text-success">
            Платёж создан и отправлен на подпись.{" "}
            {signUrl && (
              <a className="inline-flex items-center gap-1 underline" href={signUrl} target="_blank" rel="noopener noreferrer">
                Подписать в Точке <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </p>
        )}

        <Button type="submit" disabled={busy || !accounts.length}>
          <Send aria-hidden /> {busy ? "Отправка…" : "Создать и отправить на подпись"}
        </Button>
      </form>
    </div>
  );
}

// Префилл от /api/finances/invoices/upload (см. lib/finances/invoice-upload.ts).
interface PrefillDTO {
  inboundInvoiceId: string;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  counterpartyKpp: string | null;
  counterpartyAccount: string | null;
  counterpartyBankBic: string | null;
  counterpartyCorrAccount: string | null;
  amount: number;
  amountTotal: number | null;
  remaining: number | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  contractNumber: string | null;
  contractDate: string | null;
  serviceDescription: string | null;
  vatRate: number | null;
  vatIncluded: boolean | null;
  purpose: string;
  warnings: string[];
  confidence: number;
}
