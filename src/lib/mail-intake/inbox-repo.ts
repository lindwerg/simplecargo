// Read side of the «Входящие» tabbed mailbox: lists archived+classified emails by
// type (kind) with keyset pagination, and per-kind total/unread counts for the tab
// badges. The quarantine queue («Требует проверки») stays in quarantine-repo; this
// repo serves every other tab from ingested_files (sourceType 'E', status committed).

import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ingestedFiles } from "@/lib/db/schema/ingest";
import { ingestedAttachments } from "@/lib/db/schema/ingestedAttachments";
import { directions } from "@/lib/db/schema/directions";
import { getObjectBytes } from "@/lib/storage/object-store";
import { MAIL_PART_KINDS, type MailPartKind } from "./classify-schema";
import { listAttachmentsByFiles, type AttachmentMeta } from "./attachments-repo";

export type InboxTab = MailPartKind | "all";

export function isInboxTab(v: string | undefined | null): v is InboxTab {
  return v === "all" || (MAIL_PART_KINDS as readonly string[]).includes(v ?? "");
}

export interface InboxItem {
  id: string;
  subject: string; // ingested_files.filename = тема письма
  senderEmail: string | null;
  receivedAt: string | null;
  kind: string | null;
  kindConfidence: number | null;
  readAt: string | null;
  dealId: string | null;
  directionId: string | null;
  messageId: string | null;
  documents: AttachmentMeta[];
}

export interface InboxPage {
  items: InboxItem[];
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface Cursor {
  ts: Date;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.ts.toISOString()}|${c.id}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined | null): Cursor | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    const sep = decoded.lastIndexOf("|");
    if (sep < 0) return null;
    const ts = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(ts.getTime()) || !id) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

function toIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  return v == null ? null : String(v);
}

/** One page of inbox emails for a tab, newest first (keyset on received_at,id). */
export async function listInbox(opts: {
  tab: InboxTab;
  cursor?: string | null;
  limit?: number;
}): Promise<InboxPage> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const cursor = decodeCursor(opts.cursor);

  const conds = [eq(ingestedFiles.status, "committed"), eq(ingestedFiles.sourceType, "E")];
  if (opts.tab !== "all") conds.push(eq(ingestedFiles.kind, opts.tab));
  if (cursor) {
    conds.push(
      or(
        lt(ingestedFiles.receivedAt, cursor.ts),
        and(eq(ingestedFiles.receivedAt, cursor.ts), lt(ingestedFiles.id, cursor.id)),
      )!,
    );
  }

  const rows = await db
    .select({
      id: ingestedFiles.id,
      subject: ingestedFiles.filename,
      senderEmail: ingestedFiles.senderEmail,
      receivedAt: ingestedFiles.receivedAt,
      kind: ingestedFiles.kind,
      kindConfidence: ingestedFiles.kindConfidence,
      readAt: ingestedFiles.readAt,
      dealId: ingestedFiles.dealId,
      directionId: ingestedFiles.directionId,
      messageId: ingestedFiles.gmailMessageId,
    })
    .from(ingestedFiles)
    .where(and(...conds))
    .orderBy(desc(ingestedFiles.receivedAt), desc(ingestedFiles.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const fileIds = pageRows.map((r) => r.id);
  const docs = await listAttachmentsByFiles(fileIds);
  const docsByFile = new Map<string, AttachmentMeta[]>();
  for (const d of docs) {
    const list = docsByFile.get(d.sourceFileId) ?? [];
    list.push(d);
    docsByFile.set(d.sourceFileId, list);
  }

  const items: InboxItem[] = pageRows.map((r) => ({
    id: r.id,
    subject: r.subject,
    senderEmail: r.senderEmail,
    receivedAt: toIso(r.receivedAt),
    kind: r.kind,
    kindConfidence: r.kindConfidence == null ? null : Number(r.kindConfidence),
    readAt: toIso(r.readAt),
    dealId: r.dealId,
    directionId: r.directionId,
    messageId: r.messageId,
    documents: docsByFile.get(r.id) ?? [],
  }));

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = pageRows[pageRows.length - 1];
    if (last.receivedAt instanceof Date) {
      nextCursor = encodeCursor({ ts: last.receivedAt, id: last.id });
    }
  }

  return { items, nextCursor };
}

export interface KindCount {
  total: number;
  unread: number;
}
// keyed by InboxTab; always includes "all"
export type InboxCounts = Record<string, KindCount>;

/** Per-kind total + unread counts (one grouped query) → tab badges. */
export async function countInboxByKind(): Promise<InboxCounts> {
  const rows = await db
    .select({
      kind: ingestedFiles.kind,
      total: sql<number>`count(*)::int`,
      unread: sql<number>`count(*) filter (where ${ingestedFiles.readAt} is null)::int`,
    })
    .from(ingestedFiles)
    .where(and(eq(ingestedFiles.status, "committed"), eq(ingestedFiles.sourceType, "E")))
    .groupBy(ingestedFiles.kind);

  const counts: InboxCounts = { all: { total: 0, unread: 0 } };
  for (const r of rows) {
    const total = Number(r.total ?? 0);
    const unread = Number(r.unread ?? 0);
    counts.all.total += total;
    counts.all.unread += unread;
    // NULL-kind (ещё не размеченные) считаем ТОЛЬКО во «Все» — иначе бейдж вкладки
    // не сойдётся со списком (список фильтрует по конкретному kind).
    if (r.kind == null) continue;
    const prev = counts[r.kind] ?? { total: 0, unread: 0 };
    counts[r.kind] = { total: prev.total + total, unread: prev.unread + unread };
  }
  return counts;
}

export interface InboxEmailDetail {
  id: string;
  subject: string;
  senderEmail: string | null;
  receivedAt: string | null;
  kind: string | null;
  dealId: string | null;
  directionId: string | null;
  directionLabel: string | null; // подпись привязанного направления (сделки)
  hasHtml: boolean;
  hasRawEml: boolean;
  documents: AttachmentMeta[]; // только настоящие вложения (kind='attachment')
  bodyText: AttachmentMeta | null; // «Текст письма» — запасной вид без HTML
}

/** One email for the detail view: header + attachments + flags (HTML/.eml есть). */
export async function getInboxEmailDetail(id: string): Promise<InboxEmailDetail | null> {
  const rows = await db
    .select({
      id: ingestedFiles.id,
      subject: ingestedFiles.filename,
      senderEmail: ingestedFiles.senderEmail,
      receivedAt: ingestedFiles.receivedAt,
      kind: ingestedFiles.kind,
      dealId: ingestedFiles.dealId,
      directionId: ingestedFiles.directionId,
      directionName: directions.displayName,
      directionOrigin: directions.stationOriginRaw,
      directionDest: directions.stationDestRaw,
      storageKey: ingestedFiles.storageKey,
      htmlStorageKey: ingestedFiles.htmlStorageKey,
    })
    .from(ingestedFiles)
    .leftJoin(directions, eq(ingestedFiles.directionId, directions.id))
    .where(eq(ingestedFiles.id, id))
    .limit(1);
  const r = rows[0];
  if (!r) return null;

  const docs = await listAttachmentsByFiles([id]);
  const htmlBody = docs.find((d) => d.kind === "body" && d.mimeType.includes("text/html"));
  const textBody = docs.find((d) => d.kind === "body" && d.mimeType.includes("text/plain"));
  const directionLabel = r.directionId
    ? r.directionName ?? ([r.directionOrigin, r.directionDest].filter(Boolean).join(" → ") || "Направление")
    : null;

  return {
    id: r.id,
    subject: r.subject,
    senderEmail: r.senderEmail,
    receivedAt: toIso(r.receivedAt),
    kind: r.kind,
    dealId: r.dealId,
    directionId: r.directionId,
    directionLabel,
    hasHtml: Boolean(r.htmlStorageKey) || Boolean(htmlBody),
    hasRawEml: Boolean(r.storageKey),
    documents: docs.filter((d) => d.kind === "attachment" && !d.isInline),
    bodyText: textBody ?? null,
  };
}

/** Object-storage key of the raw .eml (for «скачать оригинал»). Null if not stored. */
export async function getEmailRawStorageKey(id: string): Promise<string | null> {
  const rows = await db
    .select({ storageKey: ingestedFiles.storageKey })
    .from(ingestedFiles)
    .where(eq(ingestedFiles.id, id))
    .limit(1);
  return rows[0]?.storageKey ?? null;
}

/** Sanitized HTML body for the iframe view, with cid: images rewritten to the
 *  attachment route. Returns null when the email has no HTML part. Scripts are
 *  stripped here AND blocked by CSP + iframe sandbox at the serving layer. */
export async function getEmailHtml(id: string): Promise<string | null> {
  const fileRows = await db
    .select({ htmlStorageKey: ingestedFiles.htmlStorageKey })
    .from(ingestedFiles)
    .where(eq(ingestedFiles.id, id))
    .limit(1);
  if (!fileRows[0]) return null;

  const atts = await db
    .select({
      id: ingestedAttachments.id,
      kind: ingestedAttachments.kind,
      mimeType: ingestedAttachments.mimeType,
      contentId: ingestedAttachments.contentId,
      storageKey: ingestedAttachments.storageKey,
      content: ingestedAttachments.content,
    })
    .from(ingestedAttachments)
    .where(eq(ingestedAttachments.sourceFileId, id));

  // Источник HTML: ключ на письме (bucket) → иначе вложение-тело text/html.
  let raw: string | null = null;
  if (fileRows[0].htmlStorageKey) {
    const b = await getObjectBytes(fileRows[0].htmlStorageKey);
    raw = b?.toString("utf8") ?? null;
  }
  if (!raw) {
    const body = atts.find((a) => a.kind === "body" && a.mimeType.includes("text/html"));
    if (body?.storageKey) raw = (await getObjectBytes(body.storageKey))?.toString("utf8") ?? null;
    else if (body?.content) raw = Buffer.from(body.content).toString("utf8");
  }
  if (!raw) return null;

  // cid → /api/ingested/attachments/{id}
  const cidToId = new Map<string, string>();
  for (const a of atts) {
    if (a.contentId) cidToId.set(a.contentId.replace(/[<>]/g, ""), a.id);
  }
  const rewritten = raw.replace(/cid:([^"'\s>)]+)/gi, (m, cid: string) => {
    const attId = cidToId.get(cid.replace(/[<>]/g, ""));
    return attId ? `/api/ingested/attachments/${attId}` : m;
  });

  // defense-in-depth: вырезаем <script> (CSP + sandbox уже блокируют исполнение)
  return rewritten.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

/** Mark one email read (clears the «новое» badge). Idempotent. */
export async function markInboxRead(id: string): Promise<void> {
  if (!id) return;
  await db
    .update(ingestedFiles)
    .set({ readAt: new Date() })
    .where(and(eq(ingestedFiles.id, id), sql`${ingestedFiles.readAt} is null`));
}

/** Привязать/отвязать письмо к направлению (сделке). directionId=null → отвязать. */
export async function setInboxLink(emailId: string, directionId: string | null): Promise<void> {
  if (!emailId) return;
  await db.update(ingestedFiles).set({ directionId }).where(eq(ingestedFiles.id, emailId));
}

/** Ручной ярлык типа письма (менеджер сам относит). category=null → снять ярлык
 *  (письмо вернётся только во «Все»). Хранится в той же колонке kind. */
export async function setInboxCategory(emailId: string, category: string | null): Promise<void> {
  if (!emailId) return;
  await db
    .update(ingestedFiles)
    .set({ kind: category, classifiedAt: new Date() })
    .where(eq(ingestedFiles.id, emailId));
}

export interface DirectionEmail {
  id: string;
  subject: string;
  kind: string | null;
  receivedAt: string | null;
  directionId: string | null;
}

/** Письма, привязанные к указанным направлениям (для карточки сделки). */
export async function listEmailsForDirections(directionIds: string[]): Promise<DirectionEmail[]> {
  if (directionIds.length === 0) return [];
  const rows = await db
    .select({
      id: ingestedFiles.id,
      subject: ingestedFiles.filename,
      kind: ingestedFiles.kind,
      receivedAt: ingestedFiles.receivedAt,
      directionId: ingestedFiles.directionId,
    })
    .from(ingestedFiles)
    .where(inArray(ingestedFiles.directionId, directionIds))
    .orderBy(desc(ingestedFiles.receivedAt));
  return rows.map((r) => ({
    id: r.id,
    subject: r.subject,
    kind: r.kind,
    receivedAt: toIso(r.receivedAt),
    directionId: r.directionId,
  }));
}
