"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

/** Delete a company (with a confirm) and return to the directory. */
export function DeletePartnerButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(`Удалить «${name}» вместе с контактами и документами?`)) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/partners/${id}`, { method: "DELETE" });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось удалить");
      router.push("/partners");
      router.refresh();
    } catch (err: unknown) {
      window.alert(err instanceof Error ? err.message : "Не удалось удалить");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-border px-3 text-sm text-text-secondary transition-colors hover:border-danger hover:bg-danger-quiet hover:text-danger focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
    >
      <Trash2 className="size-4" aria-hidden />
      Удалить
    </button>
  );
}
