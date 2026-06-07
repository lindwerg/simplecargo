// Бэкофилл короткого сниппета тела письма (body_preview) для уже залитых писем —
// чтобы в плоском списке «Входящих» сразу была видна суть. Идемпотентно: трогает
// только строки, где body_preview IS NULL. Тело читает из bytea, а если оно в
// бакете (storage_key) — из object storage (нужны STORAGE_S3_* в .env).
//
// Запуск:  BACKFILL_DB_URL="postgresql://…" npx tsx scripts/backfill-body-preview.ts

import "./_loadenv";

import { Client } from "pg";

import { getObjectBytes, isObjectStoreConfigured } from "@/lib/storage/object-store";
import { makeSnippet } from "@/lib/mail-intake/snippet";

const CONCURRENCY = 4;

async function mapLimit<T>(items: T[], limit: number, fn: (t: T, i: number) => Promise<void>): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface BodyRow {
  kind: string;
  mime_type: string;
  storage_key: string | null;
  content: Buffer | null;
}

async function readBody(row: BodyRow | undefined): Promise<string | null> {
  if (!row) return null;
  if (row.content) return Buffer.from(row.content).toString("utf8");
  if (row.storage_key && isObjectStoreConfigured()) {
    const b = await getObjectBytes(row.storage_key);
    return b?.toString("utf8") ?? null;
  }
  return null;
}

async function main(): Promise<void> {
  const url = process.env.BACKFILL_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Нужен BACKFILL_DB_URL (или DATABASE_URL)");
    process.exit(1);
  }
  const c = new Client({ connectionString: url });
  await c.connect();

  const files = await c.query<{ id: string }>(
    `select id from ingested_files
       where source_type = 'E' and body_preview is null and status = 'committed'
       order by received_at desc`,
  );
  console.log(`[backfill] писем без сниппета: ${files.rows.length}`);
  if (files.rows.length === 0) {
    await c.end();
    process.exit(0);
  }

  let done = 0;
  let filled = 0;

  await mapLimit(files.rows, CONCURRENCY, async (f) => {
    const atts = await c.query<BodyRow>(
      `select kind, mime_type, storage_key, content from ingested_attachments
         where source_file_id = $1 and kind = 'body'`,
      [f.id],
    );
    const textRow = atts.rows.find((a) => a.mime_type.includes("text/plain"));
    const htmlRow = atts.rows.find((a) => a.mime_type.includes("text/html"));

    try {
      const text = await readBody(textRow);
      const html = text ? null : await readBody(htmlRow);
      const snippet = makeSnippet(text, html);
      if (snippet) {
        await c.query(`update ingested_files set body_preview = $2 where id = $1 and body_preview is null`, [
          f.id,
          snippet,
        ]);
        filled += 1;
      }
    } catch (e) {
      console.error(`[backfill] ${f.id} ошибка:`, e instanceof Error ? e.message : e);
    }
    done += 1;
    if (done % 20 === 0) console.log(`[backfill] ${done}/${files.rows.length}`);
  });

  console.log(`[backfill] готово ${done}, заполнено сниппетов: ${filled}`);
  await c.end();
  process.exit(0);
}

void main();
