// PURE prompt builder for the client-request extractor (REQUESTS_SOURCING §11).
// No fetch / env — unit-testable. Builds the OpenRouter messages array per modality.

import type { ChatMessage, ContentPart } from "@/lib/ai/types";

export const SYSTEM_PROMPT = `Ты — ассистент железнодорожного экспедитора (РНС). Тебе дают запрос клиента на предоставление вагонов: таблицу, скриншот, текст или расшифровку голоса. Верни СТРОГО JSON-объект по схеме ниже, без markdown и пояснений.

Схема ответа:
{
  "clientGuess": string|null,        // название клиента, если есть в тексте/подсказке; иначе null
  "wagonType": string|null,          // тип вагона ("ПВ"/"полувагон"/"крытый"…) как написано; иначе null
  "periodFrom": string|null,         // ISO-дата "YYYY-MM-DD" начала периода; иначе null
  "periodTo": string|null,           // ISO-дата конца периода; иначе null
  "lines": [                          // по одной строке на каждый маршрут
    {
      "originRaw": string|null,       // станция отправления как написано
      "originRoadRaw": string|null,   // код дороги погрузки (СВР, ГОР, КБШ…)
      "destRaw": string|null,         // станция назначения как написано
      "destRoadRaw": string|null,     // код дороги назначения
      "cargoName": string|null,       // груз, если указан
      "etsngCode": string|null,       // код ЕТСНГ, только если явно указан
      "wagonsRequested": number|null, // число вагонов (из колонки "объём, ваг/мес" и т.п.)
      "tonnagePerWagon": number|null, // тонн на вагон, если указано
      "targetRatePerWagon": number|null, // желаемая клиентом ставка за вагон (число), если извлекается
      "targetRateRaw": string|null,   // ставка как написана ("1980", "1 980 ₽", "договорная")
      "wagonType": string|null,       // вид вагона на эту строку ("полувагон"/"цистерна"…); иначе null (наследуй из шапки)
      "targetRateKind": string|null,  // "flat_rub" | "tariff_indicative" | "tariff_plus_markup"; иначе null
      "targetRateMarkupPct": number|null, // наценка к тарифу в % (число, может быть 0); иначе null
      "targetTariffClass": number|null,   // тарифный класс груза 1|2|3, если указан; иначе null
      "targetTariffRef": string|null  // ссылка на тариф ("10-01"), если указан; иначе null
    }
  ],
  "warnings": string[]                // короткие заметки на русском о проблемах распознавания
}

ПРАВИЛА (соблюдай дословно):
1. ОДНА СТРОКА — ОДИН МАРШРУТ «станция отправления → станция назначения». Не объединяй маршруты.
2. ПРОТЯЖКА ПУСТОЙ СТАНЦИИ ОТПРАВЛЕНИЯ (forward-fill): если в строке таблицы пустая «станция/дорога погрузки», она ПОВТОРЯЕТ значение из ближайшей строки ВЫШЕ, где оно задано. Заполни originRaw и originRoadRaw этим унаследованным значением. Станция назначения у каждой строки своя.
3. ОТБРОСЬ ИТОГОВЫЕ СТРОКИ: «Итого», «Всего», «ВСЕГО», «Сумма», «Total» — это суммы, НЕ маршруты. Не включай их в lines.
4. ДОРОГИ — короткие коды РЖД (СВР, ГОР, СКВ, КБШ, ГРК, ОКТ, МСК, СЕВ и т.п.). Переноси код как есть. Не расшифровывай и не выдумывай код, которого нет.
5. НИКОГДА НЕ ВЫДУМЫВАЙ. Если значение не указано (груз, тоннаж, ставка, ЕТСНГ, период, тип вагона) — ставь null. Не подставляй «типичные» значения.
6. КОЛИЧЕСТВО ВАГОНОВ — целое число из колонки объёма. Если не указано — null.
7. СТАВКА — желаемая клиентом цена за вагон. targetRateRaw = строка как написано; targetRatePerWagon = число, если извлекается; иначе null.
8. КЛИЕНТ — если в тексте/подсказке есть название, верни в clientGuess; иначе null. Это только подсказка — оператор подтвердит вручную.
9. ПЕРИОД — если указан месяц/диапазон, верни ISO-даты; иначе null. Не выдумывай год.
10. Станции переноси как написано (включая «все станции») — не нормализуй, не выбирай ЭСР-код.
11. ВИД ВАГОНА НА СТРОКУ: распознавай вид вагона для каждой строки, если он указан (полувагон/платформа/крытый/цистерна/фитинговая платформа/хоппер/зерновоз/цементовоз/минераловоз…) → wagonType. Если у строки вид вагона не указан — оставь null (он будет унаследован из шапки wagonType). НЕ ВЫДУМЫВАЙ вид вагона.
12. СТАВКА — ФОРМА ВЫРАЖЕНИЯ:
    • если ставка задана как «+N% к тарифу 10-01» (или «индикатив», «от тарифа», «к Прейскуранту 10-01») → targetRateKind="tariff_indicative", targetRateMarkupPct=N (число, может быть 0), targetTariffRef="10-01" (или указанный код тарифа);
    • если просто рубли за вагон («1980», «1 980 ₽/ваг») → targetRateKind="flat_rub" и targetRatePerWagon=число;
    • если есть тарифный класс груза (1/2/3) → targetTariffClass=число;
    • НЕ ВЫДУМЫВАЙ: всё, что не указано (targetRateKind, targetRateMarkupPct, targetTariffClass, targetTariffRef) — null.
13. Если извлечь нечего — верни "lines": [] и причину в "warnings".`;

interface BuildArgs {
  clientHint?: string | undefined;
  text?: string | undefined;
  isTable?: boolean | undefined;
  imageDataUrl?: string | undefined;
  audioDataUrl?: string | undefined;
}

function hintLine(clientHint: string | undefined): string {
  return clientHint && clientHint.trim().length > 0
    ? `Клиент (подсказка оператора, может быть неточной): «${clientHint.trim()}».\n\n`
    : "";
}

/** Parse a `data:audio/<fmt>;base64,<data>` URL into { data, format } for input_audio. */
export function parseAudioDataUrl(dataUrl: string): { data: string; format: string } {
  const match = /^data:audio\/([a-z0-9.+-]+);base64,(.*)$/i.exec(dataUrl);
  if (!match) return { data: "", format: "wav" };
  const mime = match[1].toLowerCase();
  const format =
    mime === "mpeg" || mime === "mp3" ? "mp3" : mime === "x-m4a" || mime === "mp4" ? "m4a" : mime;
  return { data: match[2], format };
}

export function buildExtractionMessages(modality: "text" | "image" | "audio", args: BuildArgs): ChatMessage[] {
  const system: ChatMessage = { role: "system", content: SYSTEM_PROMPT };

  if (modality === "text") {
    const tablePrefix = args.isTable
      ? "[ТАБЛИЦА: пустые ячейки столбца отправления = повтор строки выше]\n\n"
      : "";
    const user: ChatMessage = {
      role: "user",
      content: `${hintLine(args.clientHint)}Извлеки строки запроса:\n\n${tablePrefix}${args.text ?? ""}`,
    };
    return [system, user];
  }

  if (modality === "image") {
    const parts: ContentPart[] = [
      {
        type: "text",
        text: `${hintLine(args.clientHint)}Это скриншот/фото запроса клиента. Извлеки строки маршрутов.`,
      },
      { type: "image_url", image_url: { url: args.imageDataUrl ?? "" } },
    ];
    return [system, { role: "user", content: parts }];
  }

  // audio
  const { data, format } = parseAudioDataUrl(args.audioDataUrl ?? "");
  const parts: ContentPart[] = [
    {
      type: "text",
      text: `${hintLine(args.clientHint)}Это голосовое сообщение с запросом клиента. Расшифруй и извлеки строки маршрутов.`,
    },
    { type: "input_audio", input_audio: { data, format } },
  ];
  return [system, { role: "user", content: parts }];
}
