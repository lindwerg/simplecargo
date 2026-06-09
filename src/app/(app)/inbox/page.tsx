import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox as InboxIcon, Plus, ShieldAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { EmailList } from "@/components/inbox/EmailList";
import { countUnresolvedQuarantine } from "@/lib/mail-intake/quarantine-repo";
import { listInbox, type InboxItem } from "@/lib/mail-intake/inbox-repo";

export const metadata = { title: "Входящие" };
export const dynamic = "force-dynamic";

/**
 * «Входящие» — плоский список писем как в почте (новые сверху, дата+время, сниппет).
 * ИИ принимает письма из mail.ru и архивирует их; раскладку по типам мы здесь не
 * показываем — оператор видит всю почту сразу и действует из самого письма
 * (создать запрос/заявку, закинуть дислокацию в направление). Письма, которые ИИ
 * не смог разобрать, копятся в очереди «Требует проверки» (ссылка в подзаголовке).
 */
export default async function InboxPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let emails: InboxItem[] = [];
  let nextCursor: string | null = null;
  let reviewCount = 0;
  try {
    const [page, review] = await Promise.all([
      listInbox({ tab: "all" }),
      countUnresolvedQuarantine().catch(() => 0),
    ]);
    emails = page.items;
    nextCursor = page.nextCursor;
    reviewCount = review;
  } catch {
    // ранний деплой без таблиц — пустое состояние
  }

  return (
    <div className="space-y-[var(--space-section)]">
      <LiveRefresh />
      <header className="min-w-0">
        <p className="label-caps">Почта · ИИ</p>
        <h1 className="mt-1 flex items-center gap-2 break-words text-xl font-semibold tracking-tight text-text">
          <InboxIcon className="size-5 text-text-tertiary" aria-hidden />
          Входящие
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Вся почта в одном списке. Откройте письмо, чтобы прочитать его целиком и создать
          из него запрос, заявку или привязать дислокацию к направлению.
          {reviewCount > 0 && (
            <>
              {" "}
              <Link href="/inbox/review" className="text-accent hover:underline">
                Требует проверки: {reviewCount}
              </Link>
            </>
          )}
        </p>
      </header>

      <section aria-label="Действия" className="grid grid-cols-2 gap-3">
        <Link
          href="/deals/new"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-quiet text-accent transition-transform group-hover:scale-105">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Новая сделка</span>
            <span className="block text-xs text-text-tertiary">Создать из письма вручную</span>
          </span>
        </Link>
        <Link
          href="/inbox/review"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary transition-colors group-hover:text-text">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Требует проверки</span>
            <span className="block text-xs text-text-tertiary">Письма, которые ИИ не разобрал</span>
          </span>
        </Link>
      </section>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <EmailList
          tab="all"
          emptyText="Писем пока нет."
          initialItems={emails}
          initialCursor={nextCursor}
        />
      </section>
    </div>
  );
}
