// Сохранение ОРИГИНАЛОВ письма у нас: сырое .eml, HTML-тело, текст и вложения
// (включая inline-картинки). Канонично — в object storage (Railway Bucket); если
// бакет не настроен, всё падает на Postgres bytea (см. attachments-repo). Вызывается
// воркером один раз на новое письмо. NODE-only.

import { saveIngestedAttachment } from "@/lib/mail-intake/attachments-repo";
import {
  emailAttachmentKey,
  emailHtmlKey,
  emailRawKey,
  isObjectStoreConfigured,
  putObject,
} from "@/lib/storage/object-store";
import { makeSnippet } from "@/lib/mail-intake/snippet";
import type { ParsedEmail } from "@/lib/mail-intake/types";
import { setIngestedFileBodyPreview, setIngestedFileStorage } from "./intake-repo";

export async function storeEmailOriginals(opts: {
  fileId: string;
  sha: string;
  raw: Buffer;
  parsed: ParsedEmail;
}): Promise<void> {
  const { fileId, sha, raw, parsed } = opts;
  const hasHtml = Boolean(parsed.html && parsed.html.trim().length > 0);

  let storageKey: string | null = null;
  let htmlStorageKey: string | null = null;

  if (isObjectStoreConfigured()) {
    // сырое .eml — для «скачать оригинал» и повторного разбора
    try {
      await putObject(emailRawKey(sha), raw, "message/rfc822");
      storageKey = emailRawKey(sha);
    } catch {
      /* best-effort */
    }
    if (hasHtml) {
      try {
        await putObject(emailHtmlKey(sha), Buffer.from(parsed.html!, "utf8"), "text/html; charset=utf-8");
        htmlStorageKey = emailHtmlKey(sha);
      } catch {
        /* best-effort */
      }
    }
  } else if (hasHtml) {
    // без бакета HTML кладём как вложение-тело (bytea), чтобы просмотр 1:1 работал
    await saveIngestedAttachment({
      sourceFileId: fileId,
      kind: "body",
      filename: "Письмо.html",
      mimeType: "text/html; charset=utf-8",
      content: Buffer.from(parsed.html!, "utf8"),
      objectKey: emailHtmlKey(sha),
    });
  }

  // текст письма — для открытия оператором (и как запасной вид без HTML)
  if (parsed.text && parsed.text.trim().length > 0) {
    await saveIngestedAttachment({
      sourceFileId: fileId,
      kind: "body",
      filename: "Текст письма.txt",
      mimeType: "text/plain; charset=utf-8",
      content: Buffer.from(parsed.text, "utf8"),
      objectKey: `emails/${sha}/body.txt`,
    });
  }

  // вложения (включая inline-картинки cid)
  let i = 0;
  for (const att of parsed.attachments) {
    await saveIngestedAttachment({
      sourceFileId: fileId,
      kind: "attachment",
      filename: att.filename,
      mimeType: att.contentType,
      content: att.content,
      objectKey: emailAttachmentKey(sha, i, att.filename),
      isInline: att.inline ?? false,
      contentId: att.cid ?? null,
    });
    i += 1;
  }

  if (storageKey || htmlStorageKey) {
    await setIngestedFileStorage(fileId, { storageKey, htmlStorageKey });
  }

  // сниппет тела — чтобы в списке «Входящих» сразу видеть суть письма
  await setIngestedFileBodyPreview(fileId, makeSnippet(parsed.text, parsed.html));
}
