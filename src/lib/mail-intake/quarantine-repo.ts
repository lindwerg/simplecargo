// Read/resolve side for the «Входящие» (quarantine) queue — the human-in-the-loop
// surface for everything the AI intake couldn't auto-file: low-confidence RFQs,
// unknown senders, unmatchable carrier quotes, unsupported attachments, and
// emails that crashed mid-processing (PROCESSING_ERROR). Until this existed the
// queue was write-only and items piled up invisibly (AUTONOMY_AUDIT §6).

import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ingestedFiles } from "@/lib/db/schema/ingest";
import { quarantineRows } from "@/lib/db/schema/quarantine";
import { publishRealtime } from "@/lib/realtime/notify";
import { listAttachmentsByFiles, type AttachmentMeta } from "./attachments-repo";

export type ReviewAction = "approved" | "rejected" | "reprocessed";

export interface QuarantineItem {
  id: number;
  reasonCode: string;
  severity: string;
  ruleId: string;
  agentReason: string | null;
  draft: unknown; // rawRowJson — the preserved draft for manual action
  createdAt: string;
  senderEmail: string | null;
  filename: string | null;
  messageId: string | null;
  receivedAt: string | null;
  documents: AttachmentMeta[]; // originals to open (тело письма + вложения)
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 300;

/** Unresolved quarantine items, newest first, with their source-email context. */
export async function listQuarantine(opts: { limit?: number } = {}): Promise<QuarantineItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const rows = await db
    .select({
      id: quarantineRows.id,
      reasonCode: quarantineRows.reasonCode,
      severity: quarantineRows.severity,
      ruleId: quarantineRows.ruleId,
      agentReason: quarantineRows.agentReason,
      draft: quarantineRows.rawRowJson,
      createdAt: quarantineRows.createdAt,
      sourceFileId: quarantineRows.sourceFileId,
      senderEmail: ingestedFiles.senderEmail,
      filename: ingestedFiles.filename,
      messageId: ingestedFiles.gmailMessageId,
      receivedAt: ingestedFiles.receivedAt,
    })
    .from(quarantineRows)
    .leftJoin(ingestedFiles, eq(quarantineRows.sourceFileId, ingestedFiles.id))
    .where(eq(quarantineRows.resolved, false))
    .orderBy(desc(quarantineRows.createdAt))
    .limit(limit);

  // Attach the originals (one query for the whole page), grouped by source email.
  const fileIds = [...new Set(rows.map((r) => r.sourceFileId).filter((v): v is string => !!v))];
  const docs = await listAttachmentsByFiles(fileIds);
  const docsByFile = new Map<string, AttachmentMeta[]>();
  for (const d of docs) {
    const list = docsByFile.get(d.sourceFileId) ?? [];
    list.push(d);
    docsByFile.set(d.sourceFileId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    reasonCode: r.reasonCode,
    severity: r.severity,
    ruleId: r.ruleId,
    agentReason: r.agentReason,
    draft: r.draft,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    senderEmail: r.senderEmail,
    filename: r.filename,
    messageId: r.messageId,
    receivedAt:
      r.receivedAt instanceof Date ? r.receivedAt.toISOString() : r.receivedAt ? String(r.receivedAt) : null,
    documents: r.sourceFileId ? docsByFile.get(r.sourceFileId) ?? [] : [],
  }));
}

/** Count of open items — drives the «Входящие» nav badge. */
export async function countUnresolvedQuarantine(): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(quarantineRows)
    .where(eq(quarantineRows.resolved, false));
  return Number(rows[0]?.n ?? 0);
}

export class QuarantineError extends Error {
  constructor(
    public readonly status: 400 | 404,
    message: string,
  ) {
    super(message);
    this.name = "QuarantineError";
  }
}

/** Operator triage: mark an item resolved with the action taken. Idempotent on an
 *  already-resolved row (returns it unchanged). The preserved draft stays in the
 *  row for audit. Re-creating a request from the draft is a follow-up step. */
export async function resolveQuarantine(
  id: number,
  action: ReviewAction,
  userId: string,
): Promise<{ id: number; reviewAction: ReviewAction }> {
  if (!Number.isInteger(id) || id <= 0) {
    throw new QuarantineError(400, "Некорректный идентификатор");
  }
  const updated = await db
    .update(quarantineRows)
    .set({
      resolved: true,
      reviewAction: action,
      resolvedBy: userId,
      resolvedAt: new Date(),
    })
    .where(eq(quarantineRows.id, id))
    .returning({ id: quarantineRows.id, reviewAction: quarantineRows.reviewAction });

  if (!updated[0]) throw new QuarantineError(404, "Запись карантина не найдена");
  await publishRealtime({ kind: "quarantine" });
  return { id: updated[0].id, reviewAction: action };
}
