// Эвал ИИ-классификатора входящих писем на РЕАЛЬНОЙ истории ящика (read-only).
// Цель: убедиться, что классификатор находит КАЖДУЮ группу (дислокация, счета,
// ГУ-12, документы, претензии, запросы, ответы перевозчиков, прочее) и не путает
// очевидные типы — чтобы подкрутить classify-prompt перед выкаткой.
//
// Не заливает ничего в БД и не меняет почту (mailboxOpen readOnly). Берёт выборку
// из INBOX + нескольких папок-контрагентов (слабая разметка), гоняет classifyEmail,
// печатает покрытие по группам + примеры, полный результат пишет в /tmp.
//
// Запуск:  npx tsx scripts/eval-classify.ts [perFolder]
// Требует MAILRU_IMAP_* и OPENROUTER_API_KEY в .env.

import "./_loadenv";

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

import { env } from "@/lib/env";
import { classifyEmail } from "@/lib/mail-intake/classify";
import type { MailAttachmentInput, ParsedEmail } from "@/lib/mail-intake/types";

// Папки для выборки: INBOX + представители «финансов» и перевозчиков. Папка — это
// слабый ярлык (по контрагенту, не по типу), но помогает покрыть разные потоки.
const SAMPLE_FOLDERS: { path: string; n: number; note: string }[] = [
  { path: "INBOX", n: 90, note: "общий поток" },
  { path: "INBOX/БУХГАЛТЕРИЯ РНС", n: 30, note: "ожидаем счета/документы/претензии" },
  { path: "INBOX/ПрофитРейл", n: 20, note: "перевозчик: ответы/дислокация" },
  { path: "INBOX/УТК", n: 20, note: "перевозчик: ответы/дислокация" },
];

const CONCURRENCY = 4;

interface Sample {
  folder: string;
  email: ParsedEmail;
}

function makeClient(): ImapFlow {
  return new ImapFlow({
    host: env.MAILRU_IMAP_HOST,
    port: env.MAILRU_IMAP_PORT,
    secure: true,
    auth: { user: env.MAILRU_IMAP_USER!, pass: env.MAILRU_IMAP_APP_PASSWORD! },
    logger: false,
    clientInfo: { name: "SimpleCargo-eval", version: "1.0" },
  });
}

async function harvest(client: ImapFlow, folder: string, n: number): Promise<Sample[]> {
  const out: Sample[] = [];
  const lock = await client.getMailboxLock(folder, { readonly: true } as never).catch(() => null);
  if (!lock) return out;
  try {
    const mb = client.mailbox;
    const total = mb && typeof mb !== "boolean" ? mb.exists : 0;
    if (!total) return out;
    const start = Math.max(1, total - n + 1);
    for await (const msg of client.fetch(`${start}:*`, { source: true })) {
      if (!msg.source) continue;
      try {
        const p = await simpleParser(msg.source as Buffer);
        const from = p.from?.value?.[0]?.address ?? "";
        const attachments: MailAttachmentInput[] = (p.attachments ?? []).map((a) => ({
          filename: a.filename ?? "attachment",
          contentType: a.contentType ?? "application/octet-stream",
          size: a.size ?? a.content.length,
          content: Buffer.alloc(0), // классификатору нужен только манифест, не байты
        }));
        out.push({
          folder,
          email: {
            from,
            fromName: p.from?.value?.[0]?.name ?? null,
            subject: p.subject ?? "",
            text: (p.text ?? "").slice(0, 8000),
            messageId: p.messageId ?? "",
            date: p.date ?? null,
            attachments,
          },
        });
      } catch {
        // битое письмо — пропускаем
      }
    }
  } finally {
    lock.release();
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      res[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return res;
}

interface Row {
  folder: string;
  subject: string;
  from: string;
  atts: string[];
  bodyKind: string;
  conf: number;
  attKinds: string[];
}

async function main(): Promise<void> {
  if (!env.MAILRU_IMAP_USER || !env.MAILRU_IMAP_APP_PASSWORD) {
    console.error("Нужны MAILRU_IMAP_USER и MAILRU_IMAP_APP_PASSWORD в .env");
    process.exit(1);
  }
  if (!env.OPENROUTER_API_KEY) {
    console.error("Нужен OPENROUTER_API_KEY в .env (классификатор)");
    process.exit(1);
  }
  const override = Number(process.argv[2]);

  const client = makeClient();
  await client.connect();
  const samples: Sample[] = [];
  try {
    for (const f of SAMPLE_FOLDERS) {
      const n = Number.isFinite(override) && override > 0 ? override : f.n;
      const got = await harvest(client, f.path, n);
      console.log(`[harvest] ${f.path}: ${got.length} писем (${f.note})`);
      samples.push(...got);
    }
  } finally {
    await client.logout().catch(() => {});
  }

  console.log(`\n[classify] гоняю ${samples.length} писем через ${env.OPENROUTER_MODEL}…`);
  const rows: Row[] = await mapLimit(samples, CONCURRENCY, async (s) => {
    const r = await classifyEmail(s.email);
    return {
      folder: s.folder,
      subject: s.email.subject.replace(/\s+/g, " ").slice(0, 80),
      from: s.email.from,
      atts: s.email.attachments.map((a) => a.filename),
      bodyKind: r.bodyKind,
      conf: r.bodyConfidence,
      attKinds: r.attachments.map((a) => a.kind),
    };
  });

  // ── отчёт ───────────────────────────────────────────────────────────────────
  const GROUPS = [
    "client_rfq",
    "carrier_quote",
    "invoice",
    "dislocation",
    "gu12",
    "document",
    "claim",
    "other",
  ];
  const byKind = new Map<string, Row[]>();
  for (const g of GROUPS) byKind.set(g, []);
  for (const r of rows) (byKind.get(r.bodyKind) ?? byKind.set(r.bodyKind, []).get(r.bodyKind)!).push(r);

  console.log("\n=== ПОКРЫТИЕ ПО ГРУППАМ (bodyKind) ===");
  for (const g of GROUPS) {
    const list = byKind.get(g) ?? [];
    const flag = list.length === 0 ? "  ⚠ НЕ НАЙДЕНО" : "";
    console.log(`${g.padEnd(14)} ${String(list.length).padStart(3)}${flag}`);
  }

  console.log("\n=== ПРИМЕРЫ ПО ГРУППАМ (до 8) ===");
  for (const g of GROUPS) {
    const list = byKind.get(g) ?? [];
    if (!list.length) continue;
    console.log(`\n--- ${g} (${list.length}) ---`);
    for (const r of list.slice(0, 8)) {
      console.log(
        `  [${r.conf.toFixed(2)}] ${r.subject || "(без темы)"}  ⟵ ${r.folder.replace("INBOX/", "")}` +
          (r.atts.length ? `  📎${r.atts.length}` : ""),
      );
    }
  }

  const lowConf = rows.filter((r) => r.conf < 0.6 && r.bodyKind !== "other");
  if (lowConf.length) {
    console.log(`\n=== НИЗКАЯ УВЕРЕННОСТЬ (<0.6, не other): ${lowConf.length} ===`);
    for (const r of lowConf.slice(0, 20)) {
      console.log(`  [${r.conf.toFixed(2)}] ${r.bodyKind} ← ${r.subject}`);
    }
  }

  const fs = await import("node:fs");
  fs.writeFileSync("/tmp/eval-classify.json", JSON.stringify(rows, null, 2));
  console.log(`\nПолный результат: /tmp/eval-classify.json (${rows.length} строк)`);
  process.exit(0);
}

void main();
