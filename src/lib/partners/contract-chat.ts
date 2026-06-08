// ИИ-чат по договору контрагента. Документ (PDF/скан) отдаётся модели напрямую —
// Gemini читает PDF и сканы нативно (решение оператора: Gemini 2.5 Flash, ничего
// доустанавливать не нужно). Чат эфемерный: историю присылает клиент, в БД не пишем.

import { chatCompletion } from "@/lib/ai/openrouter";
import type { ChatMessage, ChatRequest, ContentPart } from "@/lib/ai/types";
import { getDocument, PartnerError } from "./repository";
import { readStoredFile } from "@/lib/storage/files";

const DEFAULT_MODEL = "google/gemini-2.5-flash";
const MAX_HISTORY = 10; // последние реплики — держим стоимость токенов в узде
const MAX_QUESTION = 2000;

// Gemini принимает напрямую PDF (file part) и изображения (image_url part).
// DOC/DOCX/XLS модель так не прочитает — просим конвертировать в PDF.
const PDF_MIME = "application/pdf";
const IMAGE_MIME = new Set(["image/jpeg", "image/png"]);

export interface ContractChatTurn {
  role: "user" | "assistant";
  content: string;
}

function modelForContract(): string {
  return process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
}

function systemPrompt(): string {
  return [
    "Ты — ассистент-юрист транспортно-экспедиторской компании. Тебе дан текст",
    "договора с контрагентом (файл во вложении). Отвечай на вопросы СТРОГО по",
    "содержанию этого договора: ставки, сроки оплаты, штрафы, ответственность,",
    "реквизиты, условия расторжения и т.п.",
    "Правила:",
    "— Отвечай по-русски, кратко и по делу, со ссылкой на пункт договора, если он есть.",
    "— Если в договоре нет ответа на вопрос — прямо скажи «В договоре это не указано».",
    "— Ничего не выдумывай и не делай предположений вне текста договора.",
  ].join(" ");
}

// Builds a data-URL the model can read directly. Throws a friendly PartnerError on
// an unsupported type (e.g. a .docx contract — ask the operator to upload a PDF).
function buildFilePart(
  mimeType: string,
  filename: string,
  bytes: Buffer,
): ContentPart {
  const base64 = bytes.toString("base64");
  if (mimeType === PDF_MIME) {
    return { type: "file", file: { filename, file_data: `data:${mimeType};base64,${base64}` } };
  }
  if (IMAGE_MIME.has(mimeType)) {
    return { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } };
  }
  throw new PartnerError(
    422,
    "Этот формат договора нельзя прочитать ИИ. Загрузите договор в PDF (или фото/скан JPG/PNG).",
  );
}

/**
 * Answer one question about a contract document belonging to the partner. The
 * document is attached to the latest user turn; prior turns are passed as plain
 * text for context. Returns the model's answer. Throws AiError (transport) or
 * PartnerError (404/422) for the route to map.
 */
export async function answerContractQuestion(args: {
  partnerId: string;
  documentId: string;
  question: string;
  history?: ContractChatTurn[];
}): Promise<string> {
  const question = args.question.trim().slice(0, MAX_QUESTION);
  if (question.length === 0) throw new PartnerError(422, "Пустой вопрос");

  const doc = await getDocument(args.documentId);
  if (!doc || doc.counterpartyId !== args.partnerId) {
    throw new PartnerError(404, "Документ не найден");
  }

  const bytes = await readStoredFile(doc.storageKey);
  const filePart = buildFilePart(doc.mimeType, doc.originalFilename, bytes);

  const historyMessages: ChatMessage[] = (args.history ?? [])
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, content: t.content }));

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt() },
    ...historyMessages,
    { role: "user", content: [filePart, { type: "text", text: question }] },
  ];

  const request: ChatRequest = {
    model: modelForContract(),
    temperature: 0.1,
    max_tokens: 1200,
    messages,
  };

  return chatCompletion(request, { timeoutMs: 90_000 });
}
