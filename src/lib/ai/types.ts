// PURE OpenRouter chat/completions request/response types. No fetch, no env —
// safe to import from pure prompt builders and from the impure client alike.

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image_url";
  image_url: { url: string };
}

export interface AudioPart {
  type: "input_audio";
  input_audio: { data: string; format: string };
}

// PDF/файл напрямую модели (OpenRouter file input). file_data — data-URL
// «data:application/pdf;base64,…». Gemini читает PDF нативно, включая сканы.
export interface FilePart {
  type: "file";
  file: { filename: string; file_data: string };
}

export type ContentPart = TextPart | ImagePart | AudioPart | FilePart;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  modalities?: string[];
  // OpenRouter file-parser plugin (опц.): движок разбора PDF. По умолчанию
  // OpenRouter использует нативный разбор модели (Gemini читает PDF/скан сам).
  plugins?: Array<{ id: string; pdf?: { engine: string } }>;
}

export interface ChatChoice {
  index: number;
  message: { role: string; content: string | null };
  finish_reason: string | null;
}

export interface ChatResponse {
  id?: string;
  model?: string;
  choices: ChatChoice[];
}
