// Bridge a recognized mail part → the EXISTING ExtractInput so we reuse
// requests/extraction.ts unchanged (MAIL_AI_INTEGRATION §4.2). The category
// decider is PURE (unit-tested); the converter is async (xlsx/pdf decode) and
// Node-only via pdf.ts. Scan PDFs and unsupported types route to quarantine.

import { xlsxToText } from "@/lib/requests/xlsx";
import type { ExtractInput } from "@/lib/requests/schema";
import { pdfToText } from "./pdf";
import type { MailAttachmentInput } from "./types";

export type PartCategory = "xlsx" | "image" | "pdf" | "audio" | "text" | "unsupported";

const IMAGE_MIME = /^image\/(png|jpe?g|webp)$/i;
const AUDIO_MIME = /^audio\/(wav|mpeg|mp3|webm|ogg|m4a|mp4)$/i;

/** PURE: decide how to handle an attachment from its filename + mime. */
export function decidePartCategory(filename: string, mime: string): PartCategory {
  const name = filename.toLowerCase();
  const m = mime.toLowerCase();
  if (m.includes("spreadsheet") || /\.xlsx?$/.test(name)) return "xlsx";
  if (m === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (IMAGE_MIME.test(m) || /\.(png|jpe?g|webp)$/.test(name)) return "image";
  if (AUDIO_MIME.test(m) || /\.(wav|mp3|m4a|ogg|webm)$/.test(name)) return "audio";
  if (m.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".csv")) return "text";
  return "unsupported";
}

function imageMimeFor(category: "image", filename: string, mime: string): string {
  if (IMAGE_MIME.test(mime)) return mime.toLowerCase();
  if (/\.png$/i.test(filename)) return "image/png";
  if (/\.webp$/i.test(filename)) return "image/webp";
  return "image/jpeg";
}

function audioMimeFor(filename: string, mime: string): string {
  if (AUDIO_MIME.test(mime)) return mime.toLowerCase();
  if (/\.mp3$/i.test(filename)) return "audio/mpeg";
  if (/\.m4a$/i.test(filename)) return "audio/m4a";
  if (/\.ogg$/i.test(filename)) return "audio/ogg";
  return "audio/wav";
}

export type ConvertOutcome =
  | { ok: true; input: ExtractInput }
  | { ok: false; reason: "scan_pdf" | "unsupported"; detail: string };

/** Async: convert an attachment to an ExtractInput, or report why it can't. */
export async function attachmentToExtractInput(
  att: MailAttachmentInput,
  clientHint?: string,
): Promise<ConvertOutcome> {
  const category = decidePartCategory(att.filename, att.contentType);
  const ab = att.content.buffer.slice(
    att.content.byteOffset,
    att.content.byteOffset + att.content.byteLength,
  ) as ArrayBuffer;

  switch (category) {
    case "xlsx": {
      const text = await xlsxToText(ab);
      return { ok: true, input: { modality: "text", text, isTable: true, clientHint } };
    }
    case "text": {
      const text = att.content.toString("utf8");
      return { ok: true, input: { modality: "text", text, clientHint } };
    }
    case "image": {
      const mime = imageMimeFor("image", att.filename, att.contentType);
      const dataUrl = `data:${mime};base64,${att.content.toString("base64")}`;
      return { ok: true, input: { modality: "image", dataUrl, clientHint } };
    }
    case "audio": {
      const mime = audioMimeFor(att.filename, att.contentType);
      const dataUrl = `data:${mime};base64,${att.content.toString("base64")}`;
      return { ok: true, input: { modality: "audio", dataUrl, clientHint } };
    }
    case "pdf": {
      const res = await pdfToText(ab);
      if (res.kind === "scan") {
        return { ok: false, reason: "scan_pdf", detail: "Скан-PDF без текста — нужен ручной разбор" };
      }
      return { ok: true, input: { modality: "text", text: res.text, clientHint } };
    }
    default:
      return { ok: false, reason: "unsupported", detail: `Тип не поддержан: ${att.contentType}` };
  }
}

/** Body text → ExtractInput (trivial, kept here for symmetry). */
export function bodyToExtractInput(text: string, clientHint?: string): ExtractInput {
  return { modality: "text", text, clientHint };
}
