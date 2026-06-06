"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";

/** One-click (re)registration of the Tochka webhook for payment events. The URL
 *  is derived server-side from BETTER_AUTH_URL — must be a public HTTPS domain. */
export function WebhookManager() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function register() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/finances/tochka/webhook/register", { method: "POST" });
      const json: { success: boolean; error?: string; data?: { url: string } } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Ошибка");
      setMsg(`Уведомления включены: ${json.data?.url ?? ""}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Не удалось включить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-text-secondary">
        Получать push от Точки о входящих и исходящих платежах (мгновенный авто-разнос).
        Требуется публичный HTTPS-домен.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={register} disabled={busy}>
        <BellRing aria-hidden /> {busy ? "Подключение…" : "Включить уведомления банка"}
      </Button>
      {msg && <p className="text-xs text-success">{msg}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
