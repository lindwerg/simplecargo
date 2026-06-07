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
import { requestLines, requests } from "@/lib/db/schema/requests";
import { listStoneLines } from "@/lib/trades/stoneRepository";
import { Button } from "@/components/ui/button";
import { DealTabs, isDealTab, type DealTab } from "@/components/trades/DealTabs";
import { dealStatusMeta } from "@/components/trades/dealStatusMeta";
import { dealTypeLabel } from "@/components/trades/dealTypeMeta";
import { StoneSection, type StoneLineView } from "@/components/trades/StoneSection";
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

  const stoneLines = await listStoneLines(id);

  // Source request snapshot for the «Запрос» sub-tab (read-only). Loaded only when the
  // deal was converted from an RFQ (Фаза 3); proactive deals carry no request.
  const requestLineRows = deal.requestId
    ? await db
        .select({
          id: requestLines.id,
          originRaw: requestLines.originRaw,
          destRaw: requestLines.destRaw,
          wagonsRequested: requestLines.wagonsRequested,
          targetRatePerWagon: requestLines.targetRatePerWagon,
          targetRateRaw: requestLines.targetRateRaw,
        })
        .from(requestLines)
        .where(eq(requestLines.requestId, deal.requestId))
        .orderBy(asc(requestLines.sortOrder))
    : [];

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
          clientName={deal.clientName}
          channel={deal.channel}
          lines={requestLineRows}
        />
      )}
      {activeTab === "application" && (
        <ApplicationTab dealId={id} directions={dirs} stoneLines={stoneLines} />
      )}
      {activeTab === "execution" && <ExecutionTab />}
    </div>
  );
}

type RequestLineView = {
  id: string;
  originRaw: string | null;
  destRaw: string | null;
  wagonsRequested: number | null;
  targetRatePerWagon: string | null;
  targetRateRaw: string | null;
};

const RUB = new Intl.NumberFormat("ru-RU");

// Desired (SUGGESTED, D16) rate text for a request line: flat ₽ → raw string → «—».
function desiredRateText(line: RequestLineView): string {
  if (line.targetRatePerWagon != null) {
    const n = Number(line.targetRatePerWagon);
    if (Number.isFinite(n) && n > 0) return `${RUB.format(n)} ₽/ваг`;
  }
  return line.targetRateRaw ?? "—";
}

function RequestTab({
  requestId,
  requestNumber,
  clientName,
  channel,
  lines,
}: {
  requestId: string | null;
  requestNumber: string | null;
  clientName: string | null;
  channel: string;
  lines: RequestLineView[];
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
    <section className="space-y-4 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="label-caps">Исходный запрос</h2>
          <span className="font-mono text-sm text-text">{requestNumber ?? requestId.slice(0, 8)}</span>
        </div>
        <Link href={`/requests/${requestId}`} className="text-sm text-accent hover:underline">
          К запросу →
        </Link>
      </div>

      <p className="text-sm text-text-secondary">
        Клиент: <span className="text-text">{clientName ?? "не задан"}</span>
      </p>

      {lines.length === 0 ? (
        <p className="text-sm text-text-tertiary">В запросе нет строк.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border-subtle text-left">
                <th className="label-caps px-4 py-2.5 font-medium">Маршрут</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Вагонов</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Желаемая ставка</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.id} className="border-b border-border-subtle last:border-0">
                  <td className="px-4 py-3 text-text">
                    {l.originRaw ?? "—"} → {l.destRaw ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right [font-variant-numeric:tabular-nums] text-text-secondary">
                    {l.wagonsRequested ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right [font-variant-numeric:tabular-nums] text-text-secondary">
                    {desiredRateText(l)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-text-tertiary">
        Желаемые ставки клиента — справочно (D16). Подтверждённые ставки задаются на вкладке
        «Заявка».
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

function ApplicationTab({
  dealId,
  directions: dirs,
  stoneLines,
}: {
  dealId: string;
  directions: DirRow[];
  stoneLines: StoneLineView[];
}) {
  return (
    <div className="space-y-6">
      <TransportSection dealId={dealId} directions={dirs} />
      <StoneSection dealId={dealId} lines={stoneLines} />
    </div>
  );
}

function TransportSection({ dealId, directions: dirs }: { dealId: string; directions: DirRow[] }) {
  if (dirs.length === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-1 p-6">
        <div className="flex items-center justify-between">
          <h3 className="label-caps">Перевозка</h3>
          <AddDirectionButton dealId={dealId} />
        </div>
        <p className="mt-2 text-sm text-text-secondary">Транспортных направлений пока нет.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="label-caps">Перевозка</h3>
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
