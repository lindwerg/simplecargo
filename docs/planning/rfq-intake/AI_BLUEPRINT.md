# AI Intake Blueprint — `POST /api/requests/extract`

> **Scope:** the OpenRouter extraction pipeline for the **Запросы** tab. Turns a client RFQ
> (pasted text / screenshot image / XLSX file / voice memo) into a structured
> `{ clientGuess, period, wagonType, lines[], warnings[] }` payload the operator confirms into
> `requests` + `request_lines` (REQUESTS_SOURCING.md §11). **This slice never touches money,
> owner-sourcing, coverage, margin, or counterparty rows** — it only emits a *suggestion* object.
>
> **Source-of-truth precedence:** `REQUESTS_SOURCING.md` §11 (intake) + house conventions > this doc.
> **Locked decisions honored:** D10 (extract once per file), D15 (never invent ESR — keep raw),
> D16 (client never auto-confirmed — `clientGuess` is a hint into `client_suggested_id` only).

---

## 0. Verified facts (read from the repo, not assumed)

| Fact | Source |
|---|---|
| `OPENROUTER_API_KEY` is `z.string().min(1).optional()`; `OPENROUTER_MODEL` defaults `google/gemini-2.5-flash`. | `src/lib/env-schema.ts:17-20` |
| Read the key **directly** from `process.env.OPENROUTER_API_KEY`, NOT the `env` singleton (the singleton calls `loadEnv()` and the eager import would couple pure modules to env). Mirror `src/lib/db/seed-user.ts:13-14` reading `process.env.*` directly. | `src/lib/env.ts:9`, `seed-user.ts` |
| API envelope: `apiOk(data,status)` / `apiFail(msg,status)`. Handler idiom: `requireWriter(headers)` → `try/catch (AuthError → apiFail)` → `safeParse` → repository. `runtime="nodejs"`, `dynamic="force-dynamic"`. | `src/lib/api/response.ts`, `src/lib/api/session.ts`, `src/app/api/price-protocols/route.ts` |
| Roads are RZD short codes on `roads.shortCode` (`СВР`,`ГОР`,`СКВ`,…); `shortCode` is **NOT unique** ("codes drift"). Resolution to `rzd_code` happens later, not in the extractor. | `src/lib/db/schema/geo.ts:6-15` |
| `request_lines` shape (the card's load-bearing fields): `originRaw`(notNull), `originRoadRaw`, `destRaw`(notNull), `destRoadRaw`, `originEsr`/`destEsr` nullable, `cargoName`, `etsngCode`, `wagonsRequested`(int notNull), `tonnagePerWagon`(numeric), `targetRatePerWagon`(numeric), `targetRateRaw`(text). | prompt spec + REQUESTS_SOURCING §11 |
| Zod is v4 (`zod@^4.4.3`), tests are vitest, pure modules must NOT import `@/lib/db/client`. | `package.json`, house conventions |
| **No** sheet/audio lib is installed yet. `xlsx` (SheetJS) must be **added** and dynamically imported server-side only. | `package.json` deps |

---

## 1. Module plan (PURE vs IMPURE)

Organize by feature; many small files (house style). Pure = no `@/lib/db/client`, no `fetch`, no
`process.env` → unit-tested with vitest. Impure = network/env → integration-tested, skipped when key absent.

```
src/lib/ai/
├── openrouter.ts            IMPURE  thin chat/completions client (fetch, reads process.env directly,
│                                    timeout, throws typed AiError; NO domain knowledge)
├── openrouter.types.ts      PURE    request/response TS types (ChatMessage, ContentPart, ChatRequest…)
└── ai-error.ts              PURE    AiError class + AiErrorCode union (key_absent|timeout|http|parse|empty)

src/lib/requests/
├── extraction.ts            IMPURE  orchestrator: pick modality → build request → call openrouter
│                                    → parse → repair-retry once. The ONLY file wiring pure+impure.
├── extraction.prompt.ts     PURE    SYSTEM_PROMPT (RU) + buildMessages(modality, payload) per modality
├── extraction.schema.ts     PURE    zod output contract (ExtractionResult) + input request zod
├── extraction.normalize.ts  PURE    forward-fill blank origins, drop Итого/total rows,
│                                    road-code normalization, rate/number coercion, line clamps
├── extraction.parse.ts      PURE    parseModelJson(raw) → repair instruction string on failure
├── xlsx-to-text.ts          IMPURE  dynamic import('xlsx') → SheetJS → TSV string (server-only)
└── *.test.ts                PURE    normalize + parse + prompt-builder unit tests (план-на-Июнь golden)
```

**Why this split:** `extraction.normalize.ts` carries the forward-fill / drop-totals / road-norm logic
the spec calls out as the highest-value, most-bug-prone code — it must be pure and pinned to the golden
fixture (§5). The network call (`openrouter.ts`) and XLSX parse (`xlsx-to-text.ts`) are thin and impure;
they hold no domain rules. `extraction.ts` is the single seam that imports both worlds.

---

## 2. Four-modality input handling — `POST /api/requests/extract`

One endpoint, two content types:

- **`application/json`** for `text`, `image` (data URL), `audio` (data URL). Body:
  `{ modality: "text"|"image"|"audio", text?: string, dataUrl?: string, clientHint?: string }`.
- **`multipart/form-data`** for file uploads (XLSX/XLS, or an image file): fields
  `file` (Blob), `modality` ("xlsx"|"image"), optional `clientHint`.

The route detects `Content-Type`, normalizes XLSX→TSV server-side, then funnels everything into
`extractRequest({ modality, payloadText | imageDataUrl | audioDataUrl, clientHint })`.

### Input zod (in `extraction.schema.ts`)

```ts
import { z } from "zod";

const MAX_TEXT_CHARS = 200_000;          // ~50k tokens guard
const DATA_URL_RE = /^data:(image\/(png|jpe?g|webp)|audio\/(wav|mpeg|mp3|webm|ogg|m4a));base64,/;

export const extractInputSchema = z.discriminatedUnion("modality", [
  z.object({ modality: z.literal("text"),  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
             clientHint: z.string().trim().max(200).optional() }),
  z.object({ modality: z.literal("image"), dataUrl: z.string().regex(DATA_URL_RE, "Ожидается image data URL"),
             clientHint: z.string().trim().max(200).optional() }),
  z.object({ modality: z.literal("audio"), dataUrl: z.string().regex(DATA_URL_RE, "Ожидается audio data URL"),
             clientHint: z.string().trim().max(200).optional() }),
  // xlsx arrives as multipart → route converts file→TSV → re-enters as modality:"text"
]);
export type ExtractInput = z.infer<typeof extractInputSchema>;
```

> **XLSX path:** the route parses the file to TSV via `xlsxToText()` and **re-dispatches as `modality:"text"`**
> with a marker prefix so the prompt knows it is a spreadsheet (helps the model treat blank cells as forward-fill).
> This keeps the model contract to 3 real modalities (text/image/audio) — XLSX is text after server normalization.

### (a) TEXT — exact OpenRouter request JSON

```jsonc
{
  "model": "google/gemini-2.5-flash",
  "temperature": 0,
  "response_format": { "type": "json_object" },
  "max_tokens": 4096,
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT — see §3.2>" },
    { "role": "user", "content": "Клиент (подсказка оператора, может быть пустой): «ЖелДорАльянс».\n\nИзвлеки строки запроса из таблицы ниже:\n\nст.погрузки\tдорога погрузки\tст.назначения\tдорога назначения\tобъем, ваг/мес\nТеплая гора\tСВР\tШемордан\tГОР\t200\n\tГОР\tЙошкар-Ола\tГОР\t50\n..." }
  ]
}
```

### (b) IMAGE — `image_url` content part (base64 data URL)

```jsonc
{
  "model": "google/gemini-2.5-flash",
  "temperature": 0,
  "response_format": { "type": "json_object" },
  "max_tokens": 4096,
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT>" },
    { "role": "user", "content": [
      { "type": "text", "text": "Это скриншот запроса клиента. Клиент-подсказка: «ЖелДорАльянс». Извлеки строки." },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,iVBORw0KGgo..." } }
    ]}
  ]
}
```

`google/gemini-2.5-flash` accepts text+image — no model switch needed.

### (c) XLSX / XLS — server-only SheetJS → TSV, then the TEXT request (a)

**Lib recommendation: `xlsx` (SheetJS).** openpyxl is Python-only and irrelevant here. SheetJS must stay
**out of the client bundle** — only ever imported via `await import("xlsx")` inside `xlsx-to-text.ts`,
which is reachable only from the Node route handler (`runtime = "nodejs"`). Never import it from a
`"use client"` component or a shared util that a client module pulls in.

```ts
// src/lib/requests/xlsx-to-text.ts  (IMPURE: dynamic import, Node-only)
export async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");                       // dynamic → excluded from client/edge bundle
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];               // first sheet (план на … is sheet 1)
  // TSV preserves empty cells as empty fields → the model/normalizer can forward-fill blanks
  return XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
}
```

The route prefixes the TSV with `"[ТАБЛИЦА XLSX, пустые ячnейки = повтор строки выше]\n"` then calls the
text request (a). Forward-fill + Итого-drop happen in the **pure normalizer** (§4), not in the model trust path.

### (d) AUDIO — `input_audio` content part + model switch

OpenRouter audio uses an `input_audio` content part with **base64 (no data-URL prefix)** + a `format` field.
`gemini-2.5-flash` does **not** reliably accept `input_audio`; use an audio-capable model. **Recommended:
`google/gemini-2.5-flash` is text+image only → switch to `google/gemini-2.0-flash-001` audio path is unreliable;
use `openai/gpt-4o-audio-preview`** (verified `input_audio` support on OpenRouter) via an
`OPENROUTER_AUDIO_MODEL` env (default `openai/gpt-4o-audio-preview`).

```jsonc
{
  "model": "openai/gpt-4o-audio-preview",
  "temperature": 0,
  "response_format": { "type": "json_object" },
  "max_tokens": 4096,
  "modalities": ["text"],
  "messages": [
    { "role": "system", "content": "<SYSTEM_PROMPT>" },
    { "role": "user", "content": [
      { "type": "text", "text": "Это голосовое сообщение оператора с запросом клиента. Расшифруй и извлеки строки." },
      { "type": "input_audio", "input_audio": { "data": "<base64 WITHOUT data: prefix>", "format": "wav" } }
    ]}
  ]
}
```

**Fallback (graceful):** if `OPENROUTER_AUDIO_MODEL` returns an HTTP 4xx for the audio part (model dropped or
no audio support), `extraction.ts` returns `warnings: ["Голосовой ввод недоступен — вставьте текст или фото"]`
with an empty `lines: []` rather than throwing. The client surfaces the RU hint and keeps the paste lane open.
`format` is derived from the data-URL mime (`audio/wav`→`wav`, `audio/webm`→`webm`, `audio/mpeg`→`mp3`).

### Degrade when key absent (all modalities)

`openrouter.ts` throws `AiError("key_absent")` when `process.env.OPENROUTER_API_KEY` is empty. The route maps
it to **HTTP 501** + RU hint: `apiFail("AI-распознавание не настроено (нет ключа). Введите строки вручную.", 501)`.

---

## 3. Output contract + system prompt

### 3.1 zod result schema (`extraction.schema.ts`)

```ts
import { z } from "zod";

// One route line. Mirrors request_lines card fields. originRaw/destRaw notNull (D15 raw kept).
// targetRatePerWagon = client's DESIRED rate (numeric); targetRateRaw = the raw rate string as written.
export const extractedLineSchema = z.object({
  originRaw:          z.string().trim().min(1),
  originRoadRaw:      z.string().trim().min(1).nullable(),   // RZD short code as written (СВР/ГОР/…)
  destRaw:            z.string().trim().min(1),
  destRoadRaw:        z.string().trim().min(1).nullable(),
  cargoName:          z.string().trim().min(1).nullable(),
  etsngCode:          z.string().trim().max(8).nullable(),
  wagonsRequested:    z.number().int().positive().nullable(),  // tolerate null pre-normalize; normalizer drops/zeroes
  tonnagePerWagon:    z.number().positive().nullable(),
  targetRatePerWagon: z.number().positive().nullable(),        // parsed numeric desired rate
  targetRateRaw:      z.string().trim().min(1).nullable(),      // "1980 ₽", "договорная", etc.
});

export const extractionResultSchema = z.object({
  clientGuess:  z.string().trim().min(1).nullable(),   // D16: SUGGESTION only → client_suggested_id later
  periodFrom:   z.string().trim().nullable(),          // ISO "2026-06-01" or null (model guesses, never invents)
  periodTo:     z.string().trim().nullable(),
  wagonType:    z.string().trim().nullable(),          // "ПВ"/"полувагон"/"крытый"… raw; null when absent
  lines:        z.array(extractedLineSchema),          // may be empty (warnings explain why)
  warnings:     z.array(z.string().trim()).default([]),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractedLine    = z.infer<typeof extractedLineSchema>;
```

The model is asked to emit nullable fields rather than omit them; the normalizer (§4) then forward-fills,
drops totals, normalizes roads, and clamps. The **post-normalize** payload is what the API returns.

### 3.2 SYSTEM_PROMPT (Russian, in `extraction.prompt.ts`)

```
Ты — ассистент железнодорожного экспедитора (РНС). Тебе дают запрос клиента на предоставление
вагонов: таблицу, скриншот, текст или расшифровку голоса. Верни СТРОГО JSON-объект по схеме ниже.

ПРАВИЛА (соблюдай дословно):
1. ОДНА СТРОКА НА ОДИН МАРШРУТ «станция отправления → станция назначения». Не объединяй маршруты.
2. ПРОТЯЖКА ПУСТОЙ СТАНЦИИ ОТПРАВЛЕНИЯ (forward-fill): если в строке таблицы пустая «станция/дорога
   погрузки», она ПОВТОРЯЕТ значение из ближайшей строки ВЫШЕ, где оно задано. Заполни originRaw и
   originRoadRaw этим унаследованным значением. Назначение при этом своё в каждой строке.
3. ОТБРОСЬ ИТОГОВЫЕ СТРОКИ: строки «Итого», «Всего», «ВСЕГО», «Сумма», «Total» — это суммы, НЕ маршруты.
   Не включай их в lines.
4. ДОРОГИ — это короткие коды РЖД (СВР, ГОР, СКВ, КБШ, ГРК, ОКТ, МСК, СЕВ и т.п.). Переноси код как есть
   в originRoadRaw / destRoadRaw. Не расшифровывай и не выдумывай код, которого нет.
5. НИКОГДА НЕ ВЫДУМЫВАЙ. Если значение не указано (груз, тоннаж, ставка, ЕТСНГ, период, тип вагона) —
   ставь null. Не подставляй «типичные» значения. Не угадывай коды ЕТСНГ.
6. КОЛИЧЕСТВО ВАГОНОВ — из колонки «объём, ваг/мес» (или похожей). Целое число. Если не указано — null.
7. СТАВКА КЛИЕНТА — это ЖЕЛАЕМАЯ клиентом цена за вагон. targetRateRaw = строка как написано
   («1980», «1 980 ₽», «договорная»). targetRatePerWagon = число, если из строки извлекается число; иначе null.
8. КЛИЕНТ — если в тексте/подсказке есть название клиента, верни в clientGuess; иначе null.
   Это ТОЛЬКО подсказка — оператор подтвердит вручную.
9. ПЕРИОД — если указан месяц/диапазон, верни ISO-даты (periodFrom, periodTo); иначе null. Не выдумывай год.
10. Станции переноси как написано (originRaw/destRaw), включая «все станции» — не нормализуй и не выбирай ЭСР-код.
11. Если ничего извлечь нельзя — верни пустой lines: [] и добавь причину в warnings (по-русски).

Верни только JSON, без пояснений и markdown.
```

### 3.3 response_format + repair-retry once (`extraction.ts`)

1. Send request with `response_format: { type: "json_object" }`, `temperature: 0`.
2. `parseModelJson(raw)` (pure): strip ```` ```json ```` fences if present, `JSON.parse`, then
   `extractionResultSchema.safeParse`.
3. On parse/validate failure → **one** repair retry: re-send with an extra user message
   `"Предыдущий ответ не прошёл валидацию: <zod issue>. Верни ТОЛЬКО валидный JSON по схеме."` + the raw text.
4. Second failure → return `{ clientGuess:null, periodFrom:null, periodTo:null, wagonType:null, lines:[],
   warnings:["Не удалось распознать — проверьте файл или введите вручную"] }` and HTTP 200 (soft fail, never 500
   for a model hiccup). Hard infra errors (timeout, 5xx) → 502 + RU hint.

---

## 4. Normalizer (`extraction.normalize.ts`, PURE) — the load-bearing logic

`normalizeExtraction(raw: ExtractionResult): ExtractionResult` applies, in order:

1. **Drop total rows** — drop any line whose `originRaw` OR `destRaw` matches
   `/^(итого|всего|сумма|total)\b/i` (after trim). Belt-and-braces with prompt rule 3.
2. **Forward-fill blank origin** — iterate lines top→down; if a line's `originRaw` is empty/null,
   inherit `originRaw` AND `originRoadRaw` from the last line that had a non-empty origin. (Mirrors the
   real план-на-Июнь where blank origin = repeat row above.) If the FIRST line has a blank origin → leave
   as-is and push a warning (nothing to inherit).
3. **Road-code normalization** — uppercase + trim `originRoadRaw`/`destRoadRaw`; map known short codes to a
   canonical set `СВР,ГОР,СКВ,КБШ,ГРК,ОКТ,МСК,СЕВ` (e.g. fix lowercase/latin homoglyph `CBP`→`СВР`). Unknown
   codes pass through unchanged + a warning `"неизвестный код дороги: <code>"` (D15 — don't drop, don't invent).
4. **Number coercion / clamp** — `wagonsRequested` → positive int or null; a line with null/0 wagons is kept
   but flagged (`"строка <origin→dest>: не указано число вагонов"`) so the operator fills it on confirm.
5. **Trim & nullify empties** — collapse `""`→`null` for all optional string fields.

Pure, deterministic, no I/O → fully unit-testable. The repository (later phase, not this slice) maps the
normalized result into `requests` + `request_lines` insert values inside one transaction, using the
find-or-create-counterparty idiom **only when the operator confirms** the client (D16) — never in the extractor.

---

## 5. Test plan (pure, vitest, no DB/env import)

`extraction.normalize.test.ts` — feed the golden план-на-Июнь rows as a model result and assert:

- **14 lines** out (the real file's route rows), **Итого dropped**.
- Blank-origin rows inherit origin station+road from the row above (e.g. `Йошкар-Ола` line gets
  `originRaw:"Теплая гора"`, `originRoadRaw:"СВР"`).
- `wagonsRequested` parsed to ints (200, 50, 30, …).
- `cargoName`/`tonnagePerWagon`/`targetRate*` are `null` when absent (rule 5 — never invented).
- `«все станции»` preserved verbatim in `destRaw` (rule 10).
- Road codes uppercased/normalized; an unknown code yields a warning, not a drop.

`extraction.parse.test.ts` — `parseModelJson` strips ```` ```json ```` fences; returns a structured failure
(not a throw) on malformed JSON; passes the zod-validated object through on success.

`extraction.prompt.test.ts` — `buildMessages("image", …)` produces an `image_url` part;
`buildMessages("audio", …)` produces an `input_audio` part with `format` derived from mime; text path is a string.

`openrouter.test.ts` — integration, `describe.skipIf(!process.env.OPENROUTER_API_KEY)`; one live text call
asserts the envelope parses. Never run in CI without a key.

---

## 6. Voice plan (browser → endpoint)

Client component `src/components/requests/VoiceCapture.tsx` (`"use client"`):

- **States:** `idle → requesting-permission → recording → encoding → uploading → done | error | unsupported`.
- **Capture:** `navigator.mediaDevices.getUserMedia({ audio: true })` → `MediaRecorder`
  (prefer `audio/webm;codecs=opus`, fallback `audio/mp4`/`audio/wav` via `MediaRecorder.isTypeSupported`).
  Collect `dataavailable` chunks → `Blob` on `stop`.
- **Encode:** `FileReader.readAsDataURL(blob)` → `data:audio/webm;base64,…` → POST JSON
  `{ modality:"audio", dataUrl, clientHint }` to `/api/requests/extract`.
- **Permissions:** on `NotAllowedError` → state `error` + RU hint "Доступ к микрофону запрещён".
- **Fallback when unsupported:** if `!navigator.mediaDevices || !window.MediaRecorder` → state `unsupported`,
  hide the mic button, keep the paste/upload lanes. Same RU degrade as the 501 key-absent path.
- The component never sees the key; it only calls the same endpoint → identical `ExtractionResult` contract.
- The route caps decoded audio size (§7); reject oversized with 413 + RU hint before calling OpenRouter.

---

## 7. Cost / safety

- **No secret in client:** key read only in `openrouter.ts` from `process.env` (Node runtime). Never `NEXT_PUBLIC_*`.
- **Limits:** text ≤ 200k chars; uploaded file ≤ **10 MB** (image/xlsx); decoded audio base64 ≤ **15 MB**
  (~1–2 min). Reject over-limit with 413 + RU hint **before** any model call.
- **Timeout:** `AbortController` 60s on the OpenRouter fetch; on abort → `AiError("timeout")` → 504 + RU hint.
- **`temperature: 0`, `max_tokens: 4096`** — deterministic, bounded cost. One extraction per file/submit (D10);
  repair-retry adds at most one extra call.
- **Model routing:** `OPENROUTER_MODEL` (default `google/gemini-2.5-flash`) for text/image;
  `OPENROUTER_AUDIO_MODEL` (default `openai/gpt-4o-audio-preview`) for voice; both env-overridable.
- **RU error messages only** in `apiFail` (never leak provider errors/stack — mirrors `response.ts` rule).
  Map: key absent→501, oversized→413, timeout→504, provider 5xx→502, model-parse soft-fail→200+warnings.
- **Auth gate:** `requireWriter(request.headers)` first — viewers/anon can't burn tokens.
- **XLSX safety:** SheetJS only via dynamic import in the Node route; never bundled to client/edge.
```

I'll add `xlsx` (SheetJS) to deps at the implementation phase, not now.
