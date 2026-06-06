# Аудит автономности SimpleCargo

> Подготовлено по итогам разбора 19 подсистем + 4 сквозных потоков. Все факты сверены с кодом на коммите `d25f101`. Цитаты файлов — точные.

**Вердикт одной строкой:** входящая половина петли (письмо → ИИ → запрос/счёт → live-обновление UI) реально автономна и работает. Исходящая половина (RFQ перевозчикам, разбор их ответов, закрытие сделки, задолженности) — **набор готовых, но не соединённых деталей**: логика написана и протестирована, но её никто не вызывает автоматически и нет UI, чтобы человек закрыл петлю вручную. Система сегодня = «умный авто-приёмник почты», а не «агент, который ведёт рутину».

---

## 1. Что уже работает (карта системы)

### Почта → ИИ (вход) — РАБОТАЕТ
- ✅ Always-on воркер: IMAP-поллинг 15с, graceful stop, первый запуск не реигрывает историю (`src/worker/mail-worker.ts:31-136`)
- ✅ Идемпотентность: курсор в `mail_cursor` + SHA-256 гейт по контенту (`src/lib/mail/cursor.ts`, `src/lib/mail/intake-repo.ts:25-53`)
- ✅ ИИ-классификатор (gemini-2.5-flash, repair-retry, soft-fail), защита от prompt-injection в classify (`src/lib/mail-intake/classify.ts:41-76`)
- ✅ Оркестратор: ветвление RFQ / счёт / котировка, слияние частей письма в один запрос (`src/lib/mail-intake/orchestrator.ts:60-171`)
- ✅ Извлечение строк запроса из xlsx/изображений/текста/аудио (`src/lib/requests/extraction.ts`)

### Запросы / Направления — РАБОТАЕТ частично
- ✅ 8-статусная машина жизненного цикла, перерасчёт статуса заявки из строк (`src/lib/requests/lifecycle.ts:43-145`)
- ✅ Авто-создание заявки из письма (`createRequestWithLines`, `intakeSource='ai_email'`) (`src/lib/requests/repository.ts:86-144`)
- ⚠️ `needsReview`/`intakeSource` **пишутся, но нигде не читаются** — баннера «на проверке (ИИ)» нет (подтверждено: grep по `src/app`+`src/components` пуст)
- ❌ Конверсии «выигранная строка → Направление/Заказ» нет (`convertedOrderId` — голый uuid без FK)

### RFQ перевозчикам — РАБОТАЕТ только вручную
- ✅ Отправка RFQ + запись `request_owner_quotes(polled)` на строку×перевозчик (`src/lib/rfq/outreach.ts:65-142`)
- ✅ UI выбора перевозчиков (`src/components/requests/CarrierOutreach.tsx`)
- ❌ `sendRfqToCarriers` вызывается **только** из ручного роута `/api/requests/[id]/outreach` (подтверждено grep’ом). Оркестратор её не зовёт.
- ❌ Таблица `request_owner_quotes` — **write-only**: пишется в outreach.ts, не читается нигде, кроме схемы (подтверждено grep’ом)

### Финансы / Tochka — РАБОТАЕТ при условии вебхука
- ✅ Sync выписок, идемпотентный upsert транзакций, RS256-проверка вебхука (`src/lib/finances/sync.ts:151-226`, `webhook.ts:17-44`)
- ✅ Авто-разнос: ИНН → контрагент (L1), сумма → сделка (L2), счёт→платёж (`src/lib/finances/reconcile.ts:34-94`, `reconcile-invoices.ts:12-63`)
- ❌ Нет планировщика: `syncTochka` зовётся только из вебхука и ручной кнопки (подтверждено grep’ом — `setInterval` есть только в SSE-heartbeat)
- ❌ Вебхук регистрируется вручную кнопкой, не на старте
- ❌ Расчёта задолженностей нет вообще

### Сопряжение (контрагенты/email) — РАБОТАЕТ наполовину
- ✅ Харвестинг адресов From+Cc на каждом цикле, автоподсказка (`src/lib/mail/known-emails.ts:22-53`, `src/lib/contacts/suggest.ts`)
- ✅ Реверс-резолв email → контрагент (точное совпадение) (`src/lib/partners/repository.ts:267-300`)
- ❌ `addNameVariant` (самообучение фаззи-матча) — ноль вызовов (dead code)
- ❌ Авто-создание контрагента из адреса/банка нет; бэкфилл линка при добавлении контакта нет

### UI / Realtime — РАБОТАЕТ частично
- ✅ pg LISTEN/NOTIFY → SSE → `router.refresh()` (`src/lib/realtime/notify.ts`, `src/components/realtime/LiveRefresh.tsx`)
- ⚠️ LiveRefresh смонтирован только на `/requests` и `/finances` (подтверждено) — Партнёры не обновляются live
- ❌ **UI карантина не существует** (подтверждено: grep по `quarantine`/`карантин` в `src/app`+`src/components` пуст)

---

## 2. Сквозные потоки и где они рвутся

### Поток A: письмо клиента → КП

```
[клиент шлёт RFQ] ──✅ IMAP poll
   → ✅ ИИ classify+extract
   → ✅ авто-создание request (needsReview=true)
   → ✂️ РАЗРЫВ #1: RFQ перевозчикам НЕ уходит автоматически
        (оркестратор не зовёт sendRfqToCarriers; нужен человек: открыть заявку, выбрать перевозчиков, нажать «Отправить»)
   → ⚠️ человек выбирает перевозчиков вручную (нет авто-подбора по маршруту/типу вагона)
   → ✅ RFQ уходит, пишется request_owner_quotes(polled)
   → ✂️ РАЗРЫВ #2 (самый тяжёлый): ответ перевозчика приходит, ИИ извлекает ставку+ourRequestRef,
        но строка просто сваливается в карантин (CARRIER_QUOTE_MANUAL) — ourRequestRef ИГНОРИРУЕТСЯ,
        request_owner_quotes НЕ обновляется (статус навсегда 'polled')
        (orchestrator.ts:148-159)
   → ✂️ РАЗРЫВ #3: даже карантин некуда смотреть — UI карантина нет вообще
   → ✂️ РАЗРЫВ #4: КП считается ТОЛЬКО из targetRate строки, не из ставки перевозчика+наценка
        (proposalKp.ts:92-107); котировки перевозчика в цену не попадают
   → ✂️ РАЗРЫВ #5: КП только печатается через window.print(), клиенту НЕ отправляется
        (KpPrintBar.tsx; sendMail для КП не подключён)
```
**Итог потока A:** автономен ровно до создания заявки. Дальше 5 разрывов, минимум 3 ручных вмешательства.

### Поток B: счёт/платёж → задолженность

```
[поставщик шлёт счёт] ──✅ ИИ extract → inbound_invoices(pending)
   → ⚠️ счёт сохраняется БЕЗ гейта по confidence (даже confidence=0 пишется как pending) (orchestrator.ts:128-146)
   → ⚠️ counterpartyId НЕ резолвится на вставке (пишется только ИНН строкой) (intake-repo.ts:73-93) — счёт не виден под партнёром
   → ✂️ скан-PDF счёта (массовый реальный кейс) → карантин без OCR, хотя для картинок vision есть (pdf.ts:33)

[Tochka вебхук] ──✅ verify → syncTochka → bank_transactions
   → ✂️ РАЗРЫВ: нет крона. Если вебхук не зарегистрирован/потерян — платежи не подтягиваются,
        пока человек не нажмёт «Обновить из Точки»
   → ✅ reconcileByInn → reconcileToDeals → reconcileInboundInvoices
   → ⚠️ счёт→платёж матчится без учёта направления (входящий счёт может матчнуться на 'in'-платёж)
   → ⚠️ слабый матч 0.6 (ИНН+сумма) сразу ставит 'paid' без ревью и без записи confidence
   → ✂️ РАЗРЫВ (ядро Цели #3): задолженности НЕ считаются. dueDate хранится, но не сравнивается с now().
        Нет AR/AP, нет «просрочено», нет «кто кому должен». Только COUNT pending. (repository.ts)
   → ✂️ Исходящие счёта (наши клиентам) не создаются вообще → дебиторку посчитать структурно невозможно
```
**Итог потока B:** разнос платежей работает при живом вебхуке, но нет крона-страховки, нет задолженностей, нет дебиторки.

---

## 3. Критические пробелы для автономности

| Пробел | Серьёзность | Где (file) | Что мешает автономности |
|---|---|---|---|
| Ответы перевозчиков не привязываются к RFQ — сваливаются в карантин, `ourRequestRef` игнорируется | CRITICAL | `orchestrator.ts:148-159` | (a) Петля сорсинга не закрывается; `request_owner_quotes` навсегда 'polled' |
| UI карантина не существует (write-only очередь) | CRITICAL | grep пуст в `src/app`,`src/components`; пишется в `intake-repo.ts:99-117` | Человеку негде разобрать неуверенные письма, котировки, скан-счета → они копятся невидимо |
| RFQ перевозчикам не авто-рассылается | CRITICAL | `orchestrator.ts:90-125` (нет вызова), единственный вызов — `outreach/route.ts` из UI | (a) Цель #2 не выполнена — нужен ручной клик на каждую заявку |
| Нет планировщика/крона для Tochka sync | CRITICAL | grep: только SSE-heartbeat; `railway.worker.json` = только mail-worker | (b) Если вебхук лапснул — платежи/долги протухают до ручного клика |
| Расчёта задолженностей нет вообще | CRITICAL | `repository.ts` (нет запроса), `dueDate` пишется но не читается | (c) Ядро Цели #3 «долги авто-отслеживаются» не реализовано |
| `needsReview`/`intakeSource` пишутся, но не читаются — нет баннера/фильтра ИИ-заявок | CRITICAL | grep пуст; колонки в `requests.ts:57-59` | Граница безопасности авто-приёма отсутствует: ИИ-заявки неотличимы от ручных и сразу live |
| Тихий сброс нераспознанных писем (soft-fail → ignored, без карантина) | CRITICAL | `classify.ts:65-71`, `orchestrator.ts:122-124` | Реальный запрос может бесследно исчезнуть |
| Воркер глотает исключения и двигает курсор → письмо потеряно навсегда | CRITICAL | `mail-worker.ts:88-92` | Транзиентный сбой LLM/БД = тихая потеря почты, без retry/dead-letter |
| Вебхук Tochka регистрируется вручную кнопкой | HIGH | `webhook/register/route.ts:34`; вызов только из `WebhookManager.tsx` | (b) Свежий деплой «глухой» к платежам, пока человек не нажмёт |
| `inbound_invoices.counterpartyId` не резолвится на вставке | HIGH | `intake-repo.ts:73-93` | (e) Счёт не привязан к компании; сопряжение зависит от хрупкого строкового матча ИНН |
| КП не отправляется клиенту; считается без ставок перехватчиков | HIGH | `KpPrintBar.tsx`, `proposalKp.ts:92-107` | (a) Финальный ручной хэндофф; цена не связана с сорсингом |
| Скан-PDF счетов → карантин без OCR/vision | HIGH | `pdf.ts:33`, `to-extract-input.ts:79-81` | (b) Доминирующий реальный формат счетов всегда требует человека |
| Авто-подбор перевозчиков по маршруту/типу вагона отсутствует | HIGH | `outreach.ts:99` (только переданные carrierIds) | (a) Даже при авто-отправке система не знает кого опрашивать |
| Матч счёт↔платёж игнорирует направление; 0.6-матч сразу 'paid' | HIGH | `match-invoice.ts:44-52`, `reconcile-invoices.ts:54-58` | (b) Риск порчи долговой картины ложным матчем |
| Биндинги направлений (mailbox→direction) write-only, входящая почта их не читает | HIGH | grep: нет ссылок в `mail-worker`/`mail-intake` | (e) Письмо не скоупится на маршрут — биндинги мертвы |
| Авто-создания клиента из харвестнутого адреса нет | HIGH | `EmailAutosuggest.tsx:73-79`; нет API создания | (d) Цель #4 «авто-подстановка клиентов» под ручным гейтом |
| ESR-резолв станций для направлений не автоматический | HIGH | `directions/repository.ts:99-100` (только *Raw); FK-колонки мертвы | (e) Маршруты не джойнятся по коду станции |
| Тариф 10-01 авто-подстановка (`resolveCurrentTariff`) — dead code | HIGH | grep: нет вызовов вне repository.ts | КП застревает на «по запросу» для тарифных ставок |
| Дубли контрагентов: `inn` не уникален (Tochka vs почта создают два ряда) | MEDIUM | `counterparties.ts:8,11`; `reconcile.ts:41` «pick oldest» | (e) Долги клиента расщепляются между дублями |
| Бэкфилл `known_email_contacts.counterpartyId` при позднем линке не делается | MEDIUM | `known-emails.ts:50` (COALESCE) | (d) Сопряжение «протухает»: поздно опознанные адреса остаются null |
| Пагинация доски умножает pageSize×20 | MEDIUM | `requests/repository.ts:189-190` | Доска может тихо обрезать карточки |
| Нет крон-просрочки заявок (`validUntil` не читается) | MEDIUM | `requests.ts:67` | Протухшие активные заявки не уходят в 'expired' |

---

## 4. Связка данных (сопряжение) — что не связано

Центр графа — `counterparties` (хаб клиент/владелец/перевозчик по `nameCanonical`+ИНН). Сейчас в него сходятся не все нити:

**Отсутствующие/мёртвые внешние ключи:**

1. **`inbound_invoices.counterpartyId` = NULL на вставке.** FK в схеме есть (`inboundInvoices.ts:34-36`), но `saveInboundInvoice` пишет только `counterpartyInn`+`nameRaw`. → Счёт «висит в воздухе», не виден под партнёром.
   *Фикс:* резолвить контрагента по ИНН (фоллбэк — `resolveSenderCompany` по From) при вставке.

2. **`inbound_invoices.dealId`/`directionId` = NULL всегда.** `reconcileInboundInvoices` ставит только `paidTxId`/`status`. → Цепочка счёт→платёж→сделка→направление рвётся посередине, долги не катятся в P&L направления.
   *Фикс:* протянуть `dealId`/`directionId` из `bank_tx_links` сматченной транзакции.

3. **`request_owner_quotes` ↔ ответ перевозчика — связи нет.** `sourceMessageId` пишется как `request.requestNumber` (а не реальный Message-ID письма!) (`outreach.ts:131`). `In-Reply-To`/`References` в `sendMail` не ставятся. → Ответ нельзя сматчить ни по треду, ни по ref.
   *Фикс:* `sendMail` возвращает Message-ID → пишем его в `sourceMessageId`; ставим threading-заголовки.

4. **`request_owner_quotes.directionId` — нет колонки.** Выигранная цена RFQ не переносится в операционную запись.

5. **Отложенные FK так и не приземлились** (голые uuid без `REFERENCES`): `requests.convertedOrderId`, `requests.clonedFromRequestId`, `directions.seededFromExtractedPriceId` (`requests.ts:72-74`, `directions.ts:72`). → Граф request→order→direction не enforced, возможны висячие id.

6. **`bank_transactions` без `counterpartyId`** (только ИНН строкой). Если ИНН пуст (нал, ИНН в назначении) — платёж навсегда непривязываемый.

7. **Граф email ↔ граф ИНН/Tochka не пересекаются.** Из почты ИНН не извлекается; банковские контрагенты (по ИНН) не сводятся с email-контактами. Две половины сопряжения (#5) не встречаются.
   *Фикс:* единый сервис резолва контрагента над `{email, ИНН, name}`.

8. **`requests`/`request_lines` без FK на исходный email** (`sourceRef` — просто текст). Провенанс не трассируется программно.

---

## 5. Дорожная карта к автономной системе

Порядок задуман так: сначала **превращаем ручные кнопки в автотриггеры и закрываем разрывы потоков** (P0), потом достраиваем недостающие движки (P1), затем закаливание (P2).

### Фаза P0 — закрыть разрывы петли (это и есть «автономность»)

| Задача | Файлы | Оценка |
|---|---|---|
| **Закрыть петлю перевозчиков.** В ветке `carrier_quote` оркестратора: резолв строки `request_owner_quotes` по threaded Message-ID (фоллбэк — `ourRequestRef`+sender), `UPDATE status='responded', costPerWagon, wagonsOffered, respondedAt`. Карантин только при отсутствии матча. + добавить `saveCarrierQuote` порт. | `orchestrator.ts:148-159`, `intake-repo.ts`, `ports.ts`, `db/schema/requestOwnerQuotes.ts` | M |
| **Хранить реальный Message-ID RFQ + threading.** `sendMail` возвращает Message-ID, ставит `In-Reply-To`/`References`; пишем в `sourceMessageId`. | `mailer.ts:27-38`, `outreach.ts:131` | S |
| **UI карантина «Входящие/На проверку».** `GET /api/quarantine` (unresolved + email + agentReason + draft), `POST .../resolve` (approved/rejected/reprocessed). Страница + бейдж в навигации + LiveRefresh на `kind:'quarantine'`. Approve пересоздаёт из `rawRowJson` без новых LLM-вызовов. | новые `src/app/(app)/inbox/`, `src/app/api/quarantine/`, `quarantine` repo | L |
| **Авто-рассылка RFQ при авто-создании заявки.** После `createRequest` в ветке `auto` — подобрать перевозчиков и вызвать `sendRfqToCarriers` напрямую (через lib, не HTTP). Гейт по флагу/confidence; фоллбэк — карточка в карантин. | `orchestrator.ts:90-125`, `outreach.ts` | M |
| **Крон-страховка Tochka sync.** Второй цикл в воркере: `syncTochka({months:1})` каждые ~10-15 мин. Делает истинным комментарий «periodic poll is the safety net». | `mail-worker.ts` (новый job) или новый воркер | S |
| **Авто-регистрация вебхука на старте.** Идемпотентный `registerWebhook` при boot (если `isTochkaConfigured`+HTTPS); сверка через `getWebhooks`. | `mail-worker.ts`/bootstrap, `tochka-client.ts` | S |
| **Резолв `counterpartyId` на вставке счёта.** | `intake-repo.ts:73-93` | S |
| **Движок задолженностей + показ.** `getPayablesSummary`/`getReceivablesSummary`: SUM по `inbound_invoices` по статусу/контрагенту, `overdue = dueDate < now() AND paidTxId IS NULL`. Тайлы «К оплате»/«Просрочено» + таблица долгов на Финансах. | `finances/repository.ts`, `finances/page.tsx` | M |
| **Перестать терять письма при сбое.** `markFileFailed(fileId, errorDetail)` + карантин-ряд вместо «log+advance cursor»; стартовый sweep `SELECT...FOR UPDATE SKIP LOCKED` для застрявших. | `mail-worker.ts:88-92`, `intake-repo.ts`, `ingest.ts` | M |
| **Не сбрасывать нераспознанные письма тихо.** soft-fail/<0.6 → карантин-ряд `UNRECOGNIZED` с `rawRowJson`. | `orchestrator.ts:122-124,162-168`, `orchestrator.test.ts` | M |

### Фаза P1 — достроить движки и баннеры

| Задача | Файлы | Оценка |
|---|---|---|
| Баннер `ClientConfirmBanner` + бейдж ИИ на карточках; `confirmReview` транзакция. Вывести `needsReview`/`intakeSource` в проекцию доски. | `requests/[id]/page.tsx`, `RequestCard.tsx`, `listDirectionCards` | S |
| OCR-фоллбэк для скан-PDF счетов: рендер первой страницы в PNG → существующий vision-путь. | `pdf.ts`, `to-extract-input.ts` | M |
| Гейт счетов по confidence + per-attachment confidence в диспозиции; убрать `|| 0.7` и `direction:'incoming'` хардкод; матч с учётом направления + ревью для слабых. | `orchestrator.ts:81,128-146`, `match-invoice.ts`, `reconcile-invoices.ts` | M |
| Авто-подбор перевозчиков по маршруту/типу вагона/истории; читать owner-биндинги направления. | `outreach.ts`, `directions/repository.ts` | M/L |
| Вход. почта → скоуп на Направление: резолв `directionOwnerBindings` по mailbox, штамп `directionId` на заявку. | `mail-worker.ts`/`orchestrator.ts`, `directionBindings` | M |
| Авто-ESR станций на create/edit направления. | `directions/repository.ts` | M |
| КП → клиенту: рендер в PDF + persist + `sendMail` (паттерн из statement/email), сначала кнопка, затем авто-триггер. Цена КП из принятой ставки перевозчика + наценка. | новый render endpoint, `proposalKp.ts`, `mailer.ts` | L |
| Конверсия «won → Направление/Заказ» + приземление отложенных FK миграцией. | `orders`, `requests.ts`, миграции | L |
| Авто-линк счёт→сделка/направление из `bank_tx_links`. | `reconcile-invoices.ts` | M |
| Харвест исходящих/Sent адресов + `addNameVariant` на подтверждении матча + бэкфилл линка при addContact. | `outreach.ts`, `known-emails.ts`, `partners/repository.ts`, `counterparties/repository.ts` | M |
| Авто-создание/линк контрагента из банка (по новому ИНН) и из частых неизвестных адресов (draft на подтверждение). | `finances/sync.ts`, новый job | M |

### Фаза P2 — оркестратор-ядро, закалка, тесты

| Задача | Файлы | Оценка |
|---|---|---|
| **Воркер → ядро оркестрации** с именованными джобами (mail poll, finance poll, RFQ dispatch, quote reconcile), каждый со своим интервалом, jitter, изоляцией ошибок. Это и есть «ИИ-агент, ведущий рутину». | рефактор `mail-worker.ts` | L |
| Модель частичных/переплат (allocation, остаток); исходящие счёта для дебиторки. | `match-invoice.ts`, `inboundInvoices`, КП-флоу | L |
| Replay-защита вебхука (iat/exp + jti-dedup + привязка к `TOCHKA_CUSTOMER_CODE`); TTL на кэш публичного ключа; rate-limit. | `webhook.ts`, `webhook/route.ts` | M |
| Тесты автономного ядра: `syncTochka`+3 reconcile (pg-mem/port), retry/soft-fail LLM-обёрток, `sendRfqToCarriers`, `pollCycle`. Включить coverage-порог в vitest. | `finances/*.test.ts`, `mail-intake/*.test.ts`, `vitest.config.ts` | M/L |
| Уникальный индекс `counterparties.inn` (where not null) + merge-инструмент дублей. | миграция, `counterparties.ts` | M |
| Scope SSE-событий по пользователю/tenant; targeted refresh вместо blanket. | `pg-listener.ts`, `LiveRefresh.tsx` | M |
| Dashboard «Главная» с реальными цифрами + LiveRefresh на Партнёрах. | `dashboard/page.tsx`, `partners/page.tsx` | M |

---

## 6. Риски и надёжность

**Карантин (CRITICAL).** Очередь карантина write-only: ряды пишутся, SSE-нотифай шлётся, но **читать их негде** — ни UI, ни API. Колонки `resolved`/`reviewAction`/`resolvedBy` не пишутся нигде. Любое неуверенное письмо, котировка перевозчика, скан-счёт копятся невидимо навсегда. Это блокирует human-in-the-loop и делает «авто-приём» небезопасным. → **Задача №1 в P0.**

**Тихие потери (CRITICAL).** Три канала молчаливой потери данных: (1) воркер при исключении двигает курсор → письмо не повторится (`mail-worker.ts:88-92`); (2) soft-fail классификатора → `ignored=true` без карантина; (3) непарсящаяся Tochka-транзакция → `failed++` и дроп в `warnings[]` без ревью (`sync.ts:124-130`). Везде только `console.error`. Нет Sentry, нет dead-letter, нет алертов — оператор «автономной» системы не узнает о деградации.

**Безопасность вебхука/секретов (в целом крепко, точечные дыры).**
- ✅ RS256-проверка подписи, fast-ACK, payments только «for-sign» (директор подписывает в банке), секреты только в env, CSP с nonce, Argon2id, disableSignUp.
- ⚠️ Нет replay-защиты (нет iat/exp/jti) — перехваченный валидный JWT можно гонять = бесплатный DoS-усилитель на банк-API/БД.
- ⚠️ Публичный ключ кэшируется навсегда без TTL — при ротации ключа Tochka вебхук тихо 401-ит до рестарта.
- ⚠️ Нет привязки события к `TOCHKA_CUSTOMER_CODE`; нет rate-limit на дорогие роуты (AI extract, sync).
- ⚠️ 152-ФЗ: ПД (имена, ИНН/КПП, email, банк-операции) в открытом виде, нет аудита доступа/экспорта, нет политики хранения. Тела ответов OpenRouter логируются (фрагменты ПД в логах Railway).

**Покрытие тестами критичных путей (MEDIUM, но опасно).** 351 unit-тест зелёные, но они покрывают **чистую логику** (thresholds, lifecycle, match-invoice, webhook-verify). **Автономное ядро не покрыто вообще:** `syncTochka` + 3 reconcile-функции (то самое авто-сопряжение денег), `sendRfqToCarriers`, LLM-обёртки (retry/soft-fail), сам `mail-worker`. Нет ни одного интеграционного теста с БД, ни одного теста API-роутов, нет coverage-порога (`passWithNoTests`). Правило 80% неисполнимо. Именно код, который PR #19 пришлось хотфиксить, не имеет регрессионной сети.

---

## 7. Рекомендация: следующие 5 шагов (делать прямо сейчас, в этом порядке)

1. **Закрыть петлю перевозчиков.** В `orchestrator.ts:148-159` вместо сброса котировки в карантин — матчить её на `request_owner_quotes` (по Message-ID/`ourRequestRef`) и проставлять `responded`+ставку. Параллельно: `sendMail` возвращает Message-ID, пишем его (не `requestNumber`) в `sourceMessageId` и ставим `In-Reply-To`. Это разблокирует всю исходящую половину. *(M+S)*

2. **Построить UI карантина «Входящие».** `GET/POST /api/quarantine` + страница + бейдж + LiveRefresh. Approve пересоздаёт из `rawRowJson` без новых LLM-вызовов. Без этого экрана человек не может закрыть петлю, а котировки/скан-счета/неуверенные письма невидимы. *(L)*

3. **Авто-рассылка RFQ + крон-страховка Tochka + авто-регистрация вебхука.** Три триггера, превращающие кнопки в автоматику: оркестратор после авто-создания заявки сам шлёт RFQ (с фоллбэком в карантин при отсутствии перевозчиков); воркер раз в 10-15 мин зовёт `syncTochka`; вебхук регистрируется на старте. *(M+S+S)*

4. **Движок задолженностей.** `getPayables/getReceivablesSummary` (SUM по статусу/контрагенту, overdue по `dueDate`) + резолв `counterpartyId` на вставке счёта + протяжка `dealId`/`directionId` из `bank_tx_links`. Тайлы «К оплате»/«Просрочено» на Финансах. Это закрывает Цель #3, которой сейчас нет вовсе. *(M)*

5. **Остановить тихие потери + базовая закалка.** Заменить «log+advance cursor» на `markFileFailed`+карантин-ряд и startup-sweep застрявших; soft-fail/<0.6 → карантин `UNRECOGNIZED` вместо `ignored`; гейт счетов по confidence. Параллельно — replay-защита вебхука (iat/exp+jti) и TTL на кэш ключа. *(M+M)*

После этих 5 шагов система переходит из «авто-приёмника почты» в реально автономную петлю: письмо входит → заявка → RFQ уходит сам → ответы перевозчиков сами привязываются → платежи/долги отслеживаются без клика, а человек только подтверждает спорное в одном экране карантина.