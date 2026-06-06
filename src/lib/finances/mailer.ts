import nodemailer from "nodemailer";

import { env } from "@/lib/env";
import { COMPANY } from "@/lib/config/company";

// Optional SMTP mailer for statement delivery. Configured via SMTP_URL/SMTP_FROM;
// absent → isEmailConfigured() is false and routes degrade to 501.

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
}

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!env.SMTP_URL) {
    throw new Error("SMTP не настроен");
  }
  const transport = nodemailer.createTransport(env.SMTP_URL);
  await transport.sendMail({
    from: env.SMTP_FROM ?? `${COMPANY.shortName} <${COMPANY.email}>`,
    to: input.to.join(", "),
    subject: input.subject,
    text: input.text,
    ...(input.attachments ? { attachments: input.attachments } : {}),
  });
}
