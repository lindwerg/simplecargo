// One-shot backfill of the known_email_contacts directory (MAIL_AI_INTEGRATION
// §6.5 / Фаза 7). Walks INBOX + Sent on mail.ru reading ONLY envelopes (no body
// download — cheap) and upserts every From/To/Cc address. Run once after the
// mailbox is connected:  pnpm seed:known-emails
//
// Requires MAILRU_IMAP_USER / MAILRU_IMAP_APP_PASSWORD. Idempotent.

import { ImapFlow } from "imapflow";

import { env } from "@/lib/env";
import { upsertKnownEmail, type SeenAddress } from "@/lib/mail/known-emails";

const SENT_CANDIDATES = ["Sent", "Отправленные", "INBOX.Sent", "[Gmail]/Sent Mail"];

function makeClient(): ImapFlow {
  return new ImapFlow({
    host: env.MAILRU_IMAP_HOST,
    port: env.MAILRU_IMAP_PORT,
    secure: true,
    auth: { user: env.MAILRU_IMAP_USER!, pass: env.MAILRU_IMAP_APP_PASSWORD! },
    logger: false,
    clientInfo: { name: "SimpleCargo-seed", version: "1.0" },
  });
}

interface AddrLike {
  address?: string;
  name?: string;
}

function pick(list: AddrLike[] | undefined): AddrLike[] {
  return Array.isArray(list) ? list : [];
}

async function harvestFolder(
  client: ImapFlow,
  folder: string,
  direction: "incoming" | "outgoing",
): Promise<number> {
  let count = 0;
  const lock = await client.getMailboxLock(folder).catch(() => null);
  if (!lock) return 0;
  try {
    for await (const msg of client.fetch("1:*", { envelope: true })) {
      const env_ = msg.envelope;
      if (!env_) continue;
      const subject = env_.subject ?? null;
      const addrs: AddrLike[] =
        direction === "incoming"
          ? [...pick(env_.from), ...pick(env_.cc)]
          : [...pick(env_.to), ...pick(env_.cc)];
      for (const a of addrs) {
        if (!a.address) continue;
        const seen: SeenAddress = {
          email: a.address,
          name: a.name ?? null,
          direction,
          subject,
        };
        await upsertKnownEmail(seen);
        count += 1;
      }
    }
  } finally {
    lock.release();
  }
  return count;
}

async function main(): Promise<void> {
  if (!env.MAILRU_IMAP_USER || !env.MAILRU_IMAP_APP_PASSWORD) {
    console.error("Нужны MAILRU_IMAP_USER и MAILRU_IMAP_APP_PASSWORD");
    process.exit(1);
  }
  const client = makeClient();
  await client.connect();
  try {
    const inbox = await harvestFolder(client, env.MAILRU_IMAP_INBOX, "incoming");
    console.log(`INBOX: обработано адресов ${inbox}`);

    let sentDone = false;
    for (const f of SENT_CANDIDATES) {
      const exists = await client.status(f, { messages: true }).catch(() => null);
      if (exists) {
        const n = await harvestFolder(client, f, "outgoing");
        console.log(`${f}: обработано адресов ${n}`);
        sentDone = true;
        break;
      }
    }
    if (!sentDone) console.warn("Папка «Отправленные» не найдена — пропущена");
  } finally {
    await client.logout().catch(() => {});
  }
  console.log("Готово: справочник адресов наполнен.");
  process.exit(0);
}

void main();
