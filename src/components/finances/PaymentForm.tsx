"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";

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
  // YYYY-MM-DD in MSK (UTC+3).
  const now = new Date(Date.now() + 3 * 3600_000);
  return now.toISOString().slice(0, 10);
}

/**
 * Создание платежа → отправка в Точку «на подписание». Банк деньги не списывает;
 * подписывает директор в интернет-банке. Здесь только черновик + статус.
 */
export function PaymentForm({ accounts }: PaymentFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/finances/tochka/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Ошибка создания платежа");
      setOk("Платёж создан и отправлен на подписание директору.");
      setForm((f) => ({ ...f, counterpartyName: "", counterpartyAccount: "", amount: "", purpose: "" }));
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось создать платёж");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className={LABEL} htmlFor="pf-account">
          Счёт списания
        </label>
        <select
          id="pf-account"
          className={FIELD}
          value={form.accountId}
          onChange={(e) => set("accountId", e.target.value)}
          required
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title ?? "Счёт"} {a.maskedNumber ? `· ${a.maskedNumber}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL} htmlFor="pf-name">
          Получатель
        </label>
        <input
          id="pf-name"
          className={FIELD}
          value={form.counterpartyName}
          onChange={(e) => set("counterpartyName", e.target.value)}
          placeholder="ООО «Контрагент»"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="pf-inn">
            ИНН
          </label>
          <input id="pf-inn" className={FIELD} value={form.counterpartyInn} onChange={(e) => set("counterpartyInn", e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <label className={LABEL} htmlFor="pf-kpp">
            КПП
          </label>
          <input id="pf-kpp" className={FIELD} value={form.counterpartyKpp} onChange={(e) => set("counterpartyKpp", e.target.value)} inputMode="numeric" />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="pf-acc">
          Счёт получателя
        </label>
        <input id="pf-acc" className={FIELD} value={form.counterpartyAccount} onChange={(e) => set("counterpartyAccount", e.target.value)} inputMode="numeric" placeholder="40702810…" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="pf-bic">
            БИК банка
          </label>
          <input id="pf-bic" className={FIELD} value={form.counterpartyBankBic} onChange={(e) => set("counterpartyBankBic", e.target.value)} inputMode="numeric" placeholder="044525…" required />
        </div>
        <div>
          <label className={LABEL} htmlFor="pf-corr">
            Корсчёт (необяз.)
          </label>
          <input id="pf-corr" className={FIELD} value={form.counterpartyCorrAccount} onChange={(e) => set("counterpartyCorrAccount", e.target.value)} inputMode="numeric" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="pf-amount">
            Сумма, ₽
          </label>
          <input id="pf-amount" className={FIELD} value={form.amount} onChange={(e) => set("amount", e.target.value)} inputMode="decimal" placeholder="100000" required />
        </div>
        <div>
          <label className={LABEL} htmlFor="pf-date">
            Дата платежа
          </label>
          <input id="pf-date" type="date" className={FIELD} value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} required />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="pf-purpose">
          Назначение платежа
        </label>
        <textarea
          id="pf-purpose"
          className={FIELD}
          rows={3}
          maxLength={210}
          value={form.purpose}
          onChange={(e) => set("purpose", e.target.value)}
          placeholder="Оплата по счёту № … от …, в т.ч. НДС 20%"
          required
        />
        <p className="mt-1 text-right text-xs text-text-tertiary">{form.purpose.length}/210</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {ok && <p className="text-sm text-success">{ok}</p>}

      <Button type="submit" disabled={busy || !accounts.length}>
        <Send aria-hidden /> {busy ? "Отправка…" : "Создать и отправить на подпись"}
      </Button>
    </form>
  );
}
