import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { format, toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

import { Money } from "@/components/ui/Money";
import { StatusPill, type RequestStatus } from "@/components/ui/StatusPill";
import { RequestStatusActions } from "@/components/requests/RequestStatusActions";
import { RequestOutputs } from "@/components/requests/RequestOutputs";
import type { OwnerLetterRoute } from "@/lib/documents/ownerLetter";
import { formatRateExpression, type RateKind } from "@/lib/pricing/rate-expression";
import { getRequest, RequestError } from "@/lib/requests/repository";

const TARIFF_KINDS = new Set<RateKind>(["tariff_indicative", "tariff_plus_markup"]);
const RUB = new Intl.NumberFormat("ru-RU");

type RequestLine = Awaited<ReturnType<typeof getRequest>>["lines"][number];

/** КП/owner-letter rate text for a line: tariff expression → flat ₽ → raw → null. */
function lineRateText(l: RequestLine): string | null {
  if (l.targetRateKind && TARIFF_KINDS.has(l.targetRateKind as RateKind)) {
    return formatRateExpression({
      kind: l.targetRateKind as RateKind,
      markupPct: l.targetRateMarkupPct != null ? Number(l.targetRateMarkupPct) : null,
    });
  }
  if (l.targetRatePerWagon != null) {
    const n = Number(l.targetRatePerWagon);
    if (Number.isFinite(n) && n > 0) return `${RUB.format(n)} ₽/ваг`;
  }
  return l.targetRateRaw ?? null;
}

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RequestDetailPage({ params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  let data: Awaited<ReturnType<typeof getRequest>>;
  try {
    data = await getRequest(id);
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) notFound();
    throw e;
  }

  const status = data.status as RequestStatus;
  const isTemp = !data.clientSuggestedId;
  const clientLabel = data.clientName ?? data.clientRaw ?? "клиент не задан";
  const created = format(toZonedTime(data.createdAt, "Europe/Moscow"), "d MMMM yyyy, HH:mm", { locale: ru });
  const totalWagons = data.lines.reduce((s, l) => s + (l.wagonsRequested ?? 0), 0);

  const fmtDay = (d: Date | null): string | null =>
    d ? format(toZonedTime(d, "Europe/Moscow"), "dd.MM.yyyy") : null;

  const ownerRoutes: OwnerLetterRoute[] = data.lines.map((l) => ({
    originName: l.originRaw,
    originRoad: l.originRoadRaw,
    destName: l.destRaw,
    destRoad: l.destRoadRaw,
    wagonsCount: l.wagonsRequested,
    cargoName: l.cargoName,
    rateText: lineRateText(l),
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/requests/actual" className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> К запросам
      </Link>

      <header className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-lg text-text">{data.requestNumber ?? "Запрос"}</h1>
            <StatusPill status={status} />
          </div>
          <span className="text-sm text-text-tertiary">{created}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <span>Клиент:</span>
          <span className="text-text">{clientLabel}</span>
          {isTemp && (
            <span className="rounded-pill bg-warn-quiet px-2 py-0.5 text-2xs font-medium text-warn">временный</span>
          )}
          <span className="ml-auto font-mono tabular-nums">
            {data.lines.length} напр. · {totalWagons} ваг
          </span>
        </div>
      </header>

      <RequestStatusActions id={id} status={status} isTemp={isTemp} />

      <RequestOutputs
        id={id}
        clientName={data.clientName ?? data.clientRaw}
        headerWagonType={data.wagonType}
        periodFrom={fmtDay(data.periodFrom)}
        periodTo={fmtDay(data.periodTo)}
        notes={data.notes}
        routes={ownerRoutes}
      />

      <section className="flex flex-col gap-2">
        <h2 className="label-caps">Направления</h2>
        <div className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-2">
          {data.lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5" style={{ fontWeight: "var(--weight-semibold)" }}>
                  <span className="truncate text-text">{l.originRaw}</span>
                  <span aria-hidden className="text-accent">→</span>
                  <span className="truncate text-text">{l.destRaw}</span>
                </div>
                <p className="text-xs text-text-tertiary">
                  {[l.originRoadRaw, l.destRoadRaw].filter(Boolean).join(" → ") || "дороги —"}
                  {l.cargoName ? ` · ${l.cargoName}` : ""}
                </p>
              </div>
              <span className="font-mono text-md tabular-nums text-text">{l.wagonsRequested} ваг</span>
              <span className="min-w-[7rem] text-right text-sm">
                {l.targetRatePerWagon != null ? (
                  <Money value={Number(l.targetRatePerWagon)} form="per-wagon" />
                ) : l.targetRateRaw ? (
                  <span className="font-mono tabular-nums text-text-secondary">{l.targetRateRaw}</span>
                ) : (
                  <span className="text-text-disabled">ставка —</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </section>

      {data.notes && (
        <section className="flex flex-col gap-1">
          <h2 className="label-caps">Примечание</h2>
          <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm text-text-secondary">
            {data.notes}
          </p>
        </section>
      )}
    </div>
  );
}
