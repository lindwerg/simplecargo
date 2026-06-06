import { notFound } from "next/navigation";

import { KpDocument } from "@/components/requests/KpDocument";
import { KpPrintBar } from "@/components/requests/KpPrintBar";
import { buildProposalKp } from "@/lib/documents/proposalKp";
import { getRequest, markLinesKpIssued, RequestError } from "@/lib/requests/repository";
import "@/components/requests/kp.css";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }>; searchParams: Promise<{ lines?: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RequestKpPage({ params, searchParams }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { lines: linesParam } = await searchParams;

  let data: Awaited<ReturnType<typeof getRequest>>;
  try {
    data = await getRequest(id);
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) notFound();
    throw e;
  }

  // Scope to selected directions (?lines=id1,id2). Scope-guard: keep only ids that
  // actually belong to THIS request (rejects injected foreign lineIds). Empty or
  // all-invalid → fall back to every line (back-compat with the old whole-КП link).
  const requested = new Set((linesParam ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  const scoped = data.lines.filter((l) => requested.has(l.id));
  const selectedLines = scoped.length > 0 ? scoped : data.lines;

  // Stamp "КП по этому плечу выпущено" — guards against silently double-issuing.
  await markLinesKpIssued(id, selectedLines.map((l) => l.id));

  // This page is allowed to be non-deterministic; only the pure builder avoids the clock.
  const todayIso = new Date().toISOString();

  const model = buildProposalKp({
    requestNumber: data.requestNumber,
    clientName: data.clientName ?? data.clientRaw,
    lines: selectedLines,
    headerWagonType: data.wagonType,
    todayIso,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="kp-print-hidden mx-auto w-full max-w-[210mm]">
        <KpPrintBar id={id} />
      </div>
      <div className="kp-page">
        <KpDocument model={model} />
      </div>
    </div>
  );
}
