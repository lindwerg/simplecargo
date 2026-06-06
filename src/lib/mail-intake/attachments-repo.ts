// Persist + read original inbound-mail documents so the operator can OPEN them
// (счета, ответы перевозчиков, вложения, текст письма). Bytes live in Postgres
// (see ingestedAttachments schema for why — cross-service constraint).

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ingestedAttachments } from "@/lib/db/schema/ingestedAttachments";

// Per-row byte cap. Above this we keep metadata (so the operator sees a file came
// in) but not the bytes, to keep the DB sane. Most счета/ответы are well under.
export const MAX_INGESTED_BYTES = 15 * 1024 * 1024; // 15 MB

export interface AttachmentMeta {
  id: string;
  sourceFileId: string;
  kind: string; // attachment | body
  filename: string;
  mimeType: string;
  sizeBytes: number;
  hasContent: boolean; // false → over the cap, bytes not stored
}

export interface SaveAttachmentInput {
  sourceFileId: string;
  kind: "attachment" | "body";
  filename: string;
  mimeType: string;
  content: Buffer;
}

/** Store one document's bytes (or just metadata if over the cap). Best-effort: the
 *  caller wraps this so a storage hiccup never loses the email itself. */
export async function saveIngestedAttachment(input: SaveAttachmentInput): Promise<void> {
  const tooBig = input.content.length > MAX_INGESTED_BYTES;
  await db.insert(ingestedAttachments).values({
    sourceFileId: input.sourceFileId,
    kind: input.kind,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.content.length,
    content: tooBig ? null : input.content,
  });
}

/** Metadata (no bytes) for every document of the given source emails, for listing
 *  next to quarantine items / invoices. Grouped by sourceFileId by the caller. */
export async function listAttachmentsByFiles(fileIds: string[]): Promise<AttachmentMeta[]> {
  if (fileIds.length === 0) return [];
  const rows = await db
    .select({
      id: ingestedAttachments.id,
      sourceFileId: ingestedAttachments.sourceFileId,
      kind: ingestedAttachments.kind,
      filename: ingestedAttachments.filename,
      mimeType: ingestedAttachments.mimeType,
      sizeBytes: ingestedAttachments.sizeBytes,
      content: ingestedAttachments.content,
    })
    .from(ingestedAttachments)
    .where(inArray(ingestedAttachments.sourceFileId, fileIds));
  return rows.map((r) => ({
    id: r.id,
    sourceFileId: r.sourceFileId,
    kind: r.kind,
    filename: r.filename,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    hasContent: r.content !== null,
  }));
}

export interface AttachmentBlob {
  filename: string;
  mimeType: string;
  content: Buffer;
}

/** The bytes of one document, for the download/view route. Null if absent or
 *  stored metadata-only (over the cap). */
export async function getIngestedAttachment(id: string): Promise<AttachmentBlob | null> {
  const rows = await db
    .select({
      filename: ingestedAttachments.filename,
      mimeType: ingestedAttachments.mimeType,
      content: ingestedAttachments.content,
    })
    .from(ingestedAttachments)
    .where(eq(ingestedAttachments.id, id))
    .limit(1);
  const r = rows[0];
  if (!r || r.content === null) return null;
  return { filename: r.filename, mimeType: r.mimeType, content: r.content };
}
