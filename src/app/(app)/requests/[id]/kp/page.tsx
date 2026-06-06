import { notFound } from "next/navigation";

import { KpDocument } from "@/components/requests/KpDocument";
import { KpPrintBar } from "@/components/requests/KpPrintBar";
import { buildProposalKp } from "@/lib/documents/proposalKp";
import { getRequest, RequestError } from "@/lib/requests/repository";
import "@/components/requests/kp.css";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RequestKpPage({ params }: Ctx) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  let data: Awaited<ReturnType<typeof getRequest>>;
  try {
    data = await getRequest(id);
  } catch (e) {
    if (e instanceof RequestError && e.status === 404) notFound();
    throw e;
  }

  // This page is allowed to be non-deterministic; only the pure builder avoids the clock.
  const todayIso = new Date().toISOString();

  const model = buildProposalKp({
    requestNumber: data.requestNumber,
    clientName: data.clientName ?? data.clientRaw,
    lines: data.lines,
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
