// Дозагрузка ОРИГИНАЛОВ для старых писем, у которых ничего не сохранено (приняты
// воркером до появления хранения тела/вложений): по Message-ID находит письмо в
// ящике, кладёт сырое .eml + HTML + текст + вложения в object storage, дозаписывает
// ingested_attachments и переклассифицирует с полным содержимым. Идемпотентно
// (берёт только файлы со storage_key IS NULL). НЕ перемещает и не помечает почту.
//
// Запуск: BACKFILL_DB_URL="postgresql://…" npx tsx scripts/repair-emails-from-imap.ts
// Требует MAILRU_IMAP_* , OPENROUTER_API_KEY и STORAGE_S3_* в .env.

import "./_loadenv";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { Client } from "pg";

import { env } from "@/lib/env";
import { classifyEmail } from "@/lib/mail-intake/classify";
import { effectiveEmailKind } from "@/lib/mail-intake/classify-schema";
import {
  emailAttachmentKey,
  emailHtmlKey,
  emailRawKey,
  isObjectStoreConfigured,
  putObject,
} from "@/lib/storage/object-store";
import type { MailAttachmentInput, ParsedEmail } from "@/lib/mail-intake/types";

const norm = (m: string): string => m.replace(/[<>]/g, "").trim();

interface Target {
  id: string;
  sha: string;
}

async function storeOne(c: Client, t: Target, raw: Buffer): Promise<string> {
  const p = await simpleParser(raw);
  const sha = t.sha;
  const text = p.text ?? "";
  const html = typeof p.html === "string" ? p.html : null;

  await putObject(emailRawKey(sha), raw, "message/rfc822");
  let htmlKey: string | null = null;
  if (html && html.trim()) {
    htmlKey = emailHtmlKey(sha);
    await putObject(htmlKey, Buffer.from(html, "utf8"), "text/html; charset=utf-8");
  }

  // тело-текст как вложение (для открытия/поиска)
  if (text.trim()) {
    const key = `emails/${sha}/body.txt`;
    const buf = Buffer.from(text, "utf8");
    await putObject(key, buf, "text/plain; charset=utf-8");
    await c.query(
      `insert into ingested_attachments (source_file_id, kind, filename, mime_type, size_bytes, storage_key, is_inline)
       values ($1,'body','Текст письма.txt','text/plain; charset=utf-8',$2,$3,false)`,
      [t.id, buf.length, key],
    );
  }

  const attachments: MailAttachmentInput[] = (p.attachments ?? []).map((a) => ({
    filename: a.filename ?? "attachment",
    contentType: a.contentType ?? "application/octet-stream",
    size: a.size ?? a.content.length,
    content: a.content,
    cid: a.cid ?? null,
    inline: a.contentDisposition === "inline" || Boolean(a.related),
  }));
  let i = 0;
  for (const att of attachments) {
    const key = emailAttachmentKey(sha, i, att.filename);
    await putObject(key, att.content, att.contentType);
    await c.query(
      `insert into ingested_attachments (source_file_id, kind, filename, mime_type, size_bytes, storage_key, is_inline, content_id)
       values ($1,'attachment',$2,$3,$4,$5,$6,$7)`,
      [t.id, att.filename, att.contentType, att.content.length, key, att.inline ?? false, att.cid ?? null],
    );
    i += 1;
  }

  // переклассификация с полным содержимым
  const email: ParsedEmail = {
    from: p.from?.value?.[0]?.address ?? "",
    subject: p.subject ?? "",
    text: text.slice(0, 8000),
    html,
    messageId: p.messageId ?? "",
    attachments,
  };
  let kind = "other";
  let conf = 0;
  try {
    const eff = effectiveEmailKind(await classifyEmail(email));
    kind = eff.kind;
    conf = eff.confidence;
  } catch {
    /* оставим прежний тип, перезапишем ниже только storage */
  }

  await c.query(
    `update ingested_files set storage_key=$2, html_storage_key=$3, kind=$4, kind_confidence=$5, classified_at=now() where id=$1`,
    [t.id, emailRawKey(sha), htmlKey, kind, String(conf)],
  );
  return kind;
}

async function main(): Promise<void> {
  if (!env.MAILRU_IMAP_USER || !env.MAILRU_IMAP_APP_PASSWORD) {
    console.error("Нужны MAILRU_IMAP_*");
    process.exit(1);
  }
  if (!isObjectStoreConfigured()) {
    console.error("Нужны STORAGE_S3_* (object storage)");
    process.exit(1);
  }
  const url = process.env.BACKFILL_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Нужен BACKFILL_DB_URL");
    process.exit(1);
  }

  const c = new Client({ connectionString: url });
  await c.connect();
  const rows = await c.query<{ id: string; sha: string; mid: string }>(
    `select id, content_sha256 sha, gmail_message_id mid from ingested_files
       where source_type='E' and storage_key is null and gmail_message_id is not null`,
  );
  const wanted = new Map<string, Target>();
  for (const r of rows.rows) wanted.set(norm(r.mid), { id: r.id, sha: r.sha });
  console.log(`[repair] писем для дозагрузки: ${wanted.size}`);
  if (wanted.size === 0) {
    await c.end();
    process.exit(0);
  }

  const imap = new ImapFlow({
    host: env.MAILRU_IMAP_HOST,
    port: env.MAILRU_IMAP_PORT,
    secure: true,
    auth: { user: env.MAILRU_IMAP_USER, pass: env.MAILRU_IMAP_APP_PASSWORD },
    logger: false,
    clientInfo: { name: "SimpleCargo-repair", version: "1.0" },
  });
  await imap.connect();

  const done = new Set<string>();
  const tally: Record<string, number> = {};
  try {
    const folders = await imap.list();
    for (const f of folders) {
      if (done.size >= wanted.size) break;
      const lock = await imap.getMailboxLock(f.path, { readonly: true } as never).catch(() => null);
      if (!lock) continue;
      try {
        const hits: { uid: number; target: Target }[] = [];
        for await (const msg of imap.fetch("1:*", { uid: true, envelope: true })) {
          const mid = msg.envelope?.messageId;
          if (!mid) continue;
          const target = wanted.get(norm(mid));
          if (target && !done.has(target.id)) hits.push({ uid: msg.uid, target });
        }
        for (const h of hits) {
          if (done.has(h.target.id)) continue;
          const one = await imap.fetchOne(String(h.uid), { source: true }, { uid: true });
          if (!one || !one.source) continue;
          try {
            const kind = await storeOne(c, h.target, one.source as Buffer);
            done.add(h.target.id);
            tally[kind] = (tally[kind] ?? 0) + 1;
            if (done.size % 20 === 0) console.log(`[repair] ${done.size}/${wanted.size}`);
          } catch (e) {
            console.error(`[repair] ${h.target.id} ошибка:`, e instanceof Error ? e.message : e);
          }
        }
        console.log(`[repair] ${f.path}: найдено ${hits.length}, всего ${done.size}/${wanted.size}`);
      } finally {
        lock.release();
      }
    }
  } finally {
    await imap.logout().catch(() => {});
  }

  console.log(`[repair] дозагружено ${done.size}/${wanted.size}. Распределение типов:`);
  Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  if (done.size < wanted.size) {
    console.log(`[repair] не найдено в ящике: ${wanted.size - done.size} (письма могли быть удалены)`);
  }
  await c.end();
  process.exit(0);
}

void main();
