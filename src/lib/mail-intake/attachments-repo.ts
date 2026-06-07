// Persist + read original inbound-mail documents so the operator can OPEN them
// (счета, ответы перевозчиков, вложения, тело письма). Canonical store = object
// storage (Railway Bucket); when it's not configured we fall back to Postgres
// bytea (legacy, capped). Web and mail-worker share the bucket (no common volume).

import { eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ingestedAttachments } from "@/lib/db/schema/ingestedAttachments";
import { isObjectStoreConfigured, putObject } from "@/lib/storage/object-store";

// Fallback bytea cap, used ONLY when object storage is not configured. Above it we
// keep metadata (so the operator sees a file came in) but not the bytes.
export const MAX_BYTEA_BYTES = 50 * 1024 * 1024; // 50 MB

export interface AttachmentMeta {
  id: string;
  sourceFileId: string;
  kind: string; // attachment | body
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isInline: boolean;
  contentId: string | null;
  hasContent: boolean; // openable (in bucket OR in bytea)
}

export interface SaveAttachmentInput {
  sourceFileId: string;
  kind: "attachment" | "body";
  filename: string;
  mimeType: string;
  content: Buffer;
  objectKey: string; // куда класть в bucket (если настроен)
  isInline?: boolean;
  contentId?: string | null;
}

/** Store one document: object storage if configured (storageKey set, bytea null),
 *  else bytea fallback. Best-effort — caller wraps so a hiccup never loses the email. */
export async function saveIngestedAttachment(input: SaveAttachmentInput): Promise<void> {
  let storageKey: string | null = null;
  let content: Buffer | null = input.content;

  if (isObjectStoreConfigured()) {
    try {
      await putObject(input.objectKey, input.content, input.mimeType);
      storageKey = input.objectKey;
      content = null; // канонично в бакете — bytea не дублируем
    } catch {
      // не удалось залить — упадём на bytea ниже
    }
  }
  if (!storageKey && content && content.length > MAX_BYTEA_BYTES) {
    content = null; // слишком большой и без бакета — только метаданные
  }

  await db.insert(ingestedAttachments).values({
    sourceFileId: input.sourceFileId,
    kind: input.kind,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.content.length,
    storageKey,
    isInline: input.isInline ?? false,
    contentId: input.contentId ?? null,
    content,
  });
}

/** Metadata (no bytes) for every document of the given source emails. */
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
      isInline: ingestedAttachments.isInline,
      contentId: ingestedAttachments.contentId,
      storageKey: ingestedAttachments.storageKey,
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
    isInline: r.isInline,
    contentId: r.contentId,
    hasContent: r.storageKey !== null || r.content !== null,
  }));
}

export interface AttachmentRef {
  filename: string;
  mimeType: string;
  storageKey: string | null;
  content: Buffer | null;
}

/** Where one document's bytes live (bucket key or inline bytea). Null if absent. */
export async function getIngestedAttachmentRef(id: string): Promise<AttachmentRef | null> {
  const rows = await db
    .select({
      filename: ingestedAttachments.filename,
      mimeType: ingestedAttachments.mimeType,
      storageKey: ingestedAttachments.storageKey,
      content: ingestedAttachments.content,
    })
    .from(ingestedAttachments)
    .where(eq(ingestedAttachments.id, id))
    .limit(1);
  const r = rows[0];
  if (!r || (r.storageKey === null && r.content === null)) return null;
  return { filename: r.filename, mimeType: r.mimeType, storageKey: r.storageKey, content: r.content };
}
