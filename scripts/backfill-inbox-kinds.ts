// Бэкофилл типа письма для уже залитых, но НЕразмеченных писем (kind IS NULL) —
// например, принятых воркером до выкатки классификатора. Читает сохранённое тело
// и манифест вложений из ingested_attachments, гоняет classifyEmail и проставляет
// kind/kind_confidence/classified_at. Идемпотентно (трогает только kind IS NULL).
// Историю из самой почты НЕ тянет.
//
// Запуск:  BACKFILL_DB_URL="postgresql://…" npx tsx scripts/backfill-inbox-kinds.ts
// Требует OPENROUTER_API_KEY в .env. BACKFILL_DB_URL — прод/целевая БД.

import "./_loadenv";

import { Client } from "pg";

import { classifyEmail } from "@/lib/mail-intake/classify";
import { effectiveEmailKind } from "@/lib/mail-intake/classify-schema";
import type { MailAttachmentInput, ParsedEmail } from "@/lib/mail-intake/types";

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

async function main(): Promise<void> {
  const url = process.env.BACKFILL_DB_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("Нужен BACKFILL_DB_URL (или DATABASE_URL)");
    process.exit(1);
  }
  const c = new Client({ connectionString: url });
  await c.connect();

  const files = await c.query<{ id: string; filename: string }>(
    `select id, filename from ingested_files
       where source_type = 'E' and kind is null and status = 'committed'
       order by received_at desc`,
  );
  console.log(`[backfill] писем без типа: ${files.rows.length}`);
  if (files.rows.length === 0) {
    await c.end();
    process.exit(0);
  }

  let done = 0;
  const tally: Record<string, number> = {};

  await mapLimit(files.rows, CONCURRENCY, async (f) => {
    const atts = await c.query<{
      kind: string;
      filename: string;
      mime_type: string;
      size_bytes: number;
      content: Buffer | null;
    }>(`select kind, filename, mime_type, size_bytes, content from ingested_attachments where source_file_id = $1`, [
      f.id,
    ]);

    const bodyRow = atts.rows.find((a) => a.kind === "body" && a.mime_type.includes("text/plain"));
    const text = bodyRow?.content ? Buffer.from(bodyRow.content).toString("utf8") : "";
    const attachments: MailAttachmentInput[] = atts.rows
      .filter((a) => a.kind === "attachment")
      .map((a) => ({
        filename: a.filename,
        contentType: a.mime_type,
        size: a.size_bytes,
        content: Buffer.alloc(0), // классификатору нужен только манифест
      }));

    const email: ParsedEmail = {
      from: "",
      subject: f.filename ?? "",
      text: text.slice(0, 8000),
      messageId: "",
      attachments,
    };

    try {
      const cls = await classifyEmail(email);
      const eff = effectiveEmailKind(cls);
      await c.query(
        `update ingested_files set kind = $2, kind_confidence = $3, classified_at = now() where id = $1 and kind is null`,
        [f.id, eff.kind, String(eff.confidence)],
      );
      tally[eff.kind] = (tally[eff.kind] ?? 0) + 1;
    } catch (e) {
      console.error(`[backfill] ${f.id} ошибка:`, e instanceof Error ? e.message : e);
    }
    done += 1;
    if (done % 20 === 0) console.log(`[backfill] ${done}/${files.rows.length}`);
  });

  console.log(`[backfill] готово ${done}. Распределение:`);
  Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${k}: ${n}`));
  await c.end();
  process.exit(0);
}

void main();
