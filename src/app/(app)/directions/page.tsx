import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { FileSpreadsheet, Plus, Waypoints } from "lucide-react";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { directions } from "@/lib/db/schema/directions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { directionStatusMeta } from "@/components/directions/statusMeta";

export const dynamic = "force-dynamic";

// Minimal list (P15-3). The rich card grid + KPIs land in P15-5.
export default async function DirectionsPage() {
  const clientCp = alias(counterparties, "client_cp");
  const ownerCp = alias(counterparties, "owner_cp");

  const rows = await db
    .select({
      id: directions.id,
      displayName: directions.displayName,
      originRaw: directions.stationOriginRaw,
      destRaw: directions.stationDestRaw,
      wagonCountPlanned: directions.wagonCountPlanned,
      status: directions.status,
      clientName: clientCp.nameCanonical,
      ownerName: ownerCp.nameCanonical,
    })
    .from(directions)
    .leftJoin(clientCp, eq(directions.clientCounterpartyId, clientCp.id))
    .leftJoin(ownerCp, eq(directions.ownerCounterpartyId, ownerCp.id))
    .orderBy(asc(directions.status), desc(directions.createdAt));

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">Направления</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Маршрут + стороны + ставки. Активация — после привязки ящика собственника и пересылки
            клиенту.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/directions/pricing">
              <FileSpreadsheet />
              Ставки ПСЦ
            </Link>
          </Button>
          <Button asChild>
            <Link href="/directions/new">
              <Plus />
              Новое направление
            </Link>
          </Button>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface-1">
          <EmptyState
            icon={Waypoints}
            title="Направлений пока нет"
            description="Создайте первое направление — маршрут, стороны и ставки."
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/directions/new">Создать направление</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="label-caps px-4 py-2.5 font-medium">Маршрут</th>
                <th className="label-caps px-4 py-2.5 font-medium">Клиент</th>
                <th className="label-caps px-4 py-2.5 font-medium">Собственник</th>
                <th className="label-caps px-4 py-2.5 text-right font-medium">Вагонов</th>
                <th className="label-caps px-4 py-2.5 font-medium">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = directionStatusMeta(r.status);
                const route = r.displayName ?? `${r.originRaw ?? "—"} → ${r.destRaw ?? "—"}`;
                return (
                  <tr key={r.id} className="border-b border-border-subtle last:border-0">
                    <td className="px-4 py-3">
                      <Link
                        href={`/directions/${r.id}/edit`}
                        className="text-text transition-colors hover:text-accent"
                      >
                        {route}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{r.clientName ?? "—"}</td>
                    <td className="px-4 py-3 text-text-secondary">{r.ownerName ?? "—"}</td>
                    <td className="px-4 py-3 text-right [font-variant-numeric:tabular-nums] text-text-secondary">
                      {r.wagonCountPlanned ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${meta.tone}`}>
                        <span aria-hidden className="text-[0.7em] leading-none">
                          ●
                        </span>
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
