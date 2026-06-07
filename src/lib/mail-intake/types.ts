// PURE shared types for the inbound-mail intake layer (MAIL_AI_INTEGRATION §4).
// No IMAP / fetch / DB here — the worker parses raw email into ParsedEmail and
// hands it to the orchestrator. Everything downstream speaks these types.

export interface MailAttachmentInput {
  filename: string;
  contentType: string; // mime, e.g. "application/pdf"
  size: number; // bytes
  content: Buffer; // raw decoded bytes (worker supplies; tests supply fixtures)
  cid?: string | null; // RFC 2392 Content-ID для inline-картинок в HTML-теле
  inline?: boolean; // true = встроено в тело (related part), не «настоящее» вложение
}

export interface ParsedEmail {
  from: string; // sender address
  fromName?: string | null; // display name from header, if any
  subject: string;
  text: string; // plain-text body (mailparser-decoded)
  html?: string | null; // HTML-тело (для просмотра 1:1), если есть
  messageId: string; // RFC Message-ID — idempotency + threading
  inReplyTo?: string | null; // RFC In-Reply-To — links a carrier reply to our RFQ
  references?: string[]; // RFC References thread chain (newest last)
  date?: Date | null;
  to?: string[];
  cc?: string[];
  attachments: MailAttachmentInput[];
}
