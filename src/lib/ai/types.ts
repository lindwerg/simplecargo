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

export type ContentPart = TextPart | ImagePart | AudioPart;

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
