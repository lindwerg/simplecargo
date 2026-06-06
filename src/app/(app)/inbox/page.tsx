import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Inbox as InboxIcon } from "lucide-react";

import { auth } from "@/lib/auth";
import { LiveRefresh } from "@/components/realtime/LiveRefresh";
import { QuarantineList } from "@/components/requests/QuarantineList";
import { listQuarantine, type QuarantineItem } from "@/lib/mail-intake/quarantine-repo";

export const metadata = { title: "Входящие" };
export const dynamic = "force-dynamic";

/**
 * «Входящие» — очередь на проверку. Всё, что ИИ принял из почты, но не смог
 * разнести автоматически (неуверенные запросы, неизвестные отправители,
 * непривязанные ответы перевозчиков, нераспознанные вложения, сбои обработки),
 * ждёт здесь решения оператора — это страховка human-in-the-loop.
 */
export default async function InboxPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  let items: QuarantineItem[] = [];
  try {
    items = await listQuarantine();
  } catch {
    // таблицы может не быть на самом раннем деплое — пустое состояние
  }

  return (
    <div className="space-y-[var(--space-section)]">
      <LiveRefresh />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">Почта · ИИ</p>
          <h1 className="mt-1 flex items-center gap-2 break-words text-xl font-semibold tracking-tight text-text">
            <InboxIcon className="size-5 text-text-tertiary" aria-hidden />
            Входящие
          </h1>
          <p className="mt-1 max-w-prose text-sm text-text-secondary">
            Письма, которые ИИ принял, но не смог разнести сам. Подтвердите или отклоните —
            остальное система делает автоматически.
          </p>
        </div>
        {items.length > 0 && (
          <span className="rounded-pill bg-warn-quiet px-2.5 py-1 text-sm font-medium text-warn">
            {items.length} на проверке
          </span>
        )}
      </header>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <QuarantineList items={items} />
      </section>
    </div>
  );
}
