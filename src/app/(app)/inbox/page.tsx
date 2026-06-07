import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Inbox as InboxIcon } from "lucide-react";

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
    <div className="space-y-6">
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
