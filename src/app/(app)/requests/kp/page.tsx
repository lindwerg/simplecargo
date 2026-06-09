import { notFound } from "next/navigation";

import { KpDocument } from "@/components/requests/KpDocument";
import { KpPrintBar } from "@/components/requests/KpPrintBar";
import { buildProposalKp } from "@/lib/documents/proposalKp";
import { getDirectionsByIds, markDirectionsKpIssued } from "@/lib/requests/repository";
import "@/components/requests/kp.css";

export const dynamic = "force-dynamic";

// Combined КП across directions selected on the board — possibly from different
// uploads (operator decision: mixing is allowed). When the selection turns out to
// be a single client, that client is named; mixed selections render without a
// single addressee. lineIds come via ?lines=id1,id2.
type Ctx = { searchParams: Promise<{ lines?: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CombinedKpPage({ searchParams }: Ctx) {
  const { lines: linesParam } = await searchParams;
  const ids = [...new Set((linesParam ?? "").split(",").map((s) => s.trim()).filter((s) => UUID_RE.test(s)))];
  if (ids.length === 0) notFound();

  const { lines, clientNames } = await getDirectionsByIds(ids);
  if (lines.length === 0) notFound();

  // Штамп выпуска КП — только первый раз; повторный просмотр дату не перезатирает.
  await markDirectionsKpIssued(lines.map((l) => l.id));

  const todayIso = new Date().toISOString();
  const model = buildProposalKp({
    requestNumber: null,
    clientName: clientNames.length === 1 ? clientNames[0] : null,
    lines,
    headerWagonType: null, // each line already carries its effective wagon type
    todayIso,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="kp-print-hidden mx-auto w-full max-w-[210mm]">
        <KpPrintBar backHref="/requests" backLabel="К запросам" />
      </div>
      <div className="kp-page">
        <KpDocument model={model} />
      </div>
    </div>
  );
}
