import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft, Plus } from "lucide-react";
import { format, toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { directions } from "@/lib/db/schema/directions";
import { counterparties } from "@/lib/db/schema/counterparties";
import { requests } from "@/lib/db/schema/requests";
import { Button } from "@/components/ui/button";
import { DealTabs, isDealTab, type DealTab } from "@/components/trades/DealTabs";
import { dealStatusMeta } from "@/components/trades/dealStatusMeta";
import { dealTypeLabel } from "@/components/trades/dealTypeMeta";
import { directionStatusMeta } from "@/components/directions/statusMeta";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function DealCardPage({ params, searchParams }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { tab } = await searchParams;
  const activeTab: DealTab = isDealTab(tab) ? tab : "application";

  const [deal] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      title: orders.title,
      status: orders.status,
      dealType: orders.dealType,
      channel: orders.channel,
      requestId: orders.requestId,
      notes: orders.notes,
      createdAt: orders.createdAt,
      clientName: counterparties.nameCanonical,
      requestNumber: requests.requestNumber,
    })
    .from(orders)
    .leftJoin(counterparties, eq(orders.clientSuggestedId, counterparties.id))
    .leftJoin(requests, eq(orders.requestId, requests.id))
    .where(eq(orders.id, id))
    .limit(1);

  if (!deal) notFound();

  const dirs = await db
    .select({
      id: directions.id,
      displayName: directions.displayName,
      originRaw: directions.stationOriginRaw,
      destRaw: directions.stationDestRaw,
      wagonCountPlanned: directions.wagonCountPlanned,
      status: directions.status,
    })
    .from(directions)
    .where(eq(directions.orderId, id))
    .orderBy(asc(directions.status), desc(directions.createdAt));

  const meta = dealStatusMeta(deal.status);
  const created = format(toZonedTime(deal.createdAt, "Europe/Moscow"), "d MMMM yyyy, HH:mm", {
    locale: ru,
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/deals"
        className="inline-flex h-11 items-center gap-1 self-start text-sm text-text-tertiary hover:text-text md:h-auto"
      >
        <ArrowLeft className="size-4" aria-hidden /> К сделкам
      </Link>

      <header className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg text-text">
              {deal.title ?? deal.orderNumber ?? `Сделка ${deal.id.slice(0, 8)}`}
            </h1>
            <span className={`inline-flex items-center gap-1.5 text-xs ${meta.tone}`}>
              <span aria-hidden className="text-[0.7em] leading-none">
                ●
              </span>
              {meta.label}
            </span>
          </div>
          <span className="text-sm text-text-tertiary">{created}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>Клиент:</span>
          <span className="text-text">{deal.clientName ?? "не задан"}</span>
          <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-tertiary">
            {dealTypeLabel(deal.dealType)}
          </span>
          <span className="ml-auto font-mono tabular-nums">{dirs.length} напр.</span>
        </div>
      </header>

      <DealTabs basePath={`/deals/${id}`} active={activeTab} />

      {activeTab === "request" && (
        <RequestTab
          requestId={deal.requestId}
          requestNumber={deal.requestNumber}
          channel={deal.channel}
        />
      )}
      {activeTab === "application" && <ApplicationTab dealId={id} directions={dirs} />}
      {activeTab === "execution" && <ExecutionTab />}
    </div>
  );
}

function RequestTab({
  requestId,
  requestNumber,
  channel,
}: {
  requestId: string | null;
  requestNumber: string | null;
  channel: string;
}) {
  if (!requestId) {
    return (
      <TabPlaceholder
        title="Запрос"
        text={
          channel === "proactive"
            ? "Сделка создана вручную (проактивная продажа) — исходного запроса клиента нет."
            : "Исходный запрос клиента появится здесь после конверсии запроса в сделку (Фаза 3)."
        }
      />
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-6">
      <h2 className="label-caps mb-1">Запрос</h2>
      <p className="text-sm text-text-secondary">
        Сделка создана из выигранного запроса{" "}
        <Link href={`/requests/${requestId}`} className="text-accent hover:underline">
          {requestNumber ?? `Запрос ${requestId.slice(0, 8)}`}
        </Link>
        .
      </p>
    </section>
  );
}

type DirRow = {
  id: string;
  displayName: string | null;
  originRaw: string | null;
  destRaw: string | null;
  wagonCountPlanned: number | null;
  status: string;
};

function AddDirectionButton({ dealId }: { dealId: string }) {
  return (
    <Button asChild size="sm">
      <Link href={`/directions/new?orderId=${dealId}`}>
        <Plus />
        Добавить направление
      </Link>
    </Button>
  );
}

function ApplicationTab({ dealId, directions: dirs }: { dealId: string; directions: DirRow[] }) {
  if (dirs.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-1 p-6">
        <h2 className="label-caps mb-1">Заявка</h2>
        <p className="text-sm text-text-secondary">
          Согласованное соглашение: маршруты (направления), щебень и помесячные ставки. Транспортных
          направлений пока нет.
        </p>
        <div className="mt-4">
          <AddDirectionButton dealId={dealId} />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="label-caps">Заявка</h2>
        <AddDirectionButton dealId={dealId} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="label-caps px-4 py-2.5 font-medium">Маршрут</th>
            <th className="label-caps px-4 py-2.5 text-right font-medium">Вагонов</th>
            <th className="label-caps px-4 py-2.5 font-medium">Статус</th>
          </tr>
        </thead>
        <tbody>
          {dirs.map((d) => {
            const m = directionStatusMeta(d.status);
            const route = d.displayName ?? `${d.originRaw ?? "—"} → ${d.destRaw ?? "—"}`;
            return (
              <tr key={d.id} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/directions/${d.id}/edit`}
                    className="text-text transition-colors hover:text-accent"
                  >
                    {route}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right [font-variant-numeric:tabular-nums] text-text-secondary">
                  {d.wagonCountPlanned ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs ${m.tone}`}>
                    <span aria-hidden className="text-[0.7em] leading-none">
                      ●
                    </span>
                    {m.label}
                  </span>
                </td>
              </tr>
            );
          })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ExecutionTab() {
  return (
    <TabPlaceholder
      title="Исполнение"
      text="Живой конвейер вагонов из дислокации: заадресовано → в подходе → на станции → погрузка → в пути → выгружено, с днями под операцией. Появится в Фазе 5."
    />
  );
}

function TabPlaceholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-1 p-6">
      <h2 className="label-caps mb-1">{title}</h2>
      <p className="text-sm text-text-secondary">{text}</p>
    </section>
  );
}
