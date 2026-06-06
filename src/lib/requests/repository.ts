import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { requestLines, requests } from "@/lib/db/schema/requests";
import {
  canTransition,
  canTransitionLine,
  rollupRequestStatus,
  validateTransitionMeta,
  type RequestStatus,
} from "./lifecycle";
import type { DirectionCardView } from "./grouping";
import type {
  LineTransitionInput,
  LinkClientInput,
  RequestCreateInput,
  RequestListFilter,
  RequestTransitionInput,
  RequestUpdateInput,
} from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Domain error mapped to an HTTP status by route handlers (parallel to DirectionError).
export class RequestError extends Error {
  constructor(
    public readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

const ACTIVE = ["new", "sourcing", "quoted"] as const;
const ARCHIVE = ["won", "lost", "no_bid", "expired", "cancelled"] as const;

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numStr(n: number | undefined): string | null {
  return n === undefined ? null : String(n);
}

// find-or-create counterparty by canonical name (mirrors pricing/directions idiom).
async function resolveCounterpartyId(
  tx: Tx,
  input: LinkClientInput["counterparty"],
): Promise<string> {
  if ("id" in input) return input.id;
  const name = input.name.trim();
  const existing = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.nameCanonical, name))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const created = await tx
    .insert(counterparties)
    .values({ nameCanonical: name, inn: input.inn, roles: ["client"] })
    .returning({ id: counterparties.id });
  return created[0].id;
}

async function nextRequestNumber(tx: Tx): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(requests)
    .where(sql`date_part('year', ${requests.createdAt}) = ${year}`);
  const seq = (rows[0]?.n ?? 0) + 1;
  return `R-${year}-${String(seq).padStart(4, "0")}`;
}

async function loadRequest(tx: Tx, id: string) {
  const rows = await tx.select().from(requests).where(eq(requests.id, id)).limit(1);
  if (!rows[0]) throw new RequestError(404, "Запрос не найден");
  return rows[0];
}

// ── createRequestWithLines — one client intake: header + N route lines ───────
export async function createRequestWithLines(
  input: RequestCreateInput,
  userId: string,
): Promise<{ id: string; requestNumber: string }> {
  return db.transaction(async (tx) => {
    const requestNumber = await nextRequestNumber(tx);
    const inserted = await tx
      .insert(requests)
      .values({
        requestNumber,
        clientSuggestedId: input.clientSuggestedId ?? null,
        clientRaw: input.clientRaw ?? null,
        status: "new",
        channel: input.channel,
        intakeSource: input.intakeSource ?? "manual",
        // AI-email intake defaults to needs-review unless caller says otherwise;
        // manual intake is reviewed-by-construction.
        needsReview: input.needsReview ?? input.intakeSource === "ai_email",
        wagonType: input.wagonType ?? "ПВ",
        cargoName: input.cargoName ?? null,
        periodFrom: toDate(input.periodFrom),
        periodTo: toDate(input.periodTo),
        receivedAt: toDate(input.receivedAt),
        validUntil: toDate(input.validUntil),
        sourceRef: input.sourceRef ?? null,
        notes: input.notes ?? null,
        createdBy: userId,
      })
      .returning({ id: requests.id });

    const requestId = inserted[0].id;

    await tx.insert(requestLines).values(
      input.lines.map((line, i) => ({
        requestId,
        sortOrder: line.sortOrder ?? i,
        originRaw: line.originRaw,
        originRoadRaw: line.originRoadRaw ?? null,
        destRaw: line.destRaw,
        destRoadRaw: line.destRoadRaw ?? null,
        originEsr: line.originEsr ?? null,
        destEsr: line.destEsr ?? null,
        cargoName: line.cargoName ?? null,
        etsngCode: line.etsngCode ?? null,
        wagonsRequested: line.wagonsRequested,
        tonnagePerWagon: numStr(line.tonnagePerWagon),
        targetRatePerWagon: numStr(line.targetRatePerWagon),
        targetRateRaw: line.targetRateRaw ?? null,
        wagonType: line.wagonType ?? null,
        targetRateKind: line.targetRateKind ?? null,
        targetRateMarkupPct: numStr(line.targetRateMarkupPct),
        targetTariffClass: line.targetTariffClass ?? null,
        targetTariffRef: line.targetTariffRef ?? null,
      })),
    );

    return { id: requestId, requestNumber };
  });
}

// ── list direction-cards — one card per request_line (the board unit) ────────
// Bucket is now keyed off the DIRECTION's status (request_lines.status), so a
// withdrawn leg leaves the active board while its active siblings stay. wagonType
// falls back to the request header when a line has no per-line override.
export async function listDirectionCards(filter: RequestListFilter): Promise<DirectionCardView[]> {
  const statusSet = filter.bucket === "active" ? ACTIVE : ARCHIVE;

  const conditions = [
    inArray(requestLines.status, statusSet as unknown as string[]),
    filter.clientId ? eq(requests.clientSuggestedId, filter.clientId) : undefined,
    filter.originRaw ? sql`${requestLines.originRaw} ILIKE ${"%" + filter.originRaw + "%"}` : undefined,
    filter.roadRaw ? sql`upper(${requestLines.originRoadRaw}) = upper(${filter.roadRaw})` : undefined,
  ].filter(Boolean) as ReturnType<typeof eq>[];

  const rows = await db
    .select({
      lineId: requestLines.id,
      requestId: requests.id,
      requestNumber: requests.requestNumber,
      status: requestLines.status,
      lossReason: requestLines.lossReason,
      kpIssuedAt: requestLines.kpIssuedAt,
      clientSuggestedId: requests.clientSuggestedId,
      clientRaw: requests.clientRaw,
      clientName: counterparties.nameCanonical,
      originRaw: requestLines.originRaw,
      originRoadRaw: requestLines.originRoadRaw,
      destRaw: requestLines.destRaw,
      destRoadRaw: requestLines.destRoadRaw,
      cargoName: requestLines.cargoName,
      wagonType: sql<string>`COALESCE(${requestLines.wagonType}, ${requests.wagonType})`,
      wagonsRequested: requestLines.wagonsRequested,
      tonnagePerWagon: requestLines.tonnagePerWagon,
      targetRatePerWagon: requestLines.targetRatePerWagon,
      targetRateRaw: requestLines.targetRateRaw,
      createdAt: requests.createdAt,
      validUntil: requests.validUntil,
    })
    .from(requestLines)
    .innerJoin(requests, eq(requestLines.requestId, requests.id))
    .leftJoin(counterparties, eq(counterparties.id, requests.clientSuggestedId))
    .where(and(...conditions))
    .orderBy(desc(requests.createdAt), asc(requestLines.sortOrder))
    .limit(filter.pageSize * 20)
    .offset((filter.page - 1) * filter.pageSize * 20);

  return rows.map((r) => ({
    ...r,
    tonnagePerWagon: r.tonnagePerWagon === null ? null : Number(r.tonnagePerWagon),
    targetRatePerWagon: r.targetRatePerWagon === null ? null : Number(r.targetRatePerWagon),
  }));
}

// ── board counts for the menu landing ────────────────────────────────────────
export async function getBoardCounts(): Promise<{
  activeRequests: number;
  activeWagons: number;
  archiveRequests: number;
}> {
  // A request is "active" when ANY of its directions is active. Counts derive
  // from request_lines.status (the source of truth), not the derived header.
  const [active, total] = await Promise.all([
    db
      .select({
        n: sql<number>`COUNT(DISTINCT ${requestLines.requestId})::int`,
        wagons: sql<number>`COALESCE(SUM(${requestLines.wagonsRequested}), 0)::int`,
      })
      .from(requestLines)
      .where(inArray(requestLines.status, ACTIVE as unknown as string[])),
    db
      .select({ n: sql<number>`COUNT(DISTINCT ${requestLines.requestId})::int` })
      .from(requestLines),
  ]);

  const activeRequests = active[0]?.n ?? 0;
  return {
    activeRequests,
    activeWagons: active[0]?.wagons ?? 0,
    archiveRequests: Math.max(0, (total[0]?.n ?? 0) - activeRequests),
  };
}

// ── get single request with its lines + resolved client name ─────────────────
export async function getRequest(id: string) {
  const headerRows = await db
    .select({
      request: requests,
      clientName: counterparties.nameCanonical,
    })
    .from(requests)
    .leftJoin(counterparties, eq(counterparties.id, requests.clientSuggestedId))
    .where(eq(requests.id, id))
    .limit(1);

  if (!headerRows[0]) throw new RequestError(404, "Запрос не найден");

  const lines = await db
    .select()
    .from(requestLines)
    .where(eq(requestLines.requestId, id))
    .orderBy(asc(requestLines.sortOrder));

  return { ...headerRows[0].request, clientName: headerRows[0].clientName, lines };
}

// ── update header fields (lines edited via re-create in this slice) ──────────
export async function updateRequest(
  id: string,
  input: RequestUpdateInput,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const current = await loadRequest(tx, id);
    if (current.status === "won") {
      throw new RequestError(409, "Выигранный запрос редактировать нельзя");
    }

    const patch: Partial<typeof requests.$inferInsert> = { updatedAt: new Date() };
    if (input.clientSuggestedId !== undefined) patch.clientSuggestedId = input.clientSuggestedId;
    if (input.clientRaw !== undefined) patch.clientRaw = input.clientRaw ?? null;
    if (input.wagonType !== undefined) patch.wagonType = input.wagonType ?? "ПВ";
    if (input.cargoName !== undefined) patch.cargoName = input.cargoName ?? null;
    if (input.periodFrom !== undefined) patch.periodFrom = toDate(input.periodFrom);
    if (input.periodTo !== undefined) patch.periodTo = toDate(input.periodTo);
    if (input.validUntil !== undefined) patch.validUntil = toDate(input.validUntil);
    if (input.notes !== undefined) patch.notes = input.notes ?? null;
    if (input.channel !== undefined) patch.channel = input.channel;

    await tx.update(requests).set(patch).where(eq(requests.id, id));
    return { id };
  });
}

// ── status transition ────────────────────────────────────────────────────────
export async function transitionRequest(
  id: string,
  input: RequestTransitionInput,
): Promise<{ id: string; status: RequestStatus }> {
  return db.transaction(async (tx) => {
    const current = await loadRequest(tx, id);
    const from = current.status as RequestStatus;
    const to = input.to;

    if (!canTransition(from, to)) {
      throw new RequestError(409, `Недопустимый переход: ${from} → ${to}`);
    }
    const guard = validateTransitionMeta(to, input.lossReason);
    if (!guard.ok) throw new RequestError(422, guard.reason ?? "Недопустимый переход");

    const now = new Date();
    const patch: Partial<typeof requests.$inferInsert> = { status: to, updatedAt: now };
    if (to === "won") patch.wonAt = now;
    if (to === "lost") {
      patch.lostAt = now;
      patch.lossReason = input.lossReason ?? null;
      patch.competitorPrice = numStr(input.competitorPrice);
      patch.lostTo = input.lostTo ?? null;
    }
    if (to === "no_bid") {
      patch.closedAt = now;
      patch.lossReason = input.lossReason ?? null;
    }
    if (to === "expired") patch.expiredAt = now;
    if (to === "cancelled") patch.cancelledAt = now;

    await tx.update(requests).set(patch).where(eq(requests.id, id));
    return { id, status: to };
  });
}

// ── transitionLines — move one or many DIRECTIONS, then roll the header up ────
// The heart of per-direction lifecycle: only the chosen request_lines change
// status; siblings are untouched. The parent requests.status is recomputed from
// ALL its lines in the SAME transaction so the board bucket never drifts.
export async function transitionLines(
  requestId: string,
  input: LineTransitionInput,
): Promise<{ requestId: string; lineIds: string[]; to: RequestStatus; headerStatus: RequestStatus }> {
  const to = input.to;
  const guard = validateTransitionMeta(to, input.lossReason);
  if (!guard.ok) throw new RequestError(422, guard.reason ?? "Недопустимый переход");

  return db.transaction(async (tx) => {
    await loadRequest(tx, requestId); // 404 if the request is gone

    // Load the targeted lines, scoped to this request (ownership guard).
    const targeted = await tx
      .select({ id: requestLines.id, status: requestLines.status })
      .from(requestLines)
      .where(and(eq(requestLines.requestId, requestId), inArray(requestLines.id, input.lineIds)));

    if (targeted.length !== input.lineIds.length) {
      throw new RequestError(404, "Некоторые направления не найдены в этом запросе");
    }

    for (const line of targeted) {
      if (!canTransitionLine(line.status as RequestStatus, to)) {
        throw new RequestError(409, `Недопустимый переход направления: ${line.status} → ${to}`);
      }
    }

    const now = new Date();
    const linePatch: Partial<typeof requestLines.$inferInsert> = { status: to };
    if (to === "won") linePatch.wonAt = now;
    if (to === "lost") {
      linePatch.lostAt = now;
      linePatch.lossReason = input.lossReason ?? null;
    }
    if (to === "no_bid") {
      linePatch.closedAt = now;
      linePatch.lossReason = input.lossReason ?? null;
    }
    if (to === "expired") linePatch.expiredAt = now;
    if (to === "cancelled") linePatch.cancelledAt = now;

    await tx
      .update(requestLines)
      .set(linePatch)
      .where(and(eq(requestLines.requestId, requestId), inArray(requestLines.id, input.lineIds)));

    // Recompute the header status from the FULL post-update line set.
    const allLines = await tx
      .select({ status: requestLines.status })
      .from(requestLines)
      .where(eq(requestLines.requestId, requestId));
    const headerStatus = rollupRequestStatus(allLines.map((l) => l.status as RequestStatus));

    const headerPatch: Partial<typeof requests.$inferInsert> = { status: headerStatus, updatedAt: now };
    if (headerStatus === "won") headerPatch.wonAt = now;
    if (headerStatus === "lost") headerPatch.lostAt = now;
    if (headerStatus === "no_bid") headerPatch.closedAt = now;
    if (headerStatus === "expired") headerPatch.expiredAt = now;
    if (headerStatus === "cancelled") headerPatch.cancelledAt = now;
    await tx.update(requests).set(headerPatch).where(eq(requests.id, requestId));

    return { requestId, lineIds: input.lineIds, to, headerStatus };
  });
}

// ── markLinesKpIssued — stamp "КП по этому плечу выпущено" after a КП render ──
export async function markLinesKpIssued(
  requestId: string,
  lineIds: string[],
): Promise<{ requestId: string; count: number }> {
  if (lineIds.length === 0) return { requestId, count: 0 };
  const updated = await db
    .update(requestLines)
    .set({ kpIssuedAt: new Date() })
    .where(and(eq(requestLines.requestId, requestId), inArray(requestLines.id, lineIds)))
    .returning({ id: requestLines.id });
  return { requestId, count: updated.length };
}

// stamp by line id only (cross-request board selection — KISS, no request scoping)
export async function markDirectionsKpIssued(lineIds: string[]): Promise<{ count: number }> {
  if (lineIds.length === 0) return { count: 0 };
  const updated = await db
    .update(requestLines)
    .set({ kpIssuedAt: new Date() })
    .where(inArray(requestLines.id, lineIds))
    .returning({ id: requestLines.id });
  return { count: updated.length };
}

// ── getDirectionsByIds — fetch selected directions ACROSS requests for a combined
// owner letter / КП (operator decision: mixing uploads is allowed). Each line
// carries its effective wagon type (line override → request header). ────────────
export async function getDirectionsByIds(lineIds: string[]): Promise<{
  lines: (typeof requestLines.$inferSelect & { wagonType: string | null })[];
  clientNames: string[];
  requestIds: string[];
}> {
  if (lineIds.length === 0) return { lines: [], clientNames: [], requestIds: [] };

  const rows = await db
    .select({
      line: requestLines,
      clientName: counterparties.nameCanonical,
      clientRaw: requests.clientRaw,
      headerWagonType: requests.wagonType,
    })
    .from(requestLines)
    .innerJoin(requests, eq(requestLines.requestId, requests.id))
    .leftJoin(counterparties, eq(counterparties.id, requests.clientSuggestedId))
    .where(inArray(requestLines.id, lineIds))
    .orderBy(asc(requestLines.sortOrder));

  const lines = rows.map((r) => ({
    ...r.line,
    wagonType: r.line.wagonType ?? r.headerWagonType,
  }));
  const clientNames = [
    ...new Set(rows.map((r) => r.clientName ?? r.clientRaw).filter((n): n is string => !!n)),
  ];
  const requestIds = [...new Set(rows.map((r) => r.line.requestId))];
  return { lines, clientNames, requestIds };
}

// ── delete — only while EVERY direction is still new (cancel legs otherwise) ──
export async function deleteRequest(id: string): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    await loadRequest(tx, id);
    const lines = await tx
      .select({ status: requestLines.status })
      .from(requestLines)
      .where(eq(requestLines.requestId, id));
    const allNew = lines.every((l) => l.status === "new");
    if (!allNew) {
      throw new RequestError(
        409,
        "Удалить весь запрос можно, только пока все направления новые — иначе отзывайте направления по отдельности",
      );
    }
    await tx.delete(requests).where(eq(requests.id, id)); // lines cascade
    return { id };
  });
}

// ── link a TEMP client label to a real counterparty (D16, operator action) ───
export async function linkClient(
  id: string,
  input: LinkClientInput,
): Promise<{ id: string; clientSuggestedId: string }> {
  return db.transaction(async (tx) => {
    await loadRequest(tx, id);
    const counterpartyId = await resolveCounterpartyId(tx, input.counterparty);
    await tx
      .update(requests)
      .set({ clientSuggestedId: counterpartyId, updatedAt: new Date() })
      .where(eq(requests.id, id));
    return { id, clientSuggestedId: counterpartyId };
  });
}
