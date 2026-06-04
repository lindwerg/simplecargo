import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

import { auth } from "@/lib/auth";
import { FunnelNav } from "@/components/nav/FunnelNav";
import { UserMenu } from "@/components/nav/UserMenu";

const MSK_TZ = "Europe/Moscow";

/**
 * Authenticated app shell. The middleware already does an optimistic cookie bounce;
 * this is the AUTHORITATIVE session check (catches expired/forged cookies). Every
 * funnel tab + the dashboard renders inside this header.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  // Reports badge = current month in MSK (the business clock), Russian.
  const reportLabel = format(toZonedTime(new Date(), MSK_TZ), "LLLL", { locale: ru });

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-1/95 backdrop-blur-0">
        <div className="mx-auto flex h-12 max-w-[var(--content-max)] items-center justify-between gap-4 px-[var(--space-gutter)]">
          <FunnelNav counts={{ requests: 0, directions: 0, reportLabel }} />
          <UserMenu email={session.user.email} />
        </div>
      </header>

      {/* pb leaves room for the fixed mobile bottom bar (h-14). */}
      <main className="mx-auto max-w-[var(--content-max)] px-[var(--space-gutter)] pb-20 pt-[var(--space-section)] md:pb-[var(--space-section)]">
        {children}
      </main>
    </div>
  );
}
