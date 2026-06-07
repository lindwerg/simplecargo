import { TrainFront } from "lucide-react";
import { format, toZonedTime } from "date-fns-tz";
import { ru } from "date-fns/locale";

import { EmptyState } from "@/components/ui/EmptyState";
import type {
  DirectionExecution,
  ExecutionBucketStat,
  ExecutionWagonRow,
} from "@/lib/execution/repository";
import { bucketMeta, DIST_LABEL } from "./bucketMeta";

interface ExecutionTabProps {
  data: DirectionExecution;
  /** Optional route caption shown above the funnel when a deal has several directions. */
  routeLabel?: string | undefined;
}

const IDLE_WARN_DAYS = 5;
const IDLE_DANGER_DAYS = 10;

// Day-count color escalates with idle time: >10 danger, >5 warn, else neutral.
function daysTone(days: number | null): string {
  if (days == null) return "text-text-tertiary";
  if (days > IDLE_DANGER_DAYS) return "text-danger";
  if (days > IDLE_WARN_DAYS) return "text-warn";
  return "text-text-secondary";
}

function fmtDays(days: number | null): string {
  if (days == null) return "—";
  return `${Math.round(days)} сут`;
}

function fmtSnapshotTs(ts: string | null): string {
  if (!ts) return "—";
  return format(toZonedTime(ts, "Europe/Moscow"), "d MMM, HH:mm", { locale: ru });
}

/**
 * Execution funnel for one direction: bucket cards left→right with counts and
 * avg/max idle days, a distance mini-breakdown for the in-motion buckets, and a
 * per-bucket drill-down wagon table via <details>. Server Component.
 */
export function ExecutionTab({ data, routeLabel }: ExecutionTabProps) {
  if (data.wagonsTotal === 0) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-2">
        {routeLabel && <h3 className="label-caps px-4 pt-3">{routeLabel}</h3>}
        <EmptyState
          icon={TrainFront}
          title="Вагонов пока нет"
          description="Привязанные вагоны появятся здесь, как только начнёт поступать дислокация."
        />
      </section>
    );
  }

  const planned = data.wagonCountPlanned;
  const header =
    planned != null
      ? `${data.wagonsTotal} из ${planned} вагонов`
      : `${data.wagonsTotal} вагонов`;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          {routeLabel && <h3 className="text-text">{routeLabel}</h3>}
          <span className="text-sm tabular-nums text-text-secondary">{header}</span>
        </div>
        <span className="text-xs text-text-tertiary">
          дисла от {fmtSnapshotTs(data.lastSnapshotTs)}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {data.buckets.map((b) => (
          <BucketCard key={b.bucket} stat={b} />
        ))}
      </div>

      <div className="space-y-2">
        {data.buckets
          .filter((b) => b.count > 0)
          .map((b) => (
            <BucketDrilldown
              key={b.bucket}
              stat={b}
              wagons={data.wagons.filter((w) => w.bucket === b.bucket)}
            />
          ))}
      </div>
    </section>
  );
}

function BucketCard({ stat }: { stat: ExecutionBucketStat }) {
  const meta = bucketMeta(stat.bucket);
  const showDist = stat.bucket === "approaching" || stat.bucket === "in_transit";
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <p className={`label-caps ${meta.tone}`}>{meta.label}</p>
      <p className="mt-1 text-xl tabular-nums text-text">{stat.count}</p>
      {stat.count > 0 && (
        <p className="mt-0.5 text-xs text-text-tertiary">
          ср. {fmtDays(stat.avgDays)} · макс {fmtDays(stat.maxDays)}
        </p>
      )}
      {showDist && stat.count > 0 && (
        <dl className="mt-2 grid grid-cols-4 gap-1 text-center text-[0.7rem]">
          {(["le100", "le300", "le500", "gt500"] as const).map((d) => (
            <div key={d}>
              <dt className="text-text-tertiary">{DIST_LABEL[d]}</dt>
              <dd className="tabular-nums text-text-secondary">{stat.distCounts[d]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function BucketDrilldown({
  stat,
  wagons,
}: {
  stat: ExecutionBucketStat;
  wagons: readonly ExecutionWagonRow[];
}) {
  const meta = bucketMeta(stat.bucket);
  return (
    <details className="group rounded-lg border border-border bg-surface-1">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="flex items-center gap-2">
          <span className={`text-[0.7em] leading-none ${meta.tone}`} aria-hidden>
            ●
          </span>
          <span className="text-text">{meta.label}</span>
        </span>
        <span className="tabular-nums text-text-tertiary">{stat.count} ваг.</span>
      </summary>
      <div className="overflow-x-auto border-t border-border-subtle">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <th className="label-caps px-4 py-2 font-medium">№ вагона</th>
              <th className="label-caps px-4 py-2 font-medium">Операция</th>
              <th className="label-caps px-4 py-2 text-right font-medium">Под операцией</th>
              <th className="label-caps px-4 py-2 text-right font-medium">Остаток</th>
              <th className="label-caps px-4 py-2 font-medium">Станция</th>
            </tr>
          </thead>
          <tbody>
            {wagons.map((w) => (
              <tr key={w.wagonNumber} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-2.5 font-mono tabular-nums text-text">
                  {w.wagonNumber}
                  {w.needsReview && (
                    <span className="ml-2 align-middle text-[0.7rem] text-warn" title="Требует проверки">
                      проверить
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-text-secondary">
                  {w.operationName ?? w.operationCode ?? "—"}
                </td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${daysTone(w.daysInOperation)}`}>
                  {fmtDays(w.daysInOperation)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-text-secondary">
                  {w.distRemainingKm != null ? `${w.distRemainingKm} км` : "—"}
                </td>
                <td className="px-4 py-2.5 font-mono tabular-nums text-text-tertiary">
                  {w.stationCurrentEsr ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
