"use client";

import { useEffect } from "react";

/** Помечает письмо прочитанным при открытии детальной страницы (fire-and-forget). */
export function MarkReadOnMount({ id }: { id: string }) {
  useEffect(() => {
    void fetch(`/api/inbox/${id}/read`, { method: "POST" }).catch(() => {});
  }, [id]);
  return null;
}
