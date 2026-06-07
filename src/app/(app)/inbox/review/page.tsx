import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { QuarantineList } from "@/components/requests/QuarantineList";
import { listQuarantine, type QuarantineItem } from "@/lib/mail-intake/quarantine-repo";

export const metadata = { title: "Требует проверки" };
export const dynamic = "force-dynamic";

/** Очередь писем, которые ИИ не смог разобрать сам (human-in-the-loop). Вынесена
 *  из вкладок «Входящих» отдельной страницей — список почты остаётся плоским. */
export default async function InboxReviewPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let items: QuarantineItem[] = [];
  try {
    items = await listQuarantine();
  } catch {
    // ранний деплой без таблиц — пустое состояние
  }

  return (
    <div className="space-y-5">
      <LiveRefresh />
      <Link
        href="/inbox"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden /> Входящие
      </Link>
      <header className="min-w-0">
        <p className="label-caps">Почта · ИИ</p>
        <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">Требует проверки</h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Письма, которые ИИ не смог разнести автоматически. Проверьте и разберите вручную.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <QuarantineList items={items} />
      </section>
    </div>
  );
}
