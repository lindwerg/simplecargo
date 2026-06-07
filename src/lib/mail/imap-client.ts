// NODE-ONLY mail.ru IMAP client for the worker (MAIL_AI_INTEGRATION §3). Poll-based
// (mail.ru has no push and unreliable IDLE). Fetches raw messages with UID > cursor,
// parses MIME via mailparser (iconv handles Cyrillic charsets), and exposes a
// best-effort MOVE-to-processed. Only ever imported by src/worker — never the web bundle.

import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";

import { env } from "@/lib/env";
import type { MailAttachmentInput, ParsedEmail } from "@/lib/mail-intake/types";

export function isImapConfigured(): boolean {
  return Boolean(env.MAILRU_IMAP_USER && env.MAILRU_IMAP_APP_PASSWORD);
}

function makeClient(): ImapFlow {
  return new ImapFlow({
    host: env.MAILRU_IMAP_HOST,
    port: env.MAILRU_IMAP_PORT,
    secure: true, // implicit TLS on 993
    auth: { user: env.MAILRU_IMAP_USER!, pass: env.MAILRU_IMAP_APP_PASSWORD! },
    logger: false,
    clientInfo: { name: "SimpleCargo", version: "1.0" },
  });
}

function addresses(obj: AddressObject | AddressObject[] | undefined): string[] {
  if (!obj) return [];
  const list = Array.isArray(obj) ? obj : [obj];
  return list.flatMap((a) => a.value.map((v) => v.address ?? "").filter((s) => s.length > 0));
}

export interface FetchedEmail {
  uid: number;
  raw: Buffer;
  parsed: ParsedEmail;
}

export interface FetchResult {
  uidValidity: number;
  highestUid: number;
  emails: FetchedEmail[];
}

/** Fetch messages with UID > lastSeenUid from the inbox. Opens + closes its own
 *  connection (AI processing happens after, so we don't hold the IMAP lock). */
export async function fetchNewEmails(lastSeenUid: number): Promise<FetchResult> {
  const client = makeClient();
  await client.connect();
  const emails: FetchedEmail[] = [];
  let uidValidity = 0;
  let highestUid = lastSeenUid;

  const lock = await client.getMailboxLock(env.MAILRU_IMAP_INBOX);
  try {
    const mb = client.mailbox;
    uidValidity = mb && typeof mb !== "boolean" ? Number(mb.uidValidity) : 0;

    const range = `${lastSeenUid + 1}:*`;
    for await (const msg of client.fetch(range, { source: true }, { uid: true })) {
      const uid = Number(msg.uid);
      if (uid <= lastSeenUid || !msg.source) continue;
      const raw = msg.source as Buffer;
      const p = await simpleParser(raw);
      const fromAddr = addresses(p.from);
      const parsed: ParsedEmail = {
        from: fromAddr[0] ?? "",
        fromName: p.from?.value?.[0]?.name ?? null,
        subject: p.subject ?? "",
        text: p.text ?? "",
        html: typeof p.html === "string" ? p.html : null,
        messageId: p.messageId ?? "",
        inReplyTo: p.inReplyTo ?? null,
        references: p.references ? (Array.isArray(p.references) ? p.references : [p.references]) : [],
        date: p.date ?? null,
        to: addresses(p.to),
        cc: addresses(p.cc),
        attachments: (p.attachments ?? []).map(
          (a): MailAttachmentInput => ({
            filename: a.filename ?? "attachment",
            contentType: a.contentType ?? "application/octet-stream",
            size: a.size ?? a.content.length,
            content: a.content,
            cid: a.cid ?? null,
            inline: a.contentDisposition === "inline" || Boolean(a.related),
          }),
        ),
      };
      emails.push({ uid, raw, parsed });
      if (uid > highestUid) highestUid = uid;
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }

  return { uidValidity, highestUid, emails };
}

/** Lightweight high-water mark — reads UIDVALIDITY + UIDNEXT without fetching any
 *  message. Used on first-ever run to seed the cursor so we DON'T reprocess the
 *  whole historical inbox (only mail arriving after deployment). */
export async function getInboxStatus(): Promise<{ uidValidity: number; highestUid: number }> {
  const client = makeClient();
  await client.connect();
  try {
    const st = await client.status(env.MAILRU_IMAP_INBOX, { uidNext: true, uidValidity: true });
    const uidValidity = Number(st.uidValidity ?? 0);
    const uidNext = Number(st.uidNext ?? 1);
    return { uidValidity, highestUid: Math.max(0, uidNext - 1) };
  } finally {
    await client.logout().catch(() => {});
  }
}

/** Best-effort: move processed messages to the Processed folder and mark seen. */
export async function markProcessed(uids: number[]): Promise<void> {
  if (uids.length === 0) return;
  const client = makeClient();
  try {
    await client.connect();
    const lock = await client.getMailboxLock(env.MAILRU_IMAP_INBOX);
    try {
      const seq = uids.join(",");
      await client.messageFlagsAdd(seq, ["\\Seen"], { uid: true });
      try {
        await client.messageMove(seq, env.MAILRU_IMAP_PROCESSED_FOLDER, { uid: true });
      } catch {
        // Processed folder may not exist yet — create and retry once
        await client.mailboxCreate(env.MAILRU_IMAP_PROCESSED_FOLDER).catch(() => {});
        await client.messageMove(seq, env.MAILRU_IMAP_PROCESSED_FOLDER, { uid: true }).catch(() => {});
      }
    } finally {
      lock.release();
    }
  } catch (error: unknown) {
    console.error("[imap] markProcessed failed:", error instanceof Error ? error.message : error);
  } finally {
    await client.logout().catch(() => {});
  }
}
