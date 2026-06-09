import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { ArrowLeft, Mail, Plus } from "lucide-react";
import { format, toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

import { db } from "@/lib/db/client";
import { orders } from "@/lib/db/schema/orders";
import { directions } from "@/lib/db/schema/directions";
import { counterparties } from "@/lib/db/schema/counterparties";
import { requestLines, requests } from "@/lib/db/schema/requests";
import { listStoneLines } from "@/lib/trades/stoneRepository";
import { listMonthlyRates } from "@/lib/trades/monthlyRateRepository";
import { Button } from "@/components/ui/button";
import { dealStatusMeta } from "@/components/trades/dealStatusMeta";
import { dealTypeLabel } from "@/components/trades/dealTypeMeta";
import { stageForStatus } from "@/components/trades/dealStageMeta";
import { RequestWorksheet } from "@/components/trades/RequestWorksheet";
import { RequestLifecyclePanel } from "@/components/trades/RequestLifecyclePanel";
import type { CargoType } from "@/components/trades/requestTypes";
import { StoneSection, type StoneLineView } from "@/components/trades/StoneSection";
import { MonthlyRateGrid, type MonthlyRateView } from "@/components/trades/MonthlyRateGrid";
import { directionStatusMeta } from "@/components/directions/statusMeta";
import { ExecutionTab } from "@/components/execution/ExecutionTab";
import { DirectionPnl } from "@/components/finances/DirectionPnl";
import { getDirectionExecution } from "@/lib/execution/repository";
import { getDirectionPnl } from "@/lib/finances/repository";
import { listEmailsForDirections, type DirectionEmail } from "@/lib/mail-intake/inbox-repo";
import { KIND_CHIP } from "@/components/inbox/inbox-tabs";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = {
  params: Promise<{ id: string }>;
};

export default async function DealCardPage({ params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [deal] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      title: orders.title,
      status: orders.status,
      quoteStatus: orders.quoteStatus,
      guNumber: orders.guNumber,
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

  // Карточка показывает ТОЛЬКО текущую стадию воронки — без вкладок-переключателей.
  // «Заявка» и «Исполнение» появляются сами, когда сделка туда дойдёт (status меняется):
  // draft→Запрос, confirmed→Заявка, active/completed→Исполнение, cancelled(архив)→Запрос.
  const stage = stageForStatus(deal.status) ?? "request";

  const dirRows = await db
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

  // Per-month rates for each direction (Фаза 4). Parallel reads — directions are few.
  const ratesByDirection = await Promise.all(
    dirRows.map((d) => listMonthlyRates(d.id)),
  );
  const dirs: DirRow[] = dirRows.map((d, i) => ({
    ...d,
    monthlyRates: ratesByDirection[i].map((r) => ({
      id: r.id,
      effectiveMonth: r.effectiveMonth,
      rateClient: r.rateClient,
      rateOwner: r.rateOwner,
      status: r.status,
    })),
  }));

  const stoneLines = await listStoneLines(id);

  // Письма, привязанные к направлениям этой сделки (стык со «Входящими»).
  const linkedEmails = await listEmailsForDirections(dirRows.map((d) => d.id));
  const emailsByDir: Record<string, DirectionEmail[]> = {};
  for (const e of linkedEmails) {
    if (!e.directionId) continue;
    (emailsByDir[e.directionId] ??= []).push(e);
  }

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

  // Префилл рабочей карточки «Запрос»: первичное направление (старейшее) + первичная щебёночная
  // линия. Так карточка показывает уже введённое (непрерывность Запрос↔Заявка). Имена контрагентов
  // тянем через alias-джоины counterparties (клиент/собственник).
  const clientCp = alias(counterparties, "client_cp");
  const ownerCp = alias(counterparties, "owner_cp");
  const [primaryDir] = await db
    .select({
      originRaw: directions.stationOriginRaw,
      originEsr: directions.stationOriginEsr,
      destRaw: directions.stationDestRaw,
      destEsr: directions.stationDestEsr,
      rateClient: directions.rateClient,
      rateOwner: directions.rateOwner,
      wagonCountPlanned: directions.wagonCountPlanned,
      clientCounterpartyId: directions.clientCounterpartyId,
      clientName: clientCp.nameCanonical,
      ownerCounterpartyId: directions.ownerCounterpartyId,
      ownerName: ownerCp.nameCanonical,
    })
    .from(directions)
    .leftJoin(clientCp, eq(directions.clientCounterpartyId, clientCp.id))
    .leftJoin(ownerCp, eq(directions.ownerCounterpartyId, ownerCp.id))
    .where(eq(directions.orderId, id))
    .orderBy(asc(directions.createdAt))
    .limit(1);

  const primaryStone = stoneLines[0];
  const firstReqLine = requestLineRows[0];
  const cargoType: CargoType =
    (deal.dealType as CargoType | null) ??
    (primaryDir && primaryStone
      ? "stone_with_transport"
      : primaryStone
        ? "stone_only"
        : "wagons_only");

  const worksheetInitial = {
    cargoType,
    origin: primaryDir
      ? { raw: primaryDir.originRaw ?? "", esr: primaryDir.originEsr }
      : firstReqLine
        ? { raw: firstReqLine.originRaw ?? "", esr: null }
        : null,
    dest: primaryDir
      ? { raw: primaryDir.destRaw ?? "", esr: primaryDir.destEsr }
      : firstReqLine
        ? { raw: firstReqLine.destRaw ?? "", esr: null }
        : null,
    rateClient: primaryDir?.rateClient ?? null,
    rateOwner: primaryDir?.rateOwner ?? null,
    wagonCount: primaryDir?.wagonCountPlanned ?? null,
    priceSale: primaryStone?.priceSale ?? null,
    pricePurchase: primaryStone?.pricePurchase ?? null,
    tonnage: primaryStone?.tonnage ?? null,
    fraction: primaryStone?.fraction ?? null,
    client: primaryDir?.clientCounterpartyId
      ? { id: primaryDir.clientCounterpartyId, name: primaryDir.clientName }
      : null,
    owner: primaryDir?.ownerCounterpartyId
      ? { id: primaryDir.ownerCounterpartyId, name: primaryDir.ownerName }
      : null,
    quarry: primaryStone?.quarrySupplierId
      ? { id: primaryStone.quarrySupplierId, name: primaryStone.quarryName }
      : null,
  };

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

      {stage === "request" && (
        <RequestWorksheet
          dealId={id}
          status={deal.status}
          quoteStatus={deal.quoteStatus}
          guNumber={deal.guNumber}
          dealType={(deal.dealType as CargoType | null) ?? null}
          clientName={deal.clientName}
          initial={worksheetInitial}
        />
      )}
      {stage === "application" && (
        <ApplicationTab dealId={id} directions={dirs} stoneLines={stoneLines} emailsByDir={emailsByDir} />
      )}
      {stage === "execution" && <ExecutionPanel directions={dirs} />}
      {/* Лайфцикл доступен на всех стадиях (на «Запросе» панель живёт внутри воркшита):
          с «Заявки» — дать ГУ/в архив, с «Исполнения» — завершить сделку. */}
      {stage !== "request" && <RequestLifecyclePanel dealId={id} status={deal.status} />}
    </div>
  );
}

// «Исполнение»: один конвейер дислокации на каждое транспортное направление сделки,
// рядом — компактный план/факт за всё время по этому направлению. Server Component.
async function ExecutionPanel({ directions: dirs }: { directions: DirRow[] }) {
  if (dirs.length === 0) {
    return (
      <TabPlaceholder
        title="Исполнение"
        text="У сделки пока нет транспортных направлений — добавьте направление на вкладке «Заявка», чтобы видеть конвейер вагонов."
      />
    );
  }

  // Independent reads per direction — fetch in parallel (directions are few).
  const panels = await Promise.all(
    dirs.map(async (d) => {
      const [execution, pnl] = await Promise.all([
        getDirectionExecution(d.id),
        getDirectionPnl({ directionId: d.id, limit: 1 }),
      ]);
      const route = d.displayName ?? `${d.originRaw ?? "—"} → ${d.destRaw ?? "—"}`;
      return { id: d.id, route, execution, pnl };
    }),
  );

  return (
    <div className="space-y-8">
      {panels.map((p) => (
        <div key={p.id} className="space-y-4">
          <ExecutionTab data={p.execution} routeLabel={dirs.length > 1 ? p.route : undefined} />
          {p.pnl.length > 0 && (
            <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1">
              <h3 className="label-caps px-4 pt-3">План / факт маржи</h3>
              <DirectionPnl rows={p.pnl} />
            </section>
          )}
        </div>
      ))}
    </div>
  );
}

type DirRow = {
  id: string;
  displayName: string | null;
  originRaw: string | null;
  destRaw: string | null;
  wagonCountPlanned: number | null;
  status: string;
  monthlyRates: MonthlyRateView[];
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
  emailsByDir,
}: {
  dealId: string;
  directions: DirRow[];
  stoneLines: StoneLineView[];
  emailsByDir: Record<string, DirectionEmail[]>;
}) {
  return (
    <div className="space-y-6">
      <TransportSection dealId={dealId} directions={dirs} emailsByDir={emailsByDir} />
      <StoneSection dealId={dealId} lines={stoneLines} />
    </div>
  );
}

function TransportSection({
  dealId,
  directions: dirs,
  emailsByDir,
}: {
  dealId: string;
  directions: DirRow[];
  emailsByDir: Record<string, DirectionEmail[]>;
}) {
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
      <div className="space-y-3">
        {dirs.map((d) => {
          const m = directionStatusMeta(d.status);
          const route = d.displayName ?? `${d.originRaw ?? "—"} → ${d.destRaw ?? "—"}`;
          return (
            <article
              key={d.id}
              className="space-y-3 rounded-lg border border-border bg-surface-1 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/directions/${d.id}/edit`}
                  className="text-text transition-colors hover:text-accent"
                >
                  {route}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-sm tabular-nums text-text-secondary">
                    {d.wagonCountPlanned ?? "—"} ваг.
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs ${m.tone}`}>
                    <span aria-hidden className="text-[0.7em] leading-none">
                      ●
                    </span>
                    {m.label}
                  </span>
                </div>
              </div>
              <MonthlyRateGrid directionId={d.id} rates={d.monthlyRates} />
              <DirectionEmails emails={emailsByDir[d.id] ?? []} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Письма, привязанные к направлению (из «Входящих»). Компактный список-ссылки.
function DirectionEmails({ emails }: { emails: DirectionEmail[] }) {
  if (emails.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-border-subtle pt-3">
      <p className="label-caps">Письма ({emails.length})</p>
      <ul className="flex flex-col gap-1">
        {emails.map((e) => {
          const chip = e.kind ? KIND_CHIP[e.kind] : undefined;
          const subject = e.subject && e.subject !== "email" ? e.subject : "(без темы)";
          return (
            <li key={e.id}>
              <Link
                href={`/inbox/${e.id}`}
                className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text"
              >
                <Mail className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
                {chip && (
                  <span className={`rounded-pill px-1.5 py-0.5 text-2xs font-medium ${chip.cls}`}>
                    {chip.label}
                  </span>
                )}
                <span className="truncate" title={subject}>
                  {subject}
                </span>
                {e.receivedAt && (
                  <time dateTime={e.receivedAt} className="ml-auto shrink-0 text-xs text-text-tertiary">
                    {new Date(e.receivedAt).toLocaleDateString("ru-RU")}
                  </time>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
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
