// PURE shared types for the inbound-mail intake layer (MAIL_AI_INTEGRATION §4).
// No IMAP / fetch / DB here — the worker parses raw email into ParsedEmail and
// hands it to the orchestrator. Everything downstream speaks these types.

export interface MailAttachmentInput {
  filename: string;
  contentType: string; // mime, e.g. "application/pdf"
  size: number; // bytes
  content: Buffer; // raw decoded bytes (worker supplies; tests supply fixtures)
}

export interface ParsedEmail {
  from: string; // sender address
  fromName?: string | null; // display name from header, if any
  subject: string;
  text: string; // plain-text body (mailparser-decoded)
  messageId: string; // RFC Message-ID — idempotency + threading
  date?: Date | null;
  to?: string[];
  cc?: string[];
  attachments: MailAttachmentInput[];
}
