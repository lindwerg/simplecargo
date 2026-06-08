// PURE-промпт для голосового быстрого расчёта тарифа. Без fetch/env — тестируемо.
// Строит messages для OpenRouter: расшифровка речи + извлечение намерения {откуда, куда,
// наценка%, г/п, груз}. Аудио разбирается через parseAudioDataUrl (переиспользуем из requests).

import type { ChatMessage, ContentPart } from "@/lib/ai/types";
import { parseAudioDataUrl } from "@/lib/requests/prompt";

export const VOICE_SYSTEM_PROMPT = `Ты — ассистент железнодорожного экспедитора. Тебе дают короткую голосовую команду «посчитать тариф» (расшифровку или аудио). Верни СТРОГО JSON-объект по схеме ниже, без markdown и пояснений.

Схема ответа:
{
  "originRaw": string|null,          // станция отправления как названа (без нормализации, без ЭСР-кода)
  "destRaw": string|null,            // станция назначения как названа
  "markupPct": number|null,          // наценка предоставления к тарифу, в процентах; null если не названа
  "classicCapacityT": number|null,   // грузоподъёмность обычного полувагона в тоннах, если названа; иначе null
  "innovativeCapacityT": number|null,// грузоподъёмность инновационного полувагона в тоннах, если названа; иначе null
  "etsngHint": string|null,          // груз, если назван; иначе null
  "transcript": string               // полная расшифровка фразы на русском
}

ПРАВИЛА (соблюдай дословно):
1. СТАНЦИИ переноси как услышано, в именительном падеже («со станции Асбест на станцию Голышманово» → originRaw="Асбест", destRaw="Голышманово»). НЕ нормализуй, НЕ выбирай ЭСР-код, НЕ выдумывай.
2. НАЦЕНКА ПРЕДОСТАВЛЕНИЯ: «предоставление под +15», «плюс 15 процентов», «наценка 15», «под 15» → markupPct=15. Бери только число процентов. Если не названа — null.
3. ГРУЗОПОДЪЁМНОСТЬ: если названы тонны («по 69 и 74», «обычный 70, инновационный 75») — меньшая обычно обычный полувагон (classicCapacityT), большая — инновационный (innovativeCapacityT). Если названа одна цифра без уточнения — положи в classicCapacityT. Если не названо — оба null.
4. ГРУЗ: если назван («щебень», «песок», «уголь») — в etsngHint как услышано. Если не назван — null (НЕ подставляй «щебень» сам).
5. НИКОГДА НЕ ВЫДУМЫВАЙ. Чего нет во фразе — null.
6. transcript — всегда полная расшифровка услышанного, даже если что-то не извлеклось.`;

interface BuildArgs {
  text?: string | undefined;
  audioDataUrl?: string | undefined;
}

/** Build OpenRouter messages for the voice-intent parse (text or audio modality). */
export function buildVoiceMessages(
  modality: "text" | "audio",
  args: BuildArgs,
): ChatMessage[] {
  const system: ChatMessage = { role: "system", content: VOICE_SYSTEM_PROMPT };

  if (modality === "text") {
    const user: ChatMessage = {
      role: "user",
      content: `Команда оператора (расшифровка):\n\n${args.text ?? ""}`,
    };
    return [system, user];
  }

  const { data, format } = parseAudioDataUrl(args.audioDataUrl ?? "");
  const parts: ContentPart[] = [
    {
      type: "text",
      text: "Это голосовая команда «посчитать тариф». Расшифруй и извлеки намерение по схеме.",
    },
    { type: "input_audio", input_audio: { data, format } },
  ];
  return [system, { role: "user", content: parts }];
}
