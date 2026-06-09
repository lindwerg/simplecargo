import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { format, toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

import { StatusPill, type RequestStatus } from "@/components/ui/StatusPill";
import { RequestStatusActions } from "@/components/requests/RequestStatusActions";
import { ConvertToTradeButton, type ConvertLine } from "@/components/trades/ConvertToTradeButton";
import { hasTransportShape } from "@/lib/trades/conversionScenario";
import { RequestWorklist, type WorklistLine } from "@/components/requests/RequestWorklist";
import { CarrierOutreach, type OutreachLine } from "@/components/requests/CarrierOutreach";
import { OwnerQuotesPanel } from "@/components/requests/OwnerQuotesPanel";
import { ReviewConfirmBanner } from "@/components/requests/ReviewConfirmBanner";
import { formatRateExpression, type RateKind } from "@/lib/pricing/rate-expression";
import { listOwnerQuotesForRequest } from "@/lib/rfq/quotes";
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

  // результат опроса перевозчиков (request_owner_quotes) — блок «Ставки перевозчиков»
  const ownerQuotes = await listOwnerQuotesForRequest(id);

  const status = data.status as RequestStatus;
  const isTemp = !data.clientSuggestedId;
  const clientLabel = data.clientName ?? data.clientRaw ?? "клиент не задан";
  const created = format(toZonedTime(data.createdAt, "Europe/Moscow"), "d MMMM yyyy, HH:mm", { locale: ru });
  const totalWagons = data.lines.reduce((s, l) => s + (l.wagonsRequested ?? 0), 0);

  const fmtDay = (d: Date | null): string | null =>
    d ? format(toZonedTime(d, "Europe/Moscow"), "dd.MM.yyyy") : null;

  // Conversion is offered once the request is won (header or any line) and not yet
  // converted into a deal. converted_order_id closes the loop (Фаза 3).
  // Only WON legs are convertible. Declined siblings (lost/no_bid/expired/cancelled)
  // must never reach the dialog/payload — the per-line lifecycle keeps them out.
  const wonLines = data.lines.filter((l) => l.status === "won");
  const canConvert = !data.convertedOrderId && wonLines.length > 0;
  const convertLines: ConvertLine[] = wonLines.map((l) => ({
    id: l.id,
    label: `${l.originRaw} → ${l.destRaw}${l.wagonsRequested ? ` (${l.wagonsRequested} ваг)` : ""}`,
    suggested: hasTransportShape({
      id: l.id,
      originRaw: l.originRaw,
      destRaw: l.destRaw,
      wagonsRequested: l.wagonsRequested,
    })
      ? "transport"
      : "stone",
  }));

  const outreachLines: OutreachLine[] = data.lines.map((l) => ({
    id: l.id,
    label: `${l.originRaw} → ${l.destRaw}${l.wagonsRequested ? ` (${l.wagonsRequested} ваг)` : ""}`,
  }));

  const worklistLines: WorklistLine[] = data.lines.map((l) => ({
    id: l.id,
    status: l.status as RequestStatus,
    originRaw: l.originRaw,
    originRoadRaw: l.originRoadRaw,
    destRaw: l.destRaw,
    destRoadRaw: l.destRoadRaw,
    cargoName: l.cargoName,
    wagonType: l.wagonType ?? data.wagonType,
    wagonsRequested: l.wagonsRequested,
    targetRatePerWagon: l.targetRatePerWagon != null ? Number(l.targetRatePerWagon) : null,
    targetRateRaw: l.targetRateRaw,
    rateText: lineRateText(l),
    lossReason: l.lossReason,
    kpIssued: l.kpIssuedAt != null,
  }));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link href="/requests" className="inline-flex h-11 items-center gap-1 self-start text-sm text-text-tertiary hover:text-text md:h-auto">
        <ArrowLeft className="size-4" aria-hidden /> К запросам
      </Link>

      {data.intakeSource === "ai_email" && data.needsReview && (
        <ReviewConfirmBanner requestId={data.id} />
      )}

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

      {canConvert && <ConvertToTradeButton requestId={id} lines={convertLines} />}

      {data.convertedOrderId && (
        <Link
          href={`/deals/${data.convertedOrderId}`}
          className="inline-flex h-11 items-center gap-1 self-start rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text hover:text-accent"
        >
          Открыть сделку →
        </Link>
      )}

      <RequestWorklist
        requestId={id}
        lines={worklistLines}
        letterContext={{
          clientName: data.clientName ?? data.clientRaw,
          wagonTypeLabel: data.wagonType,
          periodFrom: fmtDay(data.periodFrom),
          periodTo: fmtDay(data.periodTo),
          notes: data.notes,
        }}
      />

      <CarrierOutreach requestId={id} lines={outreachLines} />

      <OwnerQuotesPanel quotes={ownerQuotes} />

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
