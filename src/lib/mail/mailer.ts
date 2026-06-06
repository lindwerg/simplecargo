import nodemailer from "nodemailer";

import { env } from "@/lib/env";
import { COMPANY } from "@/lib/config/company";

// Shared SMTP mailer (moved from finances/ — now used by statement delivery AND
// outbound RFQ to carriers). Configured via SMTP_URL/SMTP_FROM; absent →
// isEmailConfigured() is false and callers degrade to 501.

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_URL);
}

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface SendMailInput {
  to: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
  inReplyTo?: string; // RFC threading — set when replying within a thread
  references?: string[];
}

export interface SendMailResult {
  messageId: string; // RFC Message-ID of the sent mail — persisted for reply threading
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  if (!env.SMTP_URL) {
    throw new Error("SMTP не настроен");
  }
  const transport = nodemailer.createTransport(env.SMTP_URL);
  const info = await transport.sendMail({
    from: env.SMTP_FROM ?? `${COMPANY.shortName} <${COMPANY.email}>`,
    to: input.to.join(", "),
    subject: input.subject,
    text: input.text,
    ...(input.attachments ? { attachments: input.attachments } : {}),
    ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
    ...(input.references && input.references.length > 0 ? { references: input.references } : {}),
  });
  return { messageId: info.messageId };
}
