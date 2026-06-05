import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { directions } from "@/lib/db/schema/directions";
import {
  directionClientBindings,
  directionOwnerBindings,
} from "@/lib/db/schema/directionBindings";
import { DirectionForm, type DirectionFormInitial } from "@/components/directions/DirectionForm";
import { BindingsPanel } from "@/components/directions/BindingsPanel";
import { StatusActions } from "@/components/directions/StatusActions";
import { directionStatusMeta } from "@/components/directions/statusMeta";
import type { DirectionStatus } from "@/lib/directions/lifecycle";

export const dynamic = "force-dynamic";

export default async function EditDirectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const rows = await db.select().from(directions).where(eq(directions.id, id)).limit(1);
  const direction = rows[0];
  if (!direction) notFound();

  const ownerCp = alias(counterparties, "owner_cp");
  const clientCp = alias(counterparties, "client_cp");

  const [cps, ownerRows, clientRows] = await Promise.all([
    db
      .select({ id: counterparties.id, name: counterparties.nameCanonical })
      .from(counterparties)
      .orderBy(asc(counterparties.nameCanonical)),
    db
      .select({
        id: directionOwnerBindings.id,
        ownerName: ownerCp.nameCanonical,
        inboundMailbox: directionOwnerBindings.inboundMailbox,
        status: directionOwnerBindings.status,
      })
      .from(directionOwnerBindings)
      .leftJoin(ownerCp, eq(directionOwnerBindings.ownerId, ownerCp.id))
      .where(eq(directionOwnerBindings.directionId, id)),
    db
      .select({
        id: directionClientBindings.id,
        clientName: clientCp.nameCanonical,
        forwardToEmail: directionClientBindings.forwardToEmail,
        status: directionClientBindings.status,
      })
      .from(directionClientBindings)
      .leftJoin(clientCp, eq(directionClientBindings.clientId, clientCp.id))
      .where(eq(directionClientBindings.directionId, id)),
  ]);

  const initial: DirectionFormInitial = {
    displayName: direction.displayName ?? "",
    stationOriginRaw: direction.stationOriginRaw ?? "",
    stationDestRaw: direction.stationDestRaw ?? "",
    cargoName: direction.cargoName ?? "",
    wagonCountPlanned: direction.wagonCountPlanned?.toString() ?? "",
    tonnagePerWagon: direction.tonnagePerWagon ?? "",
    rateModel: direction.rateModel === "lump_sum" ? "lump_sum" : "per_wagon_trip",
    rateClient: direction.rateClient ?? "",
    rateOwner: direction.rateOwner ?? "",
    clientCounterpartyId: direction.clientCounterpartyId,
    ownerCounterpartyId: direction.ownerCounterpartyId,
    paymentTermsRaw: direction.paymentTermsRaw ?? "",
  };

  const status = direction.status as DirectionStatus;
  const meta = directionStatusMeta(status);
  const editable = status === "draft" || status === "open";

  return (
    <div className="mx-auto max-w-3xl space-y-[var(--space-section)]">
      <header>
        <Link
          href="/directions"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Направления
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-text">
            {direction.displayName ?? "Направление"}
          </h1>
          <span className={`inline-flex items-center gap-1.5 text-sm ${meta.tone}`}>
            <span aria-hidden className="text-[0.7em] leading-none">
              ●
            </span>
            {meta.label}
          </span>
        </div>
      </header>

      <section className="space-y-3 rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="label-caps">Статус</h2>
        <StatusActions directionId={id} status={status} />
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="label-caps">Привязки</h2>
        <BindingsPanel
          directionId={id}
          counterparties={cps}
          ownerBindings={ownerRows}
          clientBindings={clientRows}
        />
      </section>

      {editable ? (
        <DirectionForm counterparties={cps} initial={initial} directionId={id} />
      ) : (
        <p className="text-sm text-text-tertiary">
          Поля направления редактируются только в статусах «черновик» и «открыто».
        </p>
      )}
    </div>
  );
}
