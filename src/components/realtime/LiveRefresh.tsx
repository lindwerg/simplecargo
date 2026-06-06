"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Mount on a list page to make it react to inbound-mail events without reload
// (MAIL_AI_INTEGRATION Фаза 4). Opens an SSE connection; on each realtime event
// it refreshes the current Server Component tree. The browser auto-reconnects on
// drop. Renders nothing.
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource("/api/stream");
    } catch {
      return;
    }
    es.onmessage = (e) => {
      // ignore the initial hello; refresh on real events
      try {
        const data = JSON.parse(e.data) as { kind?: string };
        if (data.kind && data.kind !== "hello") router.refresh();
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      /* EventSource reconnects automatically */
    };
    return () => es?.close();
  }, [router]);

  return null;
}
