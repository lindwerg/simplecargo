import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { SideRail } from "@/components/nav/SideRail";
import { BottomBar } from "@/components/nav/BottomBar";
import { getBoardCounts } from "@/lib/requests/repository";
import { countInboxByKind } from "@/lib/mail-intake/inbox-repo";
import { countUnresolvedQuarantine } from "@/lib/mail-intake/quarantine-repo";

/**
 * Authenticated app shell. The middleware already does an optimistic cookie bounce;
 * this is the AUTHORITATIVE session check (catches expired/forged cookies).
 *
 * Navigation:
 *  - Desktop (≥768): floating glass rail on the left (brand + nav + theme/sign-out).
 *  - Mobile (<768): no top bar (PWA standalone) — just the docked glass bottom bar.
 *    Sign-out lives in the «Главная» header (see dashboard/page.tsx).
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Live counts (badges hide while zero). Best-effort — never break the shell.
  // «Входящие» badge = новые (непрочитанные) письма + очередь на проверку.
  let counts = { requests: 0, directions: 0, inbox: 0 };
  try {
    const [board, inboxCounts, review] = await Promise.all([
      getBoardCounts(),
      countInboxByKind(),
      countUnresolvedQuarantine(),
    ]);
    counts = {
      requests: board.activeRequests,
      directions: 0,
      inbox: (inboxCounts.all?.unread ?? 0) + review,
    };
  } catch {
    // keep zeros if the count query fails
  }

  return (
    // md:pl clears the floating left rail so centered content never slides under it.
    <div className="min-h-dvh md:pl-[7.5rem]">
      <SideRail counts={counts} />

      {/* pt: phone clears the notch/Dynamic Island via safe-area (no top bar anymore); section rhythm on desktop.
          pb: clears the docked mobile bottom bar (+ iOS safe area). */}
      <main className="mx-auto max-w-[var(--content-max)] px-[var(--space-gutter)] pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(var(--bottombar-clearance)+env(safe-area-inset-bottom))] md:pt-[var(--space-section)] md:pb-[var(--space-section)]">
        {children}
      </main>

      <BottomBar counts={counts} />
    </div>
  );
}
