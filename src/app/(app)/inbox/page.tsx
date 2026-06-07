import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Inbox as InboxIcon } from "lucide-react";

import { auth } from "@/lib/auth";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { QuarantineList } from "@/components/requests/QuarantineList";
import { EmailList } from "@/components/inbox/EmailList";
import { InboxTabs, type TabCount } from "@/components/inbox/InboxTabs";
import { isInboxTabKey, tabDef, type InboxTabKey } from "@/components/inbox/inbox-tabs";
import { listQuarantine, countUnresolvedQuarantine, type QuarantineItem } from "@/lib/mail-intake/quarantine-repo";
import { listInbox, countInboxByKind, type InboxItem } from "@/lib/mail-intake/inbox-repo";

export const metadata = { title: "Входящие" };
export const dynamic = "force-dynamic";

/**
 * «Входящие» — почта по типам. ИИ принимает письма из mail.ru, классифицирует и
 * раскладывает по вкладкам (Запросы / Ответы / Счета / Дислокация / ГУ-12 /
 * Документы / Претензии / Прочее). Отдельная вкладка «Требует проверки» — очередь
 * human-in-the-loop для писем, которые ИИ не смог разнести сам. Это фундамент для
 * блоков «Финансы» и «Сделки».
 */
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { tab: tabParam } = await searchParams;
  const active: InboxTabKey = isInboxTabKey(tabParam) ? tabParam : "all";
  const def = tabDef(active);

  // Счётчики на вкладки (всего / новых) — одним запросом + очередь карантина.
  const counts: Record<string, TabCount | undefined> = {};
  try {
    const [byKind, review] = await Promise.all([countInboxByKind(), countUnresolvedQuarantine()]);
    for (const [k, v] of Object.entries(byKind)) counts[k] = v;
    counts.review = { total: review, unread: review };
  } catch {
    // ранний деплой без таблиц — без счётчиков
  }

  // Содержимое активной вкладки.
  let reviewItems: QuarantineItem[] = [];
  let emails: InboxItem[] = [];
  let nextCursor: string | null = null;
  try {
    if (active === "review") {
      reviewItems = await listQuarantine();
    } else {
      const page = await listInbox({ tab: active });
      emails = page.items;
      nextCursor = page.nextCursor;
    }
  } catch {
    // пустое состояние при отсутствии таблиц
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
        <p className="mt-1 max-w-prose text-sm text-text-secondary">{def.blurb}</p>
      </header>

      <InboxTabs basePath="/inbox" active={active} counts={counts} />

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        {active === "review" ? (
          <QuarantineList items={reviewItems} />
        ) : (
          <EmailList
            key={active}
            tab={active}
            emptyText={def.empty}
            initialItems={emails}
            initialCursor={nextCursor}
          />
        )}
      </section>
    </div>
  );
}
