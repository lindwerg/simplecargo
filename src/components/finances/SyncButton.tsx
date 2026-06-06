"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SyncResultData {
  accounts: number;
  inserted: number;
  skipped: number;
  failed: number;
  linked: number;
  dealsLinked: number;
  warnings: string[];
}

/**
 * Pulls fresh accounts + statements from Точка, then refreshes the page. The bank
 * side is read-only; the request only writes to our own DB (idempotent dedup).
 */
export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/finances/tochka/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json: { success: boolean; data?: SyncResultData; error?: string } = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Не удалось синхронизировать");
      }
      const d = json.data;
      setNote(
        `Готово: +${d.inserted} новых, ${d.skipped} уже было, разнесено ${d.linked}` +
          `${d.dealsLinked ? ` (по сделкам ${d.dealsLinked})` : ""}` +
          `${d.failed ? `, ${d.failed} не разобрано` : ""}.` +
          (d.warnings.length ? ` ⚠ ${d.warnings.join("; ")}` : ""),
      );
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка синхронизации");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" onClick={handleSync} disabled={loading} size="sm">
        <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
        {loading ? "Синхронизация…" : "Обновить из Точки"}
      </Button>
      {note && <p className="max-w-xs text-right text-xs text-text-tertiary">{note}</p>}
      {error && <p className="max-w-xs text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
