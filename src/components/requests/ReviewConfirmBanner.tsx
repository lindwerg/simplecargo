"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ReviewConfirmBannerProps {
  requestId: string;
}

/** Shown on an ai_email request that still needs_review. The operator confirms the
 *  AI-extracted data before the request is acted on — the safety boundary of
 *  auto-intake (AUTONOMY_AUDIT §3). Clears the flag via /confirm-review. */
export function ReviewConfirmBanner({ requestId }: ReviewConfirmBannerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/confirm-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Не удалось подтвердить");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-warn bg-warn-quiet px-4 py-3 text-sm text-text sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-warn" aria-hidden />
        Запрос создан ИИ из письма. Проверьте данные и подтвердите.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {error && <span className="text-xs text-danger">{error}</span>}
        <Button type="button" size="sm" onClick={confirm} disabled={loading}>
          {loading ? "Подтверждаю…" : "Подтвердить"}
        </Button>
      </div>
    </div>
  );
}
