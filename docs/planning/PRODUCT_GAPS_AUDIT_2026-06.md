# Аудит продукта SimpleCargo — пробелы и недоделки (2026-06-10)

36 агентов (7 поверхностей × аудит + адверсариальная верификация каждой critical/high-находки).
Подтверждено: **29 critical/high**, 50 medium/low. Источник: ultracode-воркфлоу wf_4948a8c7.

## Подтверждённые critical/high

### 1. [high] Сделка со статусом confirmed («Заявка») теряет панель жизненного цикла — ввести ГУ или отправить в архив из UI невозможно

**Тип:** dead-end

Карточка сделки рендерит RequestWorksheet (и внутри неё RequestLifecyclePanel) ТОЛЬКО при stage==='request' (src/app/(app)/deals/[id]/page.tsx:233-243). После клика «Получили заявку» status='confirmed' → stage='application' → рендерится ApplicationTab (направления + щебень) без каких-либо кнопок лайфцикла. При этом кнопка «Есть ГУ» в RequestLifecyclePanel.tsx:109 специально включена для isConfirmed (disabled={pending || (!isDraft && !isConfirmed)}) — т.е. дизайн предполагал её доступность на confirmed, но панель там физически не рендерится. Воронка обрывается: confirmed-сделку нельзя двинуть в active (ГУ) и нельзя архивировать без прямого PATCH в API. То же для active: на стадии «Исполнение» (ExecutionPanel) нет ни одного управляющего действия.

**Фикс:** Вынести RequestLifecyclePanel из RequestWorksheet и рендерить её на карточке сделки на ВСЕХ стадиях (под ApplicationTab и ExecutionPanel), с кнопками, гейтящимися по статусу.

**Файлы:** `src/app/(app)/deals/[id]/page.tsx`, `src/components/trades/RequestLifecyclePanel.tsx`

<details><summary>Верификация</summary>

Находка ПОДТВЕРЖДЕНА чтением кода, опровергнуть не удалось.

Цепочка фактов:
1. /src/app/(app)/deals/[id]/page.tsx:233-247 — RequestWorksheet (единственный носитель RequestLifecyclePanel, см. RequestWorksheet.tsx:383) рендерится только при stage==='request'. stageForStatus (src/components/trades/dealStageMeta.ts) даёт confirmed→'application', active/completed→'execution'. На 'application' рендерится ApplicationTab (направления+щебень+помесячные ставки), на 'execution' — ExecutionPanel; ни там, ни там нет ни одной кнопки лайфцикла сделки.
2. Бэкенд переходы РАЗРЕШЕНЫ: src/lib/trades/lifecycle.ts TRANSITIONS confirmed→['active','draft','cancelled']; src/lib/trades/quoteRepository.ts transitionDealLifecycle action 'gu' проверяет canTransition(current,'active') — из confirmed прошло бы. Кнопка «Есть ГУ» в RequestLifecyclePanel.tsx:109 явно включена для isConfirmed — т.е. дизайн предполагал доступность на confirmed, но при confirmed панель физически не монтируется (isConfirmed там — мёртвый код).
3. Альтернативных UI-поверхностей НЕТ (проверено адверсариально): единственный фронтовый вызов /api/deals/[id]/lifecycle — RequestLifecyclePanel (grep по src). Список сделок /deals/page.tsx только фильтрует по стадиям, никаких действий/drag нет. Страница /requests/[id] оперирует лайфциклом сущности requests (RFQ), не orders. StatusActions направлений меняет directions.status и НЕ трогает orders.status (src/lib/directions/repository.ts — только recacheOrderDealType). Обратного действия confirmed→draft в API тоже нет (LifecycleAction не содержит такого).
4. Осознанного решения в docs/planning не нашёл: PRODUCT_DIRECTIONS.md описывает полный цикл draft→confirmed→active→completed/cancelled; комментарий в page.tsx:68-70 объясняет лишь отсутствие вкладок-переключателей, а не отсутствие управляющих действий.

Итог: confirmed-сделка — тупик UI: нельзя ввести ГУ (перейти в active/«Исполнение») и нельзя архивировать иначе как прямым PATCH в API. То же для active: нет UI-действия completed/cancelled. Это разрыв основной воронки продукта → severity high (не critical: нет потери данных, бэкенд-машина состояний цела, обходной путь через API существует).

</details>

### 2. [high] Действия «Завершить сделку» не существует вообще — ни в API, ни в UI; сделки вечно висят в «Исполнении»

**Тип:** missing-feature

Машина состояний разрешает active→completed (src/lib/trades/lifecycle.ts:15), статус 'completed' есть в CHECK схемы (schema/orders.ts) и в dealStatusMeta («Завершена»), но dealLifecycleSchema (src/lib/trades/quoteRepository.ts:328-332) знает только actions quoted|won|application|gu|archive — перехода в completed нет нигде. Следствие: тайл «Исполнение» на /deals (active+completed считаются вместе, dealStageMeta.ts:20-23) растёт бесконечно, закрыть рейс/сделку оператор не может. Архив (cancelled) — единственный терминал, но он семантически «отказ», а не «успешно завершена».

**Фикс:** Добавить action 'complete' в dealLifecycleSchema + ветку в transitionDealLifecycle (canTransition active→completed) и кнопку «Завершить» на стадии «Исполнение»; завершённые убрать из тайла или показывать отдельно.

**Файлы:** `src/lib/trades/quoteRepository.ts`, `src/lib/trades/lifecycle.ts`, `src/components/trades/RequestLifecyclePanel.tsx`

<details><summary>Верификация</summary>

Подтверждено чтением кода. Машина состояний (src/lib/trades/lifecycle.ts:15) разрешает active→completed, но dealLifecycleSchema (src/lib/trades/quoteRepository.ts) знает только quoted|won|application|gu|archive, и в switch transitionDealLifecycle нет ветки на completed. Grep по всему src/ за update(orders) — ни один путь (API, скрипты, execution-слой) не пишет status='completed'; src/lib/execution/repository.ts только читает. В UI (RequestLifecyclePanel.tsx) для active-сделки доступна лишь «В архив» с обязательной «причиной отказа» (cancelled = отказ). Это НЕ осознанное решение: PRODUCT_DIRECTIONS.md:80 явно задаёт lifecycle draft→…→active→completed/cancelled, дашборд (dashboard/page.tsx:51) включает completed в воронку, а метка «Завершена» (dealStatusMeta.ts:7) — недостижимый мёртвый код. Следствие: тайл «Исполнение» растёт бесконечно (stageForStatus маппит active+completed в execution), успешные сделки закрыть нельзя или приходится помечать как отказ, искажая архив и аналитику. Severity high: тупик воркфлоу основной сущности без обходного пути, но без потери данных/безопасности — не critical.

</details>

### 3. [medium] recacheOrderDealType в directions/repository.ts игнорирует щебёночные линии — добавление направления портит deal_type

**Тип:** bug

src/lib/directions/repository.ts:82-89: deriveDealType(false, n>0) — hasStone захардкожен false с комментарием «Stone lines (hasStone) arrive in Фаза 2 — false for now», хотя Фаза 2 давно реализована (orderStoneLines, StoneSection). Сценарий: сделка «щебень с доставкой» (stone_with_transport), оператор жмёт «Добавить направление» на вкладке «Заявка» (/directions/new?orderId=...) → createDirection вызывает recacheOrderDealType → orders.deal_type сбрасывается в 'wagons_only', хотя stone-линии на месте. В trades/repository.ts есть корректный recacheDealType (считает оба компонента) — две конкурирующие реализации разъехались.

**Фикс:** Удалить локальный recacheOrderDealType и вызывать recacheDealType из trades/repository (он уже экспортирован и принимает tx).

**Файлы:** `src/lib/directions/repository.ts`, `src/lib/trades/repository.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода. src/lib/directions/repository.ts:82-89 действительно вызывает deriveDealType(false, n>0) со stale-комментарием «Фаза 2 — false for now», хотя Фаза 2 реализована (stoneRepository.ts, StoneSection.tsx, orderStoneLines). Поток воспроизводим: deals/[id]/page.tsx:306 → /directions/new?orderId= → createDirection (repository.ts:132) → orders.deal_type сбрасывается в 'wagons_only' у сделки со stone-линиями. Корректный recacheDealType в trades/repository.ts:128-139 экспортирован и уже используется в 3 модулях — предложенный фикс валиден; бонус-разрыв: deleteDirection вообще не пересчитывает кэш. Severity снижена до medium: deal_type — производный кэш, stone-линии не теряются; кэш самочинится при любой мутации stone-линии или сохранении просчёта (оба зовут корректный recacheDealType); последствия — неверный бейдж типа в списке/карточке сделок и неверный дефолт cargoType воркшита (fallback на реальный состав срабатывает только при NULL, deals/[id]/page.tsx:156-162), оператор может переключить тип вручную; деньги/план-факт/исполнение от deal_type не зависят.

</details>

### 4. [medium] Сохранение воркшита «Запрос» перезаписывает deal_type без очистки осиротевших компонентов

**Тип:** data-integrity

upsertDealQuote (src/lib/trades/quoteRepository.ts:195-208) пишет orders.deal_type = cargoType формы и апсертит только компоненты выбранного типа. Если у сделки были и направление, и stone-линия (stone_with_transport), а оператор переключил таб на «Вагоны» и сохранил — stone-линия остаётся в БД (всплывёт на стадии «Заявка» в StoneSection), а deal_type='wagons_only' противоречит реальному составу. Любой последующий recacheDealType (например при добавлении/удалении stone-линии) молча вернёт stone_with_transport. Кэш и состав живут по разным правилам в зависимости от того, какой код последним трогал сделку.

**Фикс:** В upsertDealQuote либо удалять/деактивировать компоненты, не входящие в выбранный cargoType (с подтверждением в UI), либо не писать deal_type напрямую, а вызывать recacheDealType после апсертов.

**Файлы:** `src/lib/trades/quoteRepository.ts`, `src/lib/trades/repository.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода. upsertDealQuote (src/lib/trades/quoteRepository.ts:195-206) безусловно пишет orders.deal_type = cargoType формы и апсертит только компоненты выбранного типа — осиротевшие компоненты не удаляются. Сценарий достижим: таб «Тип груза» в RequestWorksheet.tsx:198-218 свободно переключается и сохраняется без подтверждения. Последствия проверены: воркшит инициализируется из deal.dealType (deals/[id]/page.tsx:156-162), поэтому осиротевшая stone-линия/направление прячется на стадии «Запрос», но безусловно всплывает на «Заявке» (StoneSection/TransportSection, page.tsx:327-328) и в «Исполнении». recacheDealType (repository.ts:128-139, вызывается из stoneRepository.ts:117,159 и addDirectionToTrade) при любой последующей мутации молча вернёт тип из состава, отменяя выбор оператора. Это НЕ осознанное решение: комментарий в createTrade (repository.ts:60-61) явно объявляет deriveDealType источником истины после привязки компонентов — upsertDealQuote нарушает собственный задокументированный инвариант. Severity = medium (не high): данных не теряется, краша и денежных последствий нет, осиротевший компонент виден и удаляем на стадии «Заявка»; это баг консистентности кэша deal_type и запутывающего состояния UX.

</details>

### 5. [medium] Помесячные ставки согласуются, но никуда не попадают: resolveDirectionRate и agreeMonthlyRate — мёртвый код

**Тип:** dead-end

MonthlyRateGrid обещает оператору: «только согласованные ставки попадают в расчёт рейсов» (MonthlyRateGrid.tsx:291-294). Но движок резолва ставки на месяц resolveDirectionRate (src/lib/trades/rateResolve.ts) не имеет НИ ОДНОГО вызова вне собственного модуля и тестов (grep по src — пусто), как и agreeMonthlyRate из monthlyRateRepository.ts. План/факт на карточке сделки (getDirectionPnl, src/lib/finances/repository.ts:388-392) берёт план исключительно из deals.margin (таблица рейсов), а не из согласованных ставок. Оператор аккуратно вводит и «согласует» ставки по месяцам — данные складываются в direction_monthly_rates и не влияют ни на один расчёт.

**Фикс:** Подключить resolveDirectionRate к расчёту плана (план = ставка месяца × вагоны) в getDirectionPnl/отчётах, или при создании рейса (deal) подставлять resolved-ставку; убрать вводящий в заблуждение текст до тех пор.

**Файлы:** `src/lib/trades/rateResolve.ts`, `src/lib/trades/monthlyRateRepository.ts`, `src/components/trades/MonthlyRateGrid.tsx`, `src/lib/finances/repository.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода: resolveDirectionRate (src/lib/trades/rateResolve.ts) не имеет ни одного вызова вне модуля и тестов; deals API и execution её не используют; getDirectionPnl (src/lib/finances/repository.ts:388-394) берёт план только из SUM(deals.margin). Единственный потребитель direction_monthly_rates — read-only отображение на карточке сделки (deals/[id]/page.tsx через listMonthlyRates). Текст MonthlyRateGrid.tsx:291-294 «только согласованные ставки попадают в расчёт рейсов» — ложное обещание, продублированное даже в комментарии схемы (directionMonthlyRates.ts:14). PR #32 (Фаза 4) построил движок с carry-forward и тестами, но потребителя так и не подключил; отложенной фазы в docs/planning нет. Одно уточнение: agreeMonthlyRate — мёртвый код, но сам воркфлоу согласования РАБОТАЕТ через upsertMonthlyRate(agree=true) в роуте monthly-rates — статус agreed реально пишется в БД. Severity снижена до medium: данные не теряются и не искажаются (план считается из реальных deals.margin), ставки сохраняются и видны; вред — write-only воркфлоу и вводящая в заблуждение надпись, т.е. недоделанная фича, а не баг расчёта.

</details>

### 6. [medium] Таблица рейсов deals никем не наполняется — «Исполнение» (bucket A) и «План/факт» работают только на исторических данных

**Тип:** missing-feature

В src нет ни одного insert(deals): единственные импортёры схемы — partners/repository.ts и finances/reconcile.ts (только чтение). Поля deals.direction_id / direction_match_method ('email_scope'|'manual'|'historical_import', schema/deals.ts:71-72) некому проставлять — матчер движений→рейс→направление не реализован. Следствия: (1) в getDirectionExecution (execution/repository.ts:94-100) ветка A «wagons on active-cycle deals» всегда пуста, конвейер живёт только на B (заадресация из писем); (2) план в getDirectionPnl (SUM(deals.margin)) для всех сделок, созданных через вкладку «Сделки», пуст — INNER JOIN plan отсекает направление целиком, и секция «План/факт маржи» просто не показывается. Лайфцикл обрывается на «вагоны поехали»: рейсы, маржа за рейс, оборот — всё ведётся вне системы.

**Фикс:** Реализовать создание рейсов (deals) из wagon_movements с привязкой к direction_id (хотя бы manual-кнопкой «создать рейс» на стадии Исполнение), затем включить ставки направления в revenue_ua/cost_owner.

**Файлы:** `src/lib/db/schema/deals.ts`, `src/lib/execution/repository.ts`, `src/lib/finances/repository.ts`

<details><summary>Верификация</summary>

Подтверждено кодом: в репозитории нет НИ ОДНОГО пути наполнения deals — все db.insert в src перечислены (counterpartyContacts, tpNode, stations, roads, requestOwnerQuotes, priceProtocolRates, ingestedAttachments), raw INSERT INTO deals отсутствует в src/scripts/drizzle. /api/deals (вкладка «Сделки») пишет в orders через createTrade (src/lib/trades/repository.ts:54), а не в deals. Следствия верны: bucket A в getDirectionExecution (src/lib/execution/repository.ts:94-99) всегда пуст, конвейер живёт только на B (owner bindings); план в getDirectionPnl (src/lib/finances/repository.ts:388-410) строится из SUM(deals.margin) и при пустой deals не возвращает ни одной строки план/факта. Находка даже занижена: «исторических данных» тоже нет — импорт истории (P15-4) не выполнен, deals пуста полностью. НО severity снижаю с high до medium: это задокументированный, осознанно фазированный пробел, а не упущение — docs/ROADMAP.md:48 явно помечает «👉 NEXT — P15-4 · Historical ПВ xlsx Import → deals linked to directions», ROADMAP:365-366 и docs/planning/SCHEMA_DELTA.md:476 планируют deal_matcher с установкой deals.direction_id at match time; комментарий в execution/repository.ts:18-21 («A ∪ B…, Route fallback (C) is a later phase») показывает, что A заложен под будущий матчер сознательно. Деградация плавная: исполнение работает через B, план/факт просто не показывается. Реальный пробел для оператора (маржа за рейс ведётся вне системы), но это «следующий шаг роадмапа», а не скрытый баг.

</details>

### 7. [medium] Удаление партнёра с историей сделок падает в 500 без объяснения, а где не падает — молча рвёт связи

**Тип:** bug

deletePartner (src/lib/partners/repository.ts:195-202) делает голый DELETE без проверки связей. deals.client_id/owner_id (src/lib/db/schema/deals.ts:36-37) — FK без onDelete (NO ACTION), direction_owner_bindings и request_owner_quotes — onDelete: restrict. Удаление любого партнёра с отгрузками/привязками/котировками даёт FK-violation → catch в DELETE /api/partners/[id]/route.ts:63-67 не распознаёт код 23503 → оператор видит alert «Не удалось удалить партнёра» без причины. И наоборот: у directions/orders/requests/inbound_invoices стоит onDelete: set null — если у партнёра только направления/заявки, удаление пройдёт и тихо обнулит client_counterparty_id, потеряв историю. Confirm-текст в DeletePartnerButton.tsx:13 обещает удалить только «контакты и документы», что не отражает реальность.

**Фикс:** В deletePartner перед DELETE посчитать связанные deals/directions/quotes и кидать PartnerError(409, «У партнёра N отгрузок и M направлений — удаление запрещено, используйте архив») либо ловить SQLSTATE 23503 и маппить в дружелюбный 409. Длинная перспектива — мягкое архивирование вместо удаления.

**Файлы:** `src/lib/partners/repository.ts`, `src/app/api/partners/[id]/route.ts`, `src/components/partners/DeletePartnerButton.tsx`, `src/lib/db/schema/deals.ts`

<details><summary>Верификация</summary>

Находка полностью подтверждена кодом. deletePartner (src/lib/partners/repository.ts:195-202) делает голый DELETE без проверки связей. FK-схема подтверждена: deals.client_id/owner_id (deals.ts:36-37) без onDelete (NO ACTION), direction_owner_bindings (directionBindings.ts:26,54) и request_owner_quotes (requestOwnerQuotes.ts:22) — restrict; вдобавок contracts.ts:14 и pricing.ts:33,51 тоже NO ACTION (блокирующих путей даже больше, чем в находке). Код 23503 нигде не обрабатывается — DELETE-роут (route.ts:63-67) маппит FK-ошибку в generic 500 «Не удалось удалить партнёра». Обратная сторона тоже верна: set null стоит на directions, requests, orders, inbound_invoices, order_stone_lines и tochkaFinance (привязка банковских платежей!) — удаление партнёра без сделок тихо рвёт эти связи. Confirm-текст в DeletePartnerButton.tsx:13 действительно обещает удалить только «контакты и документы». Осознанного решения в docs/planning нет, архивирования партнёров нет. Severity снижена до medium: каскадной потери ключевой истории нет — deals/quotes/bindings/contracts защищены FK и удаление просто падает; реальный ущерб = непонятный 500 (UX) + тихое обнуление связей у партнёров только с направлениями/счетами/платежами, и действие требует явного confirm от оператора.

</details>

### 8. [medium] Нельзя очистить ИНН и заметки в форме редактирования партнёра

**Тип:** bug

PartnerForm.tsx:61-62 отправляет `inn: inn.trim() || undefined` — пустое поле превращается в undefined. updatePartnerSchema (src/lib/partners/schema.ts:65-70) через optionalText тоже преобразует '' → undefined, а updatePartner (repository.ts:179-180) пропускает undefined-поля. Итог: стереть ошибочный ИНН или заметку из UI невозможно — сохранение молча оставляет старое значение. Это не косметика: ИНН — ключ авто-привязки платежей Точки (getPartnerFinance, general.ts:59-107); чужой ИНН будет вечно подтягивать чужие платежи в карточку.

**Фикс:** В PATCH-пути различать «не передано» и «очищено»: форма шлёт inn: inn.trim() || null, схема принимает .nullable() ('' → null), updatePartner пишет null. Для контактов это уже работает (updateContact ставит ?? null) — выровнять партнёра по тому же паттерну.

**Файлы:** `src/components/partners/PartnerForm.tsx`, `src/lib/partners/schema.ts`, `src/lib/partners/repository.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода по всей цепочке. PartnerForm.tsx:61-62 шлёт `inn: inn.trim() || undefined` (JSON.stringify выкидывает ключ), updatePartnerSchema через optionalText (schema.ts:38-42) превращает '' в undefined и отвергает null (z.string() → 400), updatePartner (repository.ts:179-180) пропускает undefined-поля — ветка `?? null` мёртвая, null до неё не доходит. Очистить ИНН/заметки невозможно ни из UI, ни прямым PATCH к /api/partners/[id]; других редакторов inn в кодовой базе нет (grep по partners-поверхности). Последствие реально: getPartnerFinance (general.ts:59-90) матчит платежи Точки строго по inn, ошибочный ИНН вечно тянет чужие платежи. Это не осознанное решение (в docs/planning ничего, а мёртвая ветка `?? null` показывает, что очистка задумывалась). Severity снижена до medium: данные не теряются, чаще всего ошибочный ИНН лечится заменой на правильный (это работает), неустранима только очистка в пустое; но UI-обходного пути нет — только разрушительное удаление/пересоздание партнёра.

</details>

### 9. [medium] Партнёр с ролями только owner/expeditor/shipper/consignee невидим в списке /partners

**Тип:** dead-end

PartnerForm даёт назначить любую из 7 ролей PARTNER_ROLES (schema.ts:8-16), включая «Собственник ПС», «Экспедитор», «Грузоотправитель», «Грузополучатель». Но список /partners имеет ровно 3 вкладки client/carrier/quarry (page.tsx:14, PartnersTabs.tsx:8-13), role вне этого набора принудительно заменяется на client (page.tsx:32), а listPartners фильтрует roles @> ARRAY[role]. Компания, созданная только как «Собственник ПС» (центральная роль домена — им платят за вагоны, owner_counterparty_id в directions/deals), не появится НИ НА ОДНОЙ вкладке: до карточки можно добраться только по прямой ссылке. countPartnersByRole тоже считает только 3 роли — суммы вкладок не сходятся с реальным числом партнёров.

**Фикс:** Либо добавить вкладку «Прочие» (роль не входит в 3 основные / вкладка «Все»), либо маппить owner→carrier-вкладку (домен их фактически объединяет: «дают и берут вагоны»), либо убрать лишние роли из формы, если они не нужны.

**Файлы:** `src/app/(app)/partners/page.tsx`, `src/components/partners/PartnersTabs.tsx`, `src/lib/partners/repository.ts`, `src/lib/partners/schema.ts`

<details><summary>Верификация</summary>

Подтверждено и усилено. (1) PartnerForm.tsx:100 предлагает все 7 ролей из PARTNER_ROLES (schema.ts:8-16); (2) /partners/page.tsx:14,32 коэрсит role в client/carrier/quarry, listPartners (src/lib/partners/repository.ts:66) всегда фильтрует roles @> ARRAY[role] — режима «все» нет; countPartnersByRole (строки 125-127) считает только 3 роли. (3) Усиление: owner-only контрагенты создаются НЕ только формой — система сама порождает их в основном воркфлоу: resolveCounterpartyId в src/lib/directions/repository.ts:53-73 и src/lib/trades/quoteRepository.ts:83 вставляют counterparty с roles=["owner"] при inline-создании собственника в направлении/просчёте; from-bank импорт (api/partners/from-bank/import/route.ts:14) допускает только client|carrier. Опровергнуть не удалось: в docs/planning/ нет зафиксированного решения скрывать owner; «owner всегда + carrier» — ложь (создаётся ровно ["owner"]). Смягчение, снижающее severity до medium: данные не теряются — owner-only контрагенты находятся через нефильтрованный по ролям searchCounterparties (src/lib/counterparties/repository.ts:57-98) в CounterpartyPicker и по прямой ссылке /partners/[id]; воркфлоу выбора собственника работает. Но в книге партнёров (CRM-поверхности) такие компании невидимы, а счётчики вкладок занижены — реальный разрыв UI/данных.

</details>

### 10. [medium] Управленческий учёт (ОПиУ/ДДС/НДС/НДФЛ ОСНО) не реализован вообще, а дизайн-док не в main

**Тип:** missing-feature

Дизайн-док MANAGEMENT_ACCOUNTING.md существует только в незамерженной ветке docs/mgmt-accounting (коммит c6f746a), в main его нет. Из всего плана (§2–§5: статьи mgmt_categories, op_type на bank_transactions, поля НДС amount_net/vat_rate/vat_amount/vat_status, регистр vat_ledger, детект переводов между своими счетами, пометка «Зарплата директора»/«Вывод собственника», отчёты ОПиУ/ДДС/баланс, расчёт НДС к уплате = исходящий−входящий, НДФЛ + страховые взносы ИП) в коде main не реализовано НИЧЕГО: grep по mgmt_categories|vat_ledger|op_type|amount_net|owner_draw — пусто. НДС считается только в назначении платежа (payment-purpose.ts) и при распознавании счёта (invoice-upload.ts), т.е. как текст для платёжки, а не как учёт. НДФЛ/взносы не упоминаются нигде в src/lib/finances. Вкладка /reports — это две ссылки обратно на /finances. Для ИП на ОСНО собственник не видит ни прибыли без НДС, ни резерва под налоги, ни сколько можно безопасно вывести — главный вопрос дизайн-дока.

**Фикс:** Смержить docs/mgmt-accounting в main и начать с §5.1 дизайн-дока: миграция полей НДС + op_type на bank_transactions, сид статей, каскад автокатегоризации (§4, слои 1–4 — системные правила, переводы себе, налоги по КБК), затем минимальный ДДС по статьям. Это даёт 80% ценности без ОПиУ.

**Файлы:** `docs/planning (MANAGEMENT_ACCOUNTING.md отсутствует в main, есть в ветке docs/mgmt-accounting)`, `src/lib/db/schema/tochkaFinance.ts`, `src/app/(app)/reports/page.tsx`

<details><summary>Верификация</summary>

Находка подтверждается кодом, с одним уточнением.

Подтверждено: (1) Дизайн-док MANAGEMENT_ACCOUNTING.md существует только в ветке docs/mgmt-accounting (коммит c6f746a, `git merge-base --is-ancestor c6f746a main` → NOT_IN_MAIN; в docs/planning на main файла нет; PR на эту ветку не создавался — gh pr list по headRefName "mgmt|account" пуст). Ветка запушена в origin/docs/mgmt-accounting, так что док не потерян, но и не в main. (2) Grep по mgmt_categories|vat_ledger|op_type|owner_draw по src/ и drizzle/ — пусто; единственный хит vat_amount — это inbound_invoices (распознавание входящих счетов из почты), не банковские операции. В схеме bank_transactions (src/lib/db/schema/tochkaFinance.ts, строки 52–78) нет ни категории, ни op_type, ни полей НДС — только direction/amount/purpose_raw/counterparty. (3) НДС в src/lib/finances реально живёт только как текст: payment-purpose.ts формирует строку «В т.ч. НДС …» для платёжки, invoice-upload.ts подставляет 22% по умолчанию при распознавании счёта. НДФЛ/взносы ИП не упоминаются нигде. (4) /reports (src/app/(app)/reports/page.tsx) — подтверждённый placeholder: комментарий «Placeholder shell — the Отчётность ПВ table + xlsx export ships in P1.5», две ссылки обратно на /finances и EmptyState «в разработке».

Уточнение, снижающее категоричность «не реализовано НИЧЕГО»: в main есть getDirectionPnl (src/lib/finances/repository.ts:381–432) и блок «План-факт» на /finances — фактическая маржа по направлениям из разнесённых через bank_tx_links операций. Это реальный, работающий кусочек управленческого контура (план из deals.margin vs факт приход−расход). Но он считает грязные суммы с НДС, без статей, без переводов себе, без «ниже черты» — на три главных вопроса дизайн-дока (прибыль без НДС, резерв под налоги, сколько можно вывести) не отвечает.

Severity снижаю до medium: это не баг и не скрытый разрыв данных, а осознанно спроектированный, но ещё не начатый эпик — дизайн-док с решениями оператора написан, сохранён в remote-ветке, в коде есть первый кирпич (план-факт по направлениям). Риск — потеря/устаревание дизайн-дока вне main и отсутствие ключевой для ИП на ОСНО функции, но это roadmap-гэп, а не дефект существующего кода. Предложенный фикс (смержить док, затем §5.1: поля НДС + op_type на bank_transactions, сид статей, автокатегоризация, минимальный ДДС) корректен и согласуется со структурой существующей схемы.

</details>

### 11. [high] Счёт «оплачен/частично» сразу при создании черновика на подпись; отклонённый платёж не возвращает долг

**Тип:** data-integrity

В payments.ts ACTIVE_DRAFT_STATUSES = ['on_sign','paid'] (стр. 48): refreshInvoiceRemaining() переводит inbound_invoice в status 'paid'/'partial' как только черновик ОТПРАВЛЕН на подпись, хотя директор может его не подписать. Счёт со status='paid' исчезает из «Задолженностей» (listDebts/getDebtSummary фильтруют status <> 'paid', repository.ts:515,585). При этом refreshPaymentStatus() (payments.ts:179-194) при переходе черновика в 'rejected' обновляет только paymentDrafts и НЕ вызывает refreshInvoiceRemaining — счёт навсегда остаётся «оплаченным», долг потерян. Плюс статус черновика обновляется ТОЛЬКО ручной кнопкой в PaymentsList (POST /payments/refresh?id=) — фонового поллинга статусов в mail-worker нет, так что неподписанные/отклонённые платежи висят 'on_sign' вечно.

**Фикс:** 1) В refreshPaymentStatus после update вызывать refreshInvoiceRemaining(draft.inboundInvoiceId) (добавить inboundInvoiceId в select). 2) Добавить периодический опрос статусов on_sign-черновиков в financeSyncJob воркера. 3) Рассмотреть исключение 'on_sign' из ACTIVE_DRAFT_STATUSES или показывать долг как «на подписи», а не скрывать.

**Файлы:** `src/lib/finances/payments.ts`, `src/app/api/finances/tochka/payments/refresh/route.ts`, `src/components/finances/PaymentsList.tsx`

<details><summary>Верификация</summary>

Все три утверждения подтверждены кодом. (1) payments.ts:48 ACTIVE_DRAFT_STATUSES=['on_sign','paid']; refreshInvoiceRemaining (стр.168-176) переводит inbound_invoices.status в 'paid'/'partial' сразу при создании черновика (вызов стр.136-138), до подписи директора; listDebts/getDebtSummary (repository.ts:515,585) фильтруют status<>'paid' — полностью «покрытый» неподписанным черновиком счёт исчезает из «Задолженностей». (2) refreshPaymentStatus (payments.ts:179-194) при rejected обновляет только paymentDrafts, не вызывает refreshInvoiceRemaining и даже не выбирает inboundInvoiceId — обратного пути нет нигде (проверены все вызовы refreshInvoiceRemaining/getInvoiceRemaining). (3) Фонового опроса on_sign нет: financeSyncJob (mail-worker.ts:170) и webhook-роут вызывают только syncTochka; sync.ts не упоминает paymentDrafts; единственный апдейт статуса — ручная кнопка в PaymentsList.tsx:28-39. Усугубляющий фактор, пропущенный находкой: reconcileInboundInvoices (reconcile-invoices.ts:21) обрабатывает только status='pending', поэтому счёт, переведённый черновиком в partial/paid, навсегда выпадает из авто-разноса реальных банковских операций (paid_tx_id никогда не проставится). Осознанным решением не является: MANAGEMENT_ACCOUNTING.md в репо отсутствует, в docs/planning поведение не задокументировано, AUTONOMY_AUDIT §3 определяет долг как неоплаченный счёт — код этому противоречит. Severity high (не critical): деньги не двигаются неверно, ломается только управленческий учёт, partial-счета остаются видимыми; но сценарий «директор отклонил/не подписал платёж → долг тихо потерян» реален и не самовосстанавливается.

</details>

### 12. [high] Дебиторка («нам должны») всегда ноль: исходящие счета клиентам нигде не создаются

**Тип:** missing-feature

Плитки «К получению (нам должны)» и «Просрочено к получению» (finances/page.tsx:227-240) питаются из inbound_invoices с direction='outgoing' (repository.ts:529). Но единственные писатели инвойсов — mail-intake orchestrator.ts:134 (хардкод direction: "incoming") и invoice-upload.ts:158 (тоже "incoming"). Ни UI выставления счёта клиенту, ни распознавания собственных исходящих счетов нет → дебиторка клиентов (главный денежный риск экспедитора) системно не отслеживается, плитки вечно нулевые. Это же блокирует ОПиУ по начислению (выручка признаётся по реализации) и дозвон по просрочке из AUTONOMY_AUDIT.

**Фикс:** Добавить создание outgoing-инвойса: минимально — кнопка «Выставить счёт» на сделке (deal.revenue_ua, клиент, срок оплаты) с записью в inbound_invoices direction='outgoing'; либо распознавать собственные счета в исходящей почте. Тогда дебиторка и просрочка начнут считаться существующим кодом без изменений.

**Файлы:** `src/lib/finances/repository.ts`, `src/lib/mail-intake/orchestrator.ts`, `src/lib/finances/invoice-upload.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода. Единственная вставка в inbound_invoices — intake-repo.ts:131; оба вызывателя хардкодят direction:"incoming" (mail-intake/orchestrator.ts:134, finances/invoice-upload.ts:158). Updates (reconcile-invoices.ts:57, payments.ts:174) меняют только status, direction никогда не становится 'outgoing'. UI выставления счёта клиенту отсутствует (grep по src/ не находит ни одного писателя 'outgoing'). При этом read-side полностью готов: repository.ts:484,529 (receivable=outgoing), плитки finances/page.tsx:227-240, ветка «нам должны» в Debts.tsx:42,54 — мёртвый код. Это не осознанный отказ: docs/planning/AUTONOMY_AUDIT.md:90 сам фиксирует «исходящие счёта не создаются вообще → дебиторку посчитать структурно невозможно», строка 193 держит фикс в backlog (L). Уточнение: плитки receivable не всегда видны нулевыми — секция рендерится лишь при наличии хоть одного счёта (page.tsx:210), но при живой кредиторке оператор видит ложный ноль дебиторки. Severity high (не critical): нет порчи данных/безопасности, но ключевой денежный риск экспедитора системно не отслеживается и блокирует ОПиУ по начислению.

</details>

### 13. [high] Разнести операцию на СДЕЛКУ из UI невозможно — план-факт по направлениям почти не наполняется

**Тип:** dead-end

API POST /api/finances/tochka/reconcile принимает dealId (route.ts:29), setManualLink тянет direction_id со сделки, но единственный UI — ReconcileControl на карточке операции — даёт только поиск КОНТРАГЕНТА (ReconcileControl.tsx: attach() шлёт лишь {transactionId, counterpartyId}). Поле dealId из UI никогда не отправляется. Авто-привязка reconcileToDeals (reconcile.ts:63-94) срабатывает только при ТОЧНОМ равенстве суммы платежа и deal.revenue_ua/cost_owner — частичные оплаты, авансы 50/50, оплата нескольких рейсов одной платёжкой не матчатся никогда. Хуже: ручной разнос на контрагента ставит match_method='manual', а reconcileToDeals исключает manual-связи (стр.79) — после ручного разноса операция уже НИКОГДА не привяжется к сделке. Итог: «План-факт по направлениям» (DirectionPnl) и факт на карточке сделки наполняются лишь в редком идеальном случае; поле bank_tx_links.amount_allocated (для сплита платежа на несколько сделок) вообще нигде не пишется — мёртвая колонка.

**Фикс:** В ReconcileControl добавить второй шаг: после выбора контрагента предложить его сделки (поиск по /api сделок контрагента) и слать dealId. В reconcileToDeals ослабить матч: допускать частичную оплату (sum draft/частей ≤ суммы сделки) или матч по № счёта из назначения (match-purpose.ts уже умеет purposeMentionsInvoice). Реализовать сплит через amount_allocated.

**Файлы:** `src/components/finances/ReconcileControl.tsx`, `src/lib/finances/reconcile.ts`, `src/app/api/finances/tochka/reconcile/route.ts`

<details><summary>Верификация</summary>

Все утверждения подтверждены кодом. (1) Единственный UI-вызов POST /api/finances/tochka/reconcile — ReconcileControl.tsx:56-60, шлёт только {transactionId, counterpartyId}; dealId из UI не отправляется нигде (grep по всему src — ноль вхождений dealId в finances-компонентах и страницах; на карточке сделки только чтение getDirectionPnl, без привязки). (2) reconcileToDeals (reconcile.ts:74-75,88) требует ТОЧНОГО равенства суммы и единственного кандидата — частичные оплаты/авансы/сводные платёжки не матчатся; match-purpose.ts/match-invoice.ts подключены только к reconcileInboundInvoices (статус счёта paid_tx_id), bank_tx_links.deal_id они не пишут. (3) Исключение manual-связей (reconcile.ts:79) подтверждено — это осознанная идемпотентность («не трогает ручные связи»), но в сочетании с отсутствием выбора сделки в UI даёт описанный тупик: после ручного разноса на контрагента операция никогда не привяжется к сделке. (4) amount_allocated — мёртвая колонка: только schema (tochkaFinance.ts:111) и миграции, ни одной записи/чтения. (5) getDirectionPnl (repository.ts:396-403) строит факт исключительно из bank_tx_links.direction_id — план-факт на /finances, /reports и карточке сделки наполняется лишь при идеальном exact-match. Смягчение: комментарий reconcile.ts:19-21 явно помечает привязку по № счёта и fuzzy как отложенный уровень P-FIN-7, т.е. частично осознанная стадийность, но планинг-дока P-FIN в docs/ нет, а потребитель данных (DirectionPnl) уже отгружен в прод. Severity high (значимый функциональный разрыв отгруженной фичи + односторонняя ловушка ручного разноса), не critical — нет потери данных.

</details>

### 14. [medium] Вкладка «Отчётность» — целиком заглушка: нет отчёта ПВ, нет xlsx-экспорта, нет импорта легаси-файла

**Тип:** missing-feature

src/app/(app)/reports/page.tsx — это явный placeholder (комментарий в строке 6: «Placeholder shell — the Отчётность ПВ table + xlsx export ships in P1.5»). Страница рендерит две ссылки-карточки и EmptyState «Отчётность ПВ в разработке». При этом по docs/planning/MVP_PLAN.md (строки 5, 48, 200-213) авто-ведение «Отчет ПВ Приоритет Логистика.xlsx» — главная долгосрочная цель продукта, а фаза 1.5 («Highest-ROI, no AI») включает импорт существующего report.xlsx и 17-колоночный экспорт Jan→Dec. Ничего из этого нет: схема report_rows (src/lib/db/schema/report.ts) существует и накатана миграцией, но ни одного чтения/записи в неё нет нигде в src/ и scripts/ (grep по reportRows/report_rows находит только сам файл схемы). Нет ни route-хендлера импорта, ни генератора report_rows, ни экспорта. Вкладка при этом висит в основной навигации (src/components/nav/nav-items.ts:19) — мёртвый пункт меню.

**Фикс:** Реализовать фазу 1.5 из MVP_PLAN: (1) одноразовый импортёр легаси «Отчет ПВ Приоритет Логистика.xlsx» → deals (SheetJS уже в зависимостях, парсить только в route handler); (2) генерация report_rows из CLOSED-сделок с generation_id; (3) страница /reports со сводной таблицей по месяцам (маржа, оборот) и кнопкой xlsx-экспорта через уже существующий паттерн export-builders (как в выписке). Пока не сделано — хотя бы убрать вкладку из nav или пометить бейджем «скоро».

**Файлы:** `src/app/(app)/reports/page.tsx`, `src/lib/db/schema/report.ts`, `docs/planning/MVP_PLAN.md`, `src/components/nav/nav-items.ts`

<details><summary>Верификация</summary>

Факты подтверждены чтением кода: /Users/mishanikhinkirtill/Desktop/SimpleCargo/src/app/(app)/reports/page.tsx — действительно placeholder (комментарий стр. 6 «Placeholder shell — the Отчётность ПВ table + xlsx export ships in P1.5», EmptyState «Отчётность ПВ в разработке»); таблица report_rows (src/lib/db/schema/report.ts) не имеет ни одного чтения/записи нигде в src/ и scripts/ (grep подтверждает — единственное вхождение это сам файл схемы); нет ни импортёра легаси-xlsx, ни генератора report_rows, ни 17-колоночного экспорта; вкладка висит в nav (src/components/nav/nav-items.ts:19). PRODUCT_DIRECTIONS.md по-прежнему проектирует /reports как «Tab 2 PV table» на report_rows (стр. 519-520) — фича не перенесена и не отменена. Однако severity завышена по трём причинам: (1) формулировка «целиком заглушка» неточна — страница работает как хаб с двумя живыми ссылками: «Выписка по счёту» ведёт на реальный xlsx/csv/1c-экспорт (src/app/api/finances/tochka/statement/export/route.ts + src/lib/finances/export-builders.ts), «План-факт» ведёт на реальную экономику по направлениям (getDirectionPnl, src/lib/finances/repository.ts:381), т.е. маржа/оборот частично доступны оператору в другом месте; (2) это не забытый мёртвый конец, а осознанная последовательность: MVP_PLAN фаза 1.5 явно запланирована, комментарий в коде это фиксирует, и по статусу проекта P1.5 — следующий запланированный этап после Phase 0; (3) часть скоупа P1.5 фактически реализована другим путём — deal CRUD существует (src/app/api/deals/ с [id], from-intake, search), сделки заводятся из intake-потока. Итог: находка реальна как «незавершённая ключевая фича + мёртвая таблица в схеме + вкладка-витрина в проде», но это известный roadmap-пробел без бага и потери данных, с частичной заменой через финансы — medium, не high.

</details>

### 15. [high] Таблица deals (единица маржи и оборота) никогда не наполняется — вся отчётная аналитика читает из вечно пустой таблицы

**Тип:** dead-end

В src/ и scripts/ нет ни одного INSERT в таблицу deals (grep по «insert(deals», «INSERT INTO deals» — ноль совпадений; /api/deals на самом деле создаёт orders через createTrade — src/app/api/deals/route.ts). При этом из deals читают четыре потребителя: (1) src/lib/partners/analytics.ts (вкладка «Аналитика» карточки контрагента: выручка/маржа/оборачиваемость — всегда нули/прочерк); (2) src/lib/finances/repository.ts:387-414 getDirectionPnl — план-факт по направлениям («План» всегда пуст); (3) src/lib/finances/reconcile.ts:60-140 — уровень-2 сшивки банковских операций со сделкой матчит сумму операции с deals.revenue_ua/cost_owner и тянет direction_id со сделки — при пустой deals ни одна операция никогда не получит deal_id/direction_id; (4) src/lib/partners/repository.ts:600+ (досье «все сделки компании»). Реальная коммерческая жизнь (orders, order_stone_lines, direction_monthly_rates, execution-вагоны) в deals не конвертируется — конвейера «исполненный рейс → строка deals» не существует.

**Фикс:** Построить мост orders/execution → deals: при завершении рейса (вкладка «Исполнение», getDirectionExecution) или закрытии заявки создавать строку deals с wagon_number, report_month, client_id/owner_id, revenue_ua/cost_owner из direction_monthly_rates. Либо принять решение, что deals наполняется только импортом легаси-xlsx (фаза 1.5) и матчингом движений (фаза 4) — но тогда импортёр нужен немедленно, иначе три живых UI-поверхности показывают пустоту.

**Файлы:** `src/lib/db/schema/deals.ts`, `src/app/api/deals/route.ts`, `src/lib/partners/analytics.ts`, `src/lib/finances/reconcile.ts`, `src/lib/finances/repository.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода: в src/, scripts/ и drizzle/migrations/ нет ни одного INSERT в deals; /api/deals/route.ts создаёт orders через createTrade. Четыре живых потребителя читают пустую таблицу (partners/analytics.ts, finances/repository.ts getDirectionPnl:387-414, finances/reconcile.ts reconcileToDeals:63-94, partners/repository.ts:618), плюс пятый, не названный в находке — execution/repository.ts:95-97 (bucket A вагонов). Находка даже недооценила эффект: bank_tx_links.direction_id заполняется только со сделки (reconcile.ts:84,137), поэтому в getDirectionPnl мертвы ОБЕ половины — и план, и факт; dealsLinked в sync.ts всегда 0. Severity снижена с critical до high: это задокументированный roadmap-разрыв, не скрытый баг — MVP_PLAN.md:200-211 явно планирует импортёр xlsx→deals (фаза 1.5) и матчинг движений→deals (фаза 4, строки 51, 263), а UI деградирует честно (AnalyticsTab.tsx:30-33 показывает «Отгрузок пока нет», margin — generated column с NULL-гейтом), ложных цифр и потери данных нет. Но high заслуженно: поверх пустой таблицы уже отгружены в прод 4-5 UI-поверхностей, ручной разнос предлагает привязку к несуществующим сделкам, и ключевая метрика бизнеса (маржа/оборачиваемость) не считается нигде, хотя исходные коммерческие данные в системе есть.

</details>

### 16. [low] getDirectionPnl: INNER JOIN по плану скрывает факт — направление с разнесёнными деньгами, но без строк в deals, не попадает в план-факт вообще

**Тип:** bug

src/lib/finances/repository.ts:387-414 — итоговый SELECT строится «FROM plan p JOIN directions ... LEFT JOIN fact». То есть базой выборки является CTE plan (FROM deals). Если по направлению есть фактические банковские операции (bank_tx_links.direction_id), но нет сделок в deals (а их сейчас нет никогда — см. находку про пустую deals), строка не вернётся: факт невидим. Правильная семантика план-факта — FULL JOIN или базой directions. Дополнительно: план SUM(margin) не фильтрует по статусу сделки (черновики и отменённые попадут в «план»), а fact_in−fact_out считает все привязанные операции маржой без разделения на классы платежей.

**Фикс:** Переписать запрос: FROM directions dir LEFT JOIN plan LEFT JOIN fact, отдавать строку если есть хоть план, хоть факт; в plan добавить фильтр по статусу deals (например status='CLOSED' или хотя бы margin IS NOT NULL); в ORDER BY учесть факт при NULL-плане.

**Файлы:** `src/lib/finances/repository.ts`

<details><summary>Верификация</summary>

Код подтверждён, но главный заявленный сценарий недостижим, поэтому severity понижена до low.

ЧТО ПОДТВЕРДИЛОСЬ (src/lib/finances/repository.ts:387-414):
1. Итоговый SELECT действительно строится «FROM plan p JOIN directions dir ... LEFT JOIN fact» — базой выборки является CTE plan (FROM deals). Направление с фактом, но без плана, в выдачу не попадёт. Это неверная семантика план-факта.
2. plan CTE фильтрует только WHERE direction_id IS NOT NULL — статус сделки (OPEN/ABANDONED/CONFLICT, см. ck_deals_status в src/lib/db/schema/deals.ts:74,96) не учитывается; при появлении данных «план» будет завышен брошенными сделками.
3. factMargin = fact_in − fact_out по всем привязанным операциям без классов платежей — но это документированное намерение (комментарий на строках 378-380: «факт — из разнесённых банковских операций (приход − расход)»), не баг.

ПОЧЕМУ SEVERITY НИЖЕ ЗАЯВЛЕННОЙ:
Сценарий «факт есть, плана нет» в текущем коде НЕ МОЖЕТ возникнуть. bank_tx_links.direction_id пишется ровно в двух местах, и оба берут его ИЗ СДЕЛКИ (deals): src/lib/finances/reconcile.ts:84 (reconcileToDeals: SET direction_id = c.direction_id из JOIN deals) и reconcile.ts:118-137 (setManualLink: directionId = deal.directionId, без dealId directionId остаётся null). Значит, если у факта есть direction_id — исходная сделка существует и попадает в plan CTE (там нет фильтра по статусу). Fact-only направление возможно лишь после удаления/перепривязки сделки, а кода, удаляющего или редактирующего строки deals, в репозитории нет вообще (grep по insert/update/delete(deals) — пусто).

Более того, таблица deals никогда не наполняется (ни одного INSERT в src/ и scripts/; UI «Сделки» и POST /api/deals пишут в orders через createTrade — src/app/api/deals/route.ts:21). Поэтому и plan, и fact CTE сейчас всегда пусты, панель «План-факт» на /finances (src/app/(app)/finances/page.tsx:61,184) и P&L-блок карточки сделки (src/app/(app)/deals/[id]/page.tsx:269) мертвы целиком — но это отдельная, более крупная находка про пустую deals, а не дефект JOIN.

ИТОГ: находка реальна как латентный структурный баг запроса (JOIN-база по плану + отсутствие фильтра статуса), который надо исправить до запуска ингеста deals, но видимого вреда сегодня не наносит и его заголовочный сценарий через существующие пути записи недостижим. В docs/planning решения, делающего это осознанным, не найдено (упоминаний план-факт/P-FIN в docs нет). Severity: low (а не high): предложенный фикс (FROM directions + LEFT JOIN обоих CTE, фильтр статуса) корректен.

</details>

### 17. [medium] Карточка «План-факт» на /reports ведёт в никуда: целевая секция на /finances скрыта при пустых данных, и она всегда пуста

**Тип:** dead-end

src/app/(app)/reports/page.tsx:33-44 — карточка «План-факт / Экономика по направлениям» ссылается на /finances (даже без якоря на секцию). На /finances секция «План-факт по направлениям» рендерится только при pnl.length > 0 (src/app/(app)/finances/page.tsx:180-188), а getDirectionPnl при пустой deals всегда возвращает [] — оператор кликает «План-факт» и попадает на общий экран финансов без какого-либо план-факта и без объяснения. Та же история на карточке сделки: src/app/(app)/deals/[id]/page.tsx:269-285 — блок «План / факт маржи» за условием p.pnl.length > 0 никогда не показывается.

**Фикс:** Вместо скрытия секции показывать EmptyState с объяснением, чего не хватает («нет сделок с привязкой к направлению / нет разнесённых операций») и ссылкой на действие; карточке на /reports дать якорь (/finances#pnl) или собственную страницу план-факта.

**Файлы:** `src/app/(app)/reports/page.tsx`, `src/app/(app)/finances/page.tsx`, `src/app/(app)/deals/[id]/page.tsx`

<details><summary>Верификация</summary>

Подтверждено чтением кода, и корень глубже, чем в находке: getDirectionPnl (src/lib/finances/repository.ts:381) строит план из таблицы deals, в которую НИГДЕ в кодовой базе нет записи (ни одного db.insert(deals)/UPDATE deals в src/ и scripts/ — UI-«сделки» это таблица orders). Поэтому pnl=[] всегда, секция «План-факт по направлениям» на /finances (page.tsx:177, гейт pnl.length>0, без EmptyState) не рендерится никогда, блок «План / факт маржи» на карточке сделки (deals/[id]/page.tsx:281) — тоже никогда, а карточка «План-факт» на /reports (page.tsx:33-44) ведёт на /finances без якоря и без объяснения. Смягчение: это осознанно недостроенная фаза — reports/page.tsx:6 прямо помечен «Placeholder shell — Отчётность ПВ ships in P1.5», т.е. таблица deals ждёт будущего ingest. Не баг с потерей данных, а мёртвый конец воркфлоу на трёх поверхностях → medium, не high. Бонус-следствия той же пустой deals: досье партнёра всегда показывает 0 сделок (src/lib/partners/repository.ts:607-620) и setManualLink по dealId всегда 404 (src/lib/finances/reconcile.ts:118-129).

</details>

### 18. [high] Таблица wagon_movements никогда не заполняется — воронка «Исполнение» мертва выше корзины «заадресовано»

**Тип:** dead-end

Весь трекинг вагонов читает wagon_movements: src/lib/execution/repository.ts (CTE latest, строки 108–127) джойнит привязанные вагоны с последним movement-снапшотом, src/lib/execution/classify.ts раскладывает по 7 корзинам (R1–R11). Но во ВСЁМ репозитории нет ни одного INSERT в wagon_movements — grep по src/, scripts/, drizzle/ находит только читателей (execution/repository.ts, classify.ts) и схему (src/lib/db/schema/movements.ts). Ручной разбор дислокации (src/app/api/inbox/[id]/dislocation/route.ts) пишет только номера в direction_owner_bindings.expected_wagon_ids — ни операция, ни станция, ни груж/порож, ни даты не сохраняются. Итог: каждый вагон навсегда застревает в bucket=addressed (R1 при snapshot==null), lastSnapshotTs всегда null, счётчики «в пути / на станции / выгружен», дистанции и сутки простоя в ExecutionTab никогда не заполнятся. Конвейер ингестии дислокационных xlsx (fetch→parse→normalize→dedupe→upsert в wagon_movements) полностью описан в docs/planning/INGESTION_PIPELINE.md (Stage 0–3, «Output: rows in wagon_movements», строка 140), но не реализован даже в минимальном виде.

**Фикс:** Минимальный мост без полного Phase-4 конвейера: расширить parseDislocation, чтобы из TSV-строк xlsx извлекались не только номера, но и колонки «операция / станция текущая / дата операции / расстояние / простой» (форматы A–D с анкер-колонками уже описаны в INGESTION_PIPELINE.md §Stage 2), и в POST /api/inbox/[id]/dislocation писать по строке в wagon_movements (fingerprint = sha256(вагон+операция+ts), source_file_id = id письма). Тогда существующий classifyWagon начнёт работать сразу. Полный автоматический конвейер — следующим шагом.

**Файлы:** `src/lib/execution/repository.ts`, `src/lib/execution/classify.ts`, `src/lib/db/schema/movements.ts`, `src/app/api/inbox/[id]/dislocation/route.ts`, `docs/planning/INGESTION_PIPELINE.md`

<details><summary>Верификация</summary>

Подтверждено кодом: в wagon_movements нет ни одного INSERT во всём репозитории (только схема src/lib/db/schema/movements.ts, читатели src/lib/execution/repository.ts строки 108–127 и classify.ts). POST /api/inbox/[id]/dislocation/route.ts пишет только номера вагонов в expected_wagon_ids через mergeExpectedWagons; статусы груж/порож, которые parse-dislocation.ts реально распознаёт (LOADED_RE/EMPTY_RE, поле loaded), роутом выбрасываются. classify.ts R1 кладёт snapshot==null в bucket "addressed" — все вагоны навсегда там. ExecutionTab при этом отгружен в прод (src/app/(app)/deals/[id]/page.tsx:280). Пересылки клиенту нет. Опровержение частично: INGESTION_PIPELINE.md явно помечает конвейер как Phase 4 (осознанная фазировка), но даже обещанный мост POST /api/upload («manual upload ships first») не существует. Severity high, не critical: нет порчи данных/security-риска и разрыв задокументирован, но видимая оператору воронка «Исполнение» функционально мертва, а распарсенные данные теряются.

</details>

### 19. [high] Письма-дислокации не обрабатываются автоматически: маршрутизация по inbound_mailbox спроектирована, но не подключена

**Тип:** missing-feature

Оркестратор почты явно исключает дислокацию из обработки: src/lib/mail-intake/classify-schema.ts:20–26 (EXTRACTABLE_KINDS без dislocation) и src/lib/mail-intake/orchestrator.ts:24 — «dislocation/document/gu12/claim/other — только архив+тип, без извлечения». При этом схема direction_owner_bindings (src/lib/db/schema/directionBindings.ts:27,37–38) хранит inbound_mailbox как «PRIMARY routing key» с индексом, прокомментированным «HOT PATH (P3): inbound email → candidate scope lookup» — но grep по src/ показывает, что inboundMailbox используется только в CRUD привязок (src/lib/directions/repository.ts:189–206, BindingsPanel.tsx); ни worker (src/worker/mail-worker.ts), ни оркестратор не сопоставляют отправителя дислокации с привязкой. Оператор обязан вручную открыть КАЖДОЕ письмо-дислокацию (они приходят ежедневно от каждого собственника), нажать «Дислокация в направление» и руками найти направление поиском (src/components/inbox/LetterActions.tsx:71–216) — хотя система уже знает, с какого ящика какому направлению идёт дислокация.

**Фикс:** В processEmail (orchestrator.ts) для kind=dislocation: найти активные direction_owner_bindings по нормализованному адресу отправителя (индекс idx_dir_owner_bind_mailbox уже есть); при единственном совпадении — автоматически setInboxLink + parseDislocation + mergeExpectedWagons (тот же код, что в /api/inbox/[id]/dislocation); при нескольких/нуле — в карантин-очередь «Требует проверки» с подсказкой кандидатов. UI-кнопка остаётся fallback'ом.

**Файлы:** `src/lib/mail-intake/orchestrator.ts`, `src/lib/mail-intake/classify-schema.ts`, `src/lib/db/schema/directionBindings.ts`, `src/worker/mail-worker.ts`, `src/components/inbox/LetterActions.tsx`

<details><summary>Верификация</summary>

Подтверждено кодом: classify-schema.ts:22-26 исключает dislocation из EXTRACTABLE_KINDS, orchestrator.ts не имеет ветки для дислокации (письмо уходит в ignored), grep показывает что inboundMailbox используется только в CRUD привязок (repository.ts, BindingsPanel, edit page) — ни worker, ни оркестратор не сопоставляют отправителя с привязкой; таблицы email_routing_log из спеки нет. Ручной путь подтверждён: LetterActions.tsx DislocationControl требует текстового поиска направления и даже не подсказывает направление из существующей привязки по ящику отправителя. Серверные кирпичи для автоматизации уже есть (route.ts: parseDislocation + setInboxLink + mergeExpectedWagons). НЮАНС, снижающий severity с critical до high: это не забытый провод, а явно задокументированный фазовый гейт — directionBindings.ts:10 («the actual email ingestion/forwarding is P3») и PRODUCT_DIRECTIONS.md §3 (P3: sender-match routing + auto-forward to client). Известный roadmap-пробел с рабочим ручным fallback, без потери данных — но ежедневная ручная привязка каждого письма-дислокации от каждого собственника при уже собранных данных маршрутизации делает это высокоприоритетным операционным разрывом.

</details>

### 20. [medium] Результат разбора дислокации не сохраняется: статусы груж/порож теряются всегда, номера — при ≠1 активной привязке

**Тип:** data-integrity

parseDislocation извлекает по каждому вагону loaded:true/false/null (src/lib/mail-intake/parse-dislocation.ts:39–60), но в БД из этого попадает только массив номеров: route.ts:34–37 передаёт w.number в mergeExpectedWagons. Счётчики «Гружёных/Порожних» и пономерные чипы живут лишь в React-state одного рендера (LetterActions.tsx:78,167–212) — после перезагрузки страницы письма результата разбора больше нигде нет, и при повторном открытии письма непонятно, разобрано оно или нет. Хуже: mergeExpectedWagons (src/lib/directions/repository.ts:355–377) при active.length !== 1 возвращает saved:false — то есть если у направления два собственника (легитимный кейс «split wagon lots», комментарий в directionBindings.ts:13), распознанные номера НЕ записываются никуда, письмо при этом уже привязано (setInboxLink выполнен до merge), и UI лишь печатает серую подсказку (LetterActions.tsx:184–189). Данные пономерного списка безвозвратно выброшены.

**Фикс:** Персистить результат разбора: либо JSONB-колонка dislocation_summary на ingested_files, либо (лучше) строки в wagon_movements с load_state из loaded-флага (схема уже имеет load_state ГРУЖ/ПОР/UNKNOWN, movements.ts:55). При нескольких активных привязках — дать оператору выбрать привязку в UI (селект собственника в DislocationControl) вместо молчаливого saved:false.

**Файлы:** `src/app/api/inbox/[id]/dislocation/route.ts`, `src/lib/directions/repository.ts`, `src/components/inbox/LetterActions.tsx`, `src/lib/mail-intake/parse-dislocation.ts`

<details><summary>Верификация</summary>

Подтверждено кодом: (1) loaded-флаги из parseDislocation (parse-dislocation.ts:39–60) нигде не персистятся — route.ts:34–37 передаёт в mergeExpectedWagons только номера; колонка load_state в wagon_movements есть (movements.ts), но у таблицы нет ни одного INSERT во всём src. (2) Результат разбора живёт только в React-state (LetterActions.tsx:78,111–112); колонки/таблицы dislocation_summary не существует — после перезагрузки видна лишь привязка письма, не результат разбора. (3) mergeExpectedWagons возвращает saved:false при active.length !== 1 (repository.ts:369) после уже выполненного setInboxLink (route.ts:33), а мульти-owner — легитимный кейс (directionBindings.ts: «1 direction → N owners (split wagon lots)»); UI лишь показывает серую подсказку. Смягчения: «безвозвратно выброшены» — преувеличение (текст письма сохранён, оператор может повторно запустить разбор после исправления привязок — merge идемпотентен), и зона осознанно недостроена: комментарии в коде и docs/planning (INGESTION_PIPELINE.md, ARCHITECTURE.md §Python/ARQ) фиксируют, что полноценный дислокационный пайплайн — будущая фаза, а воронка «Исполнение» всё равно пуста без писателей wagon_movements. Поэтому severity medium, не high: реальный разрыв данных и UX-ловушка, но в признанно-незавершённом конвейере, с возможностью ручного повтора.

</details>

### 21. [medium] Типизация писем мертва насквозь: ИИ-классификация не сохраняется, вкладки и ярлыки не работают

**Тип:** dead-end

Воркер сознательно не пишет тип письма: в src/worker/mail-worker.ts:121-124 вызывается markFileCommitted(fileId) БЕЗ kind/kindConfidence (комментарий: «Тип письма ИИ НЕ проставляет — менеджер сам относит вручную»), хотя функция в src/lib/mail/intake-repo.ts:63-77 параметры поддерживает, а классификатор результат уже посчитал. При этом «ручной» путь тоже разорван: эндпоинт POST /api/inbox/[id]/category (src/app/api/inbox/[id]/category/route.ts) не вызывается НИ ОДНИМ компонентом UI (grep по src/components и src/app пуст), на странице письма (src/app/(app)/inbox/[id]/page.tsx) нет контрола смены типа. Итог: колонка ingested_files.kind всегда NULL → 10 вкладок из src/components/inbox/inbox-tabs.ts (INBOX_TABS, tabDef, isInboxTabKey) нигде не рендерятся (страница /inbox жёстко tab="all"), per-kind счётчики countInboxByKind (inbox-repo.ts:164-188) всегда пусты, чипы KIND_CHIP в карточке сделки (deals/[id]/page.tsx:406) никогда не отображаются, helper effectiveEmailKind (classify-schema.ts:55-79) — мёртвый код с нулём вызовов. Парадокс: ИИ доверяют автоматически СОЗДАВАТЬ заявки и счета из письма, но не доверяют поставить ярлык на само письмо.

**Фикс:** В mail-worker.ts:124 передавать результат классификации: const ek = effectiveEmailKind(outcome.classification); await markFileCommitted(fileId, ek.kind, ek.confidence). Плюс добавить на страницу письма селектор типа, бьющий в уже готовый /api/inbox/[id]/category (или удалить мёртвые эндпоинт/вкладки, если решение «плоский список» окончательное).

**Файлы:** `src/worker/mail-worker.ts`, `src/app/api/inbox/[id]/category/route.ts`, `src/components/inbox/inbox-tabs.ts`, `src/lib/mail-intake/classify-schema.ts`, `src/lib/mail-intake/inbox-repo.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода. mail-worker.ts:124 вызывает markFileCommitted(fileId) без kind, хотя классификация уже посчитана (outcome.classification доступен — см. лог на стр.130), а сигнатура markFileCommitted (intake-repo.ts:63-77) принимает kind/kindConfidence. Эндпоинт POST /api/inbox/[id]/category существует, но setInboxCategory вызывается ТОЛЬКО из самого роута — ни один UI-компонент в /inbox, /inbox/[id] не бьёт в /category и не имеет селектора типа. inbox/page.tsx жёстко передаёт tab="all" (стр.31,93) и не рендерит вкладки. inbox-tabs.ts импортируется только deals/[id]/page.tsx и только KIND_CHIP — INBOX_TABS/tabDef/isInboxTabKey не импортируются нигде. В deals/[id]/page.tsx:406 чип `e.kind ? KIND_CHIP[e.kind] : undefined` завязан на kind, который всегда NULL → чип никогда не отображается. effectiveEmailKind вызывается только в собственном тесте. countInboxByKind ВЫЗЫВАЕТСЯ в layout.tsx, но используется только .all.unread для бейджа сайдбара; per-kind ветка мертва (kind=NULL). Итог: колонка ingested_files.kind всегда NULL, вся машинерия типизации (роут, 3 хелпера, чипы сделки, per-kind счётчики) мертва. Поправки по severity: плоский список — это ОСОЗНАННОЕ продуктовое решение (явно задокументировано в docstring inbox/page.tsx и комментарии воркера), функционально ничего не ломается, поэтому не high/critical. Реальная проблема — (1) значительный объём мёртвого/несогласованного кода под заброшенную фичу и (2) мелкий UX-разрыв: чип типа письма в карточке сделки полностью разработан, но никогда не появляется, хотя классификатор уже бесплатно посчитал тип. Предложенный фикс корректен в обе стороны (досвязать или удалить мёртвое). Severity: medium (поддерживаемость + мелкий UX-gap).

</details>

### 22. [high] Ставка перевозчика после авто-привязки никому не видна: request_owner_quotes никто не читает

**Тип:** dead-end

Петля сорсинга закрыта только на уровне БД. matchCarrierQuote (src/lib/mail/intake-repo.ts:188-240) корректно находит опрос по Message-ID/R-номеру и пишет status='responded', costPerWagon, wagonsOffered, respondedAt. Но таблицу request_owner_quotes не читает НИ ОДИН UI/репозиторий: grep по src — её используют только outreach.ts (insert), intake-repo.ts (update) и схема. В src/components/requests/* нет ни одного отображения costPerWagon/respondedAt; CarrierOutreach.tsx показывает только результат отправки. То есть перевозчик ответил, ИИ извлёк и привязал ставку — а оператор этого никогда не увидит: ни на карточке запроса, ни в КП (КП по-прежнему считается из targetRate строки). Статус 'accepted'/'declined' из CHECK-констрейнта схемы недостижим — нет ни UI, ни кода, который их ставит. validTo котировки извлекается, но сохраняется только текстом в notes (intake-repo.ts:226) — срок действия ставки не отслеживаем.

**Фикс:** Добавить read-репозиторий listOwnerQuotesForRequest(requestId) и блок «Опрос перевозчиков» на карточке запроса: кто опрошен (polled/respondedAt), какая ставка, кнопка «Принять ставку» (status='accepted' + перенос ставки в строку запроса/КП). Колонку valid_to добавить в схему вместо записи в notes.

**Файлы:** `src/lib/mail/intake-repo.ts`, `src/lib/db/schema/requestOwnerQuotes.ts`, `src/components/requests/CarrierOutreach.tsx`

<details><summary>Верификация</summary>

Подтверждено чтением кода. request_owner_quotes только пишется (outreach.ts:136 insert) и обновляется (intake-repo.ts:227-237 matchCarrierQuote: status='responded', costPerWagon, wagonsOffered, respondedAt). Единственные SELECT по таблице (intake-repo.ts:194-219) — внутренний матчинг кандидатов для того же UPDATE, возвращают только id/requestId, в UI ничего не отдают. Упоминания в orchestrator.ts/ports.ts — только комментарии. Ни один компонент/репозиторий не читает таблицу для отображения: совпадение в QuarantineList.tsx:85 (costPerWagon) берётся из quote-блоба карантинного драфта, НЕ из request_owner_quotes; CarrierOutreach.tsx показывает лишь результат отправки. Статусы 'accepted'/'declined' из CHECK-констрейнта не ставит никакой код. validTo пишется только текстом в notes (intake-repo.ts:226), колонки valid_to/quote_valid_to в живой схеме нет. То есть перевозчик ответил, ИИ извлёк и привязал ставку — оператор её нигде не видит, КП считается из ручного targetRate; вся работа matchCarrierQuote (P0 «закрыть петлю») обесценена отсутствием read-стороны. Severity понижаю до high (не critical): данные не теряются, нет security-риска, и это ЯВНО задокументированный известный пробел — AUTONOMY_AUDIT.md:28 (write-only, «не читается нигде») плюс полный задуманный жизненный цикл read-стороны в REQUESTS_SOURCING.md:91-263,489-535 (accepted_into_coverage, win→directions.rate_owner_suggested, quote_valid_to). Предложенный фикс соответствует дизайн-доку.

</details>

### 23. [medium] Карантин «Ответ перевозчика не привязался»: совет «привяжите вручную» некуда выполнить

**Тип:** missing-feature

Для reasonCode CARRIER_QUOTE_MANUAL карточка карантина (src/components/requests/QuarantineList.tsx:31-34) говорит оператору: «ИИ не понял, к какому запросу относится ставка — привяжите вручную». Но интерфейса ручной привязки котировки к запросу не существует нигде: нет ни эндпоинта, ни формы. Извлечённая ставка (costPerWagon лежит в draft.quote JSON, показывается строкой «Названа ставка: …», QuarantineList.tsx:81-87) при нажатии «Разобрал» просто выбрасывается — resolveQuarantine (quarantine-repo.ts:108-130) лишь ставит resolved=true. Ценные данные (живая ставка перевозчика) умирают в карантине.

**Фикс:** На карточке CARRIER_QUOTE_MANUAL добавить пикер «Запрос + перевозчик» (поиск по requestNumber), POST который создаёт/обновляет request_owner_quotes из draft.quote и резолвит карантин-ряд в один клик.

**Файлы:** `src/components/requests/QuarantineList.tsx`, `src/lib/mail-intake/quarantine-repo.ts`, `src/lib/mail-intake/orchestrator.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода. Карточка CARRIER_QUOTE_MANUAL (src/components/requests/QuarantineList.tsx:31-34) велит оператору «привяжите вручную», и извлечённая ставка показывается через quoteLine (строки 81-87, читает draft.quote.costPerWagon). Однако ручной привязки нигде нет: единственные действия резолва — approved/rejected/reprocessed (src/app/api/quarantine/[id]/resolve/route.ts:13), все они идут в resolveQuarantine (src/lib/mail-intake/quarantine-repo.ts:108-130), который лишь ставит resolved=true. Эндпоинта/формы для записи request_owner_quotes из карантина не существует — grep по request_owner_quotes/requestOwnerQuotes в src/app и src/components пуст (таблица write-only для оператора, что прямо совпадает с AUTONOMY_AUDIT «НЕ СДЕЛАНО — чтение request_owner_quotes»). В orchestrator.ts:185-198 непривязанный ответ перевозчика уходит в CARRIER_QUOTE_MANUAL, и ставка в draft.quote больше нигде не используется. Совет в подсказке указывает на несуществующее место → подтверждённый тупик воркфлоу с вводящей в заблуждение копией. Severity понижен до medium (не high): тело письма и вложения сохраняются в строке карантина (поля documents/draft), то есть необратимой потери данных нет — оператор может открыть исходник; и ветка срабатывает только при провале трединга (редко, есть фолбэк Message-ID + R-номер). Предложенный фикс (пикер «Запрос + перевозчик», POST создаёт/обновляет request_owner_quotes из draft.quote и резолвит ряд) корректен.

</details>

### 24. [medium] «Разобрал» в карантине ничего не создаёт; действие reprocessed объявлено, но не реализовано

**Тип:** missing-feature

AUTONOMY_AUDIT P0 требовал: «Approve пересоздаёт из rawRowJson без новых LLM-вызовов». Реально resolveQuarantine (src/lib/mail-intake/quarantine-repo.ts:108-130, комментарий честно признаёт: «Re-creating a request from the draft is a follow-up step») только помечает ряд resolved — извлечённый draft (включая готовые строки маршрутов для NO_LINES_EXTRACTED/LOW_CONFIDENCE) не превращается в заявку. API принимает action='reprocessed' (src/app/api/quarantine/[id]/resolve/route.ts:13, resolve-all/route.ts:11), но ни одна строка кода не выполняет повторную обработку — это мёртвый литерал. UI шлёт только approved/rejected. Оператору остаётся пере-набирать данные руками в /requests/new, хотя ИИ их уже извлёк.

**Фикс:** Для LOW_CONFIDENCE/UNKNOWN_SENDER/NO_LINES_EXTRACTED сделать approve = createRequestWithLines из rawRowJson.extraction (needsReview=true) + resolved; либо кнопку «Создать заявку из черновика», ведущую в /requests/new с предзаполнением из draft, а не из пустоты. Реализовать или удалить action='reprocessed'.

**Файлы:** `src/lib/mail-intake/quarantine-repo.ts`, `src/app/api/quarantine/[id]/resolve/route.ts`, `src/components/requests/QuarantineList.tsx`

<details><summary>Верификация</summary>

Подтверждено чтением кода. resolveQuarantine (src/lib/mail-intake/quarantine-repo.ts:108-130) и resolveAllQuarantine (134-145) для любого action делают одно и то же — помечают ряд resolved/reviewAction, никакой ветки пересоздания заявки из draft нет. Значение action='reprocessed' принимается схемой API (resolve/route.ts:13, resolve-all/route.ts:11), типом ReviewAction (quarantine-repo.ts:15) и DB-чек-констрейнтом (db/schema/quarantine.ts:35), но НИ ОДНА строка его не порождает и не обрабатывает иначе — мёртвый литерал. UI (QuarantineList.tsx:98-115, кнопки на 245/255) шлёт только approved/rejected. При этом извлечённый черновик реально пригоден к дозаносу: orchestrator.ts:111 кладёт draft: merged (NO_LINES_EXTRACTED), а 121 — draft: { extraction: merged } (LOW_CONFIDENCE), т.е. готовые строки маршрутов; createRequestWithLines уже есть (requests/repository.ts:87) и подключён к порту приёма (intake-repo.ts:265). Комментарий самого репозитория (quarantine-repo.ts:107) и схемы (quarantine-map.ts:21 «черновик для дозаноса без LLM») честно признают, что фича не доделана. Severity = medium, а не high: данные не теряются (draft хранится для аудита), у оператора есть рабочий ручной обход (/requests/new), и это явно числится в AUTONOMY_AUDIT как осознанно отложенный пункт; но это больше low — переввод уже извлечённых ИИ строк маршрута это реальное трение в основной петле приёма, плюс размазанный по API+БД+типам литерал reprocessed без реализации создаёт ложное впечатление готовой фичи. Предложенный фикс корректен по сути: либо approve=createRequestWithLines из draft (needsReview=true), либо кнопка «Создать заявку из черновика» с предзаполнением, либо убрать неиспользуемый action.

</details>

### 25. [high] Авто-рассылка RFQ перевозчикам так и не подключена (P0 из AUTONOMY_AUDIT не закрыт)

**Тип:** missing-feature

sendRfqToCarriers (src/lib/rfq/outreach.ts:65) по-прежнему вызывается ТОЛЬКО из ручного роута /api/requests/[id]/outreach (grep подтверждает единственный вызов). Оркестратор (src/lib/mail-intake/orchestrator.ts:93-103) после авто-создания заявки из письма клиента не запускает опрос перевозчиков — нужен человек: открыть заявку, выбрать перевозчиков, нажать «Отправить». Авто-подбора перевозчиков по маршруту/типу вагона тоже нет (outreach принимает только переданные carrierIds). Входящая привязка ответов (matchCarrierQuote) уже готова и протестирована — без авто-отправки она почти не получает данных.

**Фикс:** В ветке disposition==='auto' после createRequest подобрать перевозчиков (роль carrier с email; позже — по истории маршрута) и вызвать sendRfqToCarriers напрямую под env-флагом; при пустом списке — карантин-карточка «некого опросить».

**Файлы:** `src/lib/rfq/outreach.ts`, `src/lib/mail-intake/orchestrator.ts`, `src/app/api/requests/[id]/outreach/route.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода. sendRfqToCarriers (src/lib/rfq/outreach.ts:65) имеет единственного production-вызывающего — ручной роут src/app/api/requests/[id]/outreach/route.ts:30. Ветка disposition==='auto' оркестратора (src/lib/mail-intake/orchestrator.ts:93-103) после авто-создания заявки вызывает только deps.ports.createRequest и не запускает опрос перевозчиков. Авто-подбора перевозчиков нет: OutreachInput.carrierIds (outreach.ts:26-30) — обязательный массив от вызывающего, при пустом списке бросается OutreachError(400). Входящая привязка matchCarrierQuote (orchestrator.ts:167-199) готова и протестирована, но без авто-отправки почти не получает данных (строки request_owner_quotes создаются только из ручного роута). docs/planning/AUTONOMY_AUDIT.md прямо фиксирует это как открытый разрыв (стр. 102, 164) и предлагает тот же фикс — то есть это НЕ осознанное «won't do», а недоделанная фича. Severity снижена с critical до high: существует рабочий ручной путь (оператор открывает заявку, выбирает перевозчиков, отправляет через outreach-роут), поэтому это пробел автоматизации с ручным фоллбэком, а не баг с потерей данных или поломкой.

</details>

### 26. [medium] Письмо после PROCESSING_ERROR навсегда исчезает из «Входящих»: status='quarantined' никем не снимается

**Тип:** data-integrity

При сбое обработки воркер ставит ingested_files.status='quarantined' (mail-worker.ts:148, intake-repo.ts:107-113) и пишет карантин-ряд. Но listInbox показывает только status='committed' (inbox-repo.ts:88) — такое письмо никогда не появится в списке «Входящих». Резолв карантин-ряда (quarantine-repo.ts:108-130) статус файла не возвращает в committed, и обещанный в комментарии intake-repo.ts:104-106 «startup sweep» застрявших файлов не существует (в mail-worker.ts его нет). Если сбой случился до storeEmailOriginals, у карантин-карточки нет ни тела, ни вложений — открыть нечего: письмо доступно только в самом mail.ru, в системе от него остаётся uid+subject в draft.

**Фикс:** (1) при resolveQuarantine переводить связанный файл quarantined→committed, чтобы письмо вернулось в список; (2) добавить startup-sweep: SELECT … WHERE status IN ('processing','quarantined') и повторная обработка/коммит; (3) в catch-ветке воркера всё равно сохранять оригиналы (storeEmailOriginals) перед карантином.

**Файлы:** `src/worker/mail-worker.ts`, `src/lib/mail/intake-repo.ts`, `src/lib/mail-intake/inbox-repo.ts`, `src/lib/mail-intake/quarantine-repo.ts`

<details><summary>Верификация</summary>

Подтверждено чтением кода, но заголовок частично преувеличен. ВЕРНО: listInbox/countInboxByKind фильтруют строго status='committed' (inbox-repo.ts:88,172), поэтому файл со status='quarantined' в плоском списке «Входящих» не появляется; resolveQuarantine (quarantine-repo.ts:108-130) меняет только quarantineRows и НИКОГДА не возвращает ingestedFiles.status в 'committed'; обещанный «startup sweep» отсутствует — это лишь аспирационный комментарий intake-repo.ts:105, а AUTONOMY_AUDIT.md:169/229 явно числит «startup-sweep застрявших» как НЕ сделанный пункт severity M. ОПРОВЕРГНУТО частично: письмо после PROCESSING_ERROR не «исчезает навсегда» в типовом случае — listQuarantine (quarantine-repo.ts:36-84) делает left join ingestedFiles по sourceFileId и показывает ряд с отправителем/темой/вложениями в очереди «Требует проверки» /inbox/review (плюс баннер needsReview). При этом storeEmailOriginals в воркере (mail-worker.ts:110-120) выполняется ДО падающего processEmail и обёрнут в собственный try/catch без rethrow, так что в доминирующем сценарии (ошибка LLM/БД внутри processEmail) тело+вложения уже сохранены и письмо открываемо. «Открыть нечего» — это лишь краевой случай (сбой до/на recordIngestedFile или падение самого storeEmailOriginals). Тем не менее реальные дыры под заголовком есть и серьёзны: (1) после resolve письмо невидимо в ОБОИХ интерфейсах (status='quarantined' → не в инбоксе; resolved=true → не в очереди) без пути восстановления; (2) настоящая «чёрная дыра» — файл, застрявший в status='processing' (воркер убит в середине processEmail): при рестарте sha-идемпотентность recordIngestedFile (onConflictDoNothing → isNew:false) пропускает весь блок if(isNew), карантин-ряд не пишется, курсор уходит вперёд — файл нигде. Именно это должен был чинить отсутствующий sweep. Предложенные фиксы (resolve→committed, startup-sweep для 'processing'/'quarantined', и сохранение оригиналов до карантина) корректны. Severity снижаю до medium: основной путь ошибок всё-таки сюрфейсит письмо в очереди проверки с вложениями, а полная потеря требует специфических краевых условий; но невозвратимая невидимость бизнес-писем (заявки/счета) после resolve и крэш-окно 'processing' — реальный пробел надёжности, совпадающий с известным незакрытым пунктом аудита.

</details>

### 27. [high] Разрыв расчёт→КП: в КП попадает только целевая ставка клиента из входящего письма, свою цену оператор выставить не может

**Тип:** missing-feature

КП (buildProposalKp) строит строку ставки из request_lines.targetRate* — это ЦЕЛЕВАЯ ставка клиента, извлечённая при intake (D16: «client's desired rate — SUGGESTED only», src/lib/requests/schema.ts:53). После создания запроса ставки линий редактировать нельзя: requestUpdateSchema (src/lib/requests/schema.ts:93-103) — только шапка, а PATCH /api/requests/[id]/lines — только статусные переходы (lineTransitionSchema). Рассчитанный калькулятором тариф/предоставление никуда не подставляется: resolveAmount из src/lib/pricing/rate-expression.ts (который должен резолвить «+N% к тарифу» через тарифную базу) не вызывается нигде, кроме собственного теста; legacy-вход computeTariff в src/lib/tariff/repository.ts с задокументированным назначением «confidence gate KP auto-fill: 'green' auto-fills» не имеет ни одного потребителя (grep по импортам — пусто). Итог: для строк с targetRateKind=tariff_* КП печатает текст «+10% к тарифу 10-01» без суммы, для строк без target — «по запросу»; вписать СВОЮ цену в КП невозможно.

**Фикс:** Добавить per-line поле «наша ставка для КП» (ourRatePerWagon) + PATCH-эндпоинт редактирования строки; при kpIssued использовать его приоритетнее targetRate*. Для tariff_*-строк вызывать computeQuoteMatrix по originEsr/destEsr линии и resolveAmount(expr, tariffBase) — подставлять абсолютную сумму в КП с пометкой confidence.

**Файлы:** `src/lib/documents/proposalKp.ts`, `src/lib/requests/schema.ts`, `src/app/api/requests/[id]/lines/route.ts`, `src/lib/pricing/rate-expression.ts`, `src/lib/tariff/repository.ts`

<details><summary>Верификация</summary>

Подтверждено кодом: buildProposalKp (src/lib/documents/proposalKp.ts:93-107) печатает в КП только targetRate* клиента из request_lines; редактировать ставки строк после создания нельзя (requestUpdateSchema — только шапка, PATCH /api/requests/[id]/lines — только статусные переходы по lineTransitionSchema); resolveAmount (rate-expression.ts:37) не вызывается нигде вне теста; computeTariff из src/lib/tariff/repository.ts:202 не импортируется ни одним потребителем; альтернативного поля «своя ставка» в схеме нет (requestOwnerQuotes.costPerWagon — закупочная, в КП не подмешивается). Опровергнуть не удалось: для tariff_*-строк КП печатает «+N% к тарифу» без суммы, иначе целевую ставку клиента или «по запросу» — вписать свою цену невозможно. Важный контекст: разрыв уже задокументирован самим проектом как РАЗРЫВ #4 (HIGH) в docs/planning/AUTONOMY_AUDIT.md:67, а авто-подстановка тарифа в КП запланирована как Phase 7 в docs/planning/TARIFF_CALCULATOR.md:399 — т.е. это известная отложенная фича, а не скрытый баг, но воркфлоу расчёт→КП в проде реально оборван. Severity high (не critical: нет потери данных, обход — КП вне системы; внутренний аудит проекта оценивает так же).

</details>

### 28. [high] Путь КП→отправка клиенту разорван: только window.print(), хотя mailer в проекте уже есть

**Тип:** missing-feature

Единственное действие на странице КП — кнопка «Печать / Сохранить PDF» (KpPrintBar → window.print()). Отправки КП клиенту по почте нет, хотя инфраструктура существует и используется для RFQ перевозчикам: src/lib/rfq/outreach.ts:122 вызывает sendMail из @/lib/mail/mailer. Email клиента тоже есть (counterparties/contacts). Факт отправки не фиксируется нигде — есть только kpIssuedAt (штамп рендера страницы), отличить «посмотрел КП» от «отправил клиенту» невозможно, статус quoted на линии ставится отдельной ручной кнопкой «Котировка готова».

**Фикс:** Кнопка «Отправить КП» на странице КП: рендер KpModel в HTML/PDF → sendMail на контакт клиента, запись kpSentAt + messageId в request_lines (или отдельную таблицу исходящих), авто-переход линий в quoted.

**Файлы:** `src/components/requests/KpPrintBar.tsx`, `src/lib/rfq/outreach.ts`, `src/app/(app)/requests/[id]/kp/page.tsx`

<details><summary>Верификация</summary>

Подтверждено кодом: KpPrintBar.tsx содержит только window.print() и ссылку «Назад» — никакой отправки. sendMail из @/lib/mail/mailer реально существует и используется для RFQ перевозчикам (src/lib/rfq/outreach.ts:122) и для выписки Точки (src/app/api/finances/tochka/statement/email/route.ts:87), но для КП не подключён нигде (grep по «kp» в src/lib/mail и src/app/api пуст). kpIssuedAt ставится побочным эффектом GET-рендера страницы (src/app/(app)/requests/[id]/kp/page.tsx:36 → markLinesKpIssued, repository.ts:402-413) с безусловной перезаписью new Date() при каждом открытии; поля kpSentAt/messageId не существуют — «посмотрел» и «отправил» неразличимы. Это не осознанное решение: docs/planning/AUTONOMY_AUDIT.md:69 сам помечает это как «РАЗРЫВ #5» и в таблице пробелов (строка 110) оценивает HIGH. Уточнение: разрыв уже известен и задокументирован в планинге проекта, но в коде не решён; ручной обход есть (печать PDF + отправка из внешнего клиента), поэтому не critical, но как финальный разорванный шаг ключевой петли запрос→КП→клиент — high, совпадает с оценкой собственного аудита проекта.

</details>

### 29. [medium] «применить как ставку клиенту» подставляет повагонный тариф (группа «1») независимо от введённого числа вагонов; смешение семантики тариф/предоставление

**Тип:** bug

RequestTariffPanel получает только originEsr/destEsr (props, строки 10-17) — введённое в форме «Вагонов» (wagonCount) в панель не передаётся. singleWagonRow (строка 30-32) всегда берёт band «1» (повагонная), и кнопка «применить как ставку клиенту» (строка 188) пишет в rateClient classic.tariffNoVat именно повагонного тарифа. Для отправки 6-20 или 20+ вагонов K4-группа даёт другую (меньшую) цену — оператор завысит котировку. Дополнительно смешана семантика: в rateOwner подсказывается предоставление (provisionNoVat band 1), а в rateClient — провозная плата РЖД; «маржа» rateClient−rateOwner при таком наполнении — разность разнородных величин (провозная плата минус ставка предоставления). Маржа по вагонам в воркшите вообще не показывается (есть только stoneMargin, RequestWorksheet.tsx:128).

**Фикс:** Пробрасывать wagonCount в RequestTariffPanel и выбирать MatrixRow по группе отправки (1/2/3-5/6-20/свыше 20) вместо жёсткого band «1»; рядом с «применить» показать, что именно применяется (тариф vs предоставление), и добавить строку «Маржа / ваг» = rateClient − rateOwner в секцию «Ставки за вагоны».

**Файлы:** `src/components/trades/RequestTariffPanel.tsx`, `src/components/trades/RequestWorksheet.tsx`

<details><summary>Верификация</summary>

Находка подтверждена кодом. (1) wagonCount из формы (RequestWorksheet.tsx:105,148) не передаётся в RequestTariffPanel (props строки 10-17, вызов строки 238-244); singleWagonRow (RequestTariffPanel.tsx:30-32) жёстко берёт band «1», и кнопка «применить как ставку клиенту» (строка 188) пишет повагонный classic.tariffNoVat в rateClient независимо от числа вагонов. Разница реальна: golden-тест проекта (quoteMatrix.test.ts:46-57) фиксирует 52 463 ₽/ваг (band 1) против 50 080 ₽/ваг (band 6-20) на 1367 км — ~4,5% завышения для групповых отправок; при этом /api/tariff/matrix уже возвращает все 5 групп, панель просто отбрасывает их. (2) Смешение семантики подтверждено: rateOwner подсказывается предоставлением (provisionNoVat ≈ 118 тыс. на том же плече), rateClient заполняется провозной платой (≈ 52 тыс.), а ниже по потоку activation.ts:60-64 guard margin_positive сравнивает rateClient > rateOwner как однородные величины — при принятии обеих подсказок «маржа» бессмысленна. Маржа за вагоны в воркшите действительно не показывается (только stoneMargin, строка 128). Severity снижена с потенциально high до medium: показ band «1» — осознанное решение спеки (комментарий строки 29), UI подписывает цифру «Повагонная (1 ваг)» прямо над кнопкой (строка 171), значение попадает в редактируемое поле только по явному клику и ничего не сохраняется автоматически; направление ошибки — завышение котировки (риск проиграть бид), а не прямой убыток.

</details>

## Medium/low (не верифицировались отдельно)

- **[medium|data-integrity] Клиент, выбранный в воркшите, не виден в шапке сделки и в списке «Сделки»** — Шапка карточки и список читают клиента из orders.clientSuggestedId (deals/[id]/page.tsx:57,61; deals/page.tsx:49). Воркшит же сохраняет клиента в directions.clientCounterpartyId (upsertPrimaryDirection, quoteRepository.ts:79-101) и НИКОГДА не обновляет orders.clientSuggestedId. Итог: оператор выбрал…
  - Фикс: В upsertDealQuote дописывать orders.clientSuggestedId при выборе клиента (или в шапке делать fallback на клиента первичного направления).
  - Файлы: `src/lib/trades/quoteRepository.ts`, `src/app/(app)/deals/[id]/page.tsx`, `src/app/(app)/deals/page.tsx`, `src/lib/trades/conversion.ts`
- **[medium|ux] Конвертация выигранного запроса создаёт сделку в «Просчёте» — оператор заново проходит уже пройденные шаги** — convertRequestToTrade (src/lib/trades/conversion.ts:110-118) вставляет orders со status='draft' и дефолтным quoteStatus='quoting'. Сделка из ВЫИГРАННОГО запроса оказывается на стадии «Запрос» с бейджем «Просчёт» — оператор должен снова кликать «Цена дана» → «Прошли» → «Получили заявку». При этом ком…
  - Фикс: При конвертации проставлять quoteStatus='won' (и/или status='confirmed'), чтобы воронка сделки продолжалась с того места, где закончился запрос.
  - Файлы: `src/lib/trades/conversion.ts`, `src/lib/trades/lifecycle.ts`
- **[medium|dead-end] Целевая ставка клиента из запроса (rateClientSuggested / targetRatePerWagon) нигде не показывается после конвертации** — Конвертация и AI-intake старательно переносят желаемую ставку клиента в directions.rateClientSuggested (conversion.ts:50, intakeToTrade.ts:42), а карточка сделки даже выбирает targetRatePerWagon/targetRateRaw из request_lines (deals/[id]/page.tsx:120-121) — но ни одно из этих значений не рендерится:…
  - Фикс: Прокинуть rateClientSuggested/targetRate в RequestWorksheet и показать как suggested-подсказку у поля «Ставка клиенту» (RateInput уже умеет prop suggested — используется для предоставления).
  - Файлы: `src/app/(app)/deals/[id]/page.tsx`, `src/components/trades/RequestWorksheet.tsx`, `src/lib/trades/conversion.ts`
- **[medium|bug] transitionDealLifecycle: actions quoted/won не гейтятся статусом, archive принимает пустую причину** — В transitionDealLifecycle (quoteRepository.ts:235-242) ветки 'quoted' и 'won' меняют quoteStatus без какой-либо проверки текущего status — PATCH /api/deals/{id}/lifecycle позволяет проставить «Цена дана»/«Прошли» на cancelled или completed сделке (UI кнопки задизейблены, но API открыт любому writer)…
  - Фикс: Для quoted/won требовать status==='draft'; для archive — required lostReason в схеме (z.string().trim().min(1)) или 422 в репозитории.
  - Файлы: `src/lib/trades/quoteRepository.ts`
- **[medium|ux] MonthlyRateGrid: существующую ставку нельзя отредактировать, но форма добавления отсылает «измените существующую строку»** — Строка таблицы ставок имеет единственное действие «согласовать» (MonthlyRateGrid.tsx:174-182); полей редактирования сумм нет. При попытке добавить ставку на уже существующий месяц AddRateForm блокирует сабмит с текстом «Ставка на этот месяц уже есть — измените существующую строку» (строки 217-221) —…
  - Фикс: Сделать строки таблицы редактируемыми (inline-инпуты + POST с теми же effectiveMonth) или кнопку «изменить», переиспользующую AddRateForm с префиллом.
  - Файлы: `src/components/trades/MonthlyRateGrid.tsx`, `src/lib/trades/monthlyRateRepository.ts`
- **[medium|ux] Архив сделки необратим: cancelled — терминал без восстановления, ошибочная архивация = потеря сделки** — TRANSITIONS.cancelled = [] (src/lib/trades/lifecycle.ts:17), на карточке архивной сделки все кнопки лайфцикла disabled (RequestLifecyclePanel: isTerminal). Сделку, ушедшую в архив по ошибке (одна кнопка + причина), вернуть невозможно ни из UI, ни через API. Дополнительно: cancelled-сделка, дошедшая …
  - Фикс: Добавить переход cancelled→draft («вернуть из архива») в TRANSITIONS + action 'restore' в lifecycle API + кнопку на архивной карточке.
  - Файлы: `src/lib/trades/lifecycle.ts`, `src/app/(app)/deals/[id]/page.tsx`
- **[medium|missing-feature] Сделку нельзя отредактировать после создания: PATCH /api/deals/[id] не существует, updateTradeSchema — мёртвый код, notes не отображаются** — updateTradeSchema объявлен в src/lib/trades/schema.ts:37-45, но роут PATCH/GET /api/deals/[id] отсутствует (в api/deals/[id]/ только quote, lifecycle, stone-lines) — title, orderNumber, notes, reportMonth, клиента сделки после создания изменить нельзя ниоткуда. Поле notes («Контекст сделки, договорё…
  - Фикс: Добавить PATCH /api/deals/[id] (updateTrade) + блок «Заметки» и inline-редактирование названия на карточке; reportMonth либо выпилить, либо начать заполнять/использовать.
  - Файлы: `src/lib/trades/schema.ts`, `src/app/(app)/deals/[id]/page.tsx`, `src/components/trades/NewDealForm.tsx`
- **[medium|missing-feature] ГУ-12 — это только свободный текст orders.guNumber: без объёмов, дат, привязки к направлению и без документа** — Весь функционал ГУ — инлайн-инпут «ГУ-12 / номер накладной» (RequestLifecyclePanel.tsx:133-153), значение пишется в orders.gu_number (text, без валидации) и затем показывается лишь в бейдже «В исполнении (ГУ …)» (RequestWorksheet.tsx:66-69 — который на active-сделке даже не рендерится, см. critical-…
  - Фикс: Минимум — показывать ГУ на стадиях «Заявка»/«Исполнение» и хранить его на направлении; целево — сущность ГУ-12 (номер, период, вагоны/тоннаж план) со сверкой против заадресации и конвейера.
  - Файлы: `src/lib/db/schema/orders.ts`, `src/components/trades/RequestLifecyclePanel.tsx`
- **[low|ux] StoneSection: линию щебня нельзя отредактировать из UI (PATCH-роут есть, но не используется), удаление — без подтверждения** — API PATCH /api/deals/[id]/stone-lines/[lineId] реализован (обновление цен/тоннажа/карьера/tonnageActual), но в StoneSection.tsx единственные действия — «Добавить линию» и иконка-корзина (строки 117-156); чтобы поправить цену, оператор удаляет строку и заводит заново, теряя историю. DELETE срабатывае…
  - Фикс: Inline-редактирование строки (или модал) через существующий PATCH; confirm перед DELETE; поле «Тонн факт» на стадии «Исполнение».
  - Файлы: `src/components/trades/StoneSection.tsx`, `src/app/api/deals/[id]/stone-lines/[lineId]/route.ts`
- **[low|ux] Битые редиректы ?tab=application: новое направление, добавленное к draft-сделке, невидимо на карточке** — NewDealForm.tsx:86 и DirectionForm.tsx:280 после сохранения редиректят на /deals/{id}?tab=application, но карточка сделки больше не читает параметр tab — она показывает только текущую стадию по статусу (deals/[id]/page.tsx:68-71). Для draft-сделки это воркшит «Запрос», где видно ТОЛЬКО первичное (ст…
  - Фикс: Убрать мёртвый ?tab=… из редиректов; на воркшите draft-сделки показывать список всех её направлений (или счётчик с ссылкой), чтобы добавленные направления не пропадали.
  - Файлы: `src/components/trades/NewDealForm.tsx`, `src/components/directions/DirectionForm.tsx`, `src/app/(app)/deals/[id]/page.tsx`
- **[medium|dead-end] Каталог щебня (цена за тонну) — мёртвый конец: никуда не подтягивается, а priceValidFrom/locationEsr вообще недостижимы из UI и затираются при PATCH** — 1) quarry_materials используется ТОЛЬКО внутри вкладки «Щебень» (grep по src: ни lib/trades, ни quoteRepository каталог не читают). Оператор заполняет цену за тонну (вручную или ИИ из паспорта), но в просчёте щебня (order_stone_lines.price_purchase) цена вводится заново руками — авто-подстановки из …
  - Фикс: а) Подтягивать pricePerTon каталога в StoneSection/quoteRepository как дефолт цены закупки по quarry_supplier_id+фракции; б) либо добавить поля «цена действует с» и ЕСР-код станции в форму MaterialsTab, либо убрать их из схемы; как минимум — в PATCH не затирать непереданные поля.
  - Файлы: `src/components/partners/MaterialsTab.tsx`, `src/lib/partners/materials.ts`, `src/app/(app)/partners/[id]/page.tsx`
- **[medium|dead-end] getPartnerDossier тащит contracts, protocols и dealsSummary, которые нигде не отображаются (договорные ставки невидимы в карточке)** — getPartnerDossier (repository.ts:621-641, 656-664) на каждое открытие карточки выполняет запросы к counterparty_contracts и price_protocols и считает dealsSummary — но grep по src показывает ноль использований dossier.contracts/dossier.protocols/dealsSummary в UI: HistoryTab рендерит только requests…
  - Фикс: Либо вывести counterparty_contracts и price_protocols блоком на вкладке «Договор» (реквизиты договора + действующие протоколы ставок), либо выкинуть их и dealsSummary из dossier-запроса. Заодно убрать лишний полный dossier-фетч в /partners/[id]/edit (нужны только 5 полей партнёра).
  - Файлы: `src/lib/partners/repository.ts`, `src/components/partners/HistoryTab.tsx`, `src/components/partners/ContractTab.tsx`
- **[medium|ux] Выгрузка из банка: все новые контрагенты предотмечены галочками — один клик заносит всех, включая угаданные роли, с полными юр-названиями КАПСОМ** — RegistryBuildTable.tsx:74-76 инициализирует selected = ВСЕ строки не в реестре с ролью ≠ other. Текст страницы говорит «Отметьте нужных», но фактически отмечены все, в т.ч. lowConfidence-подсказки (роль угадана только по направлению платежа). Один клик «Занести в партнёры (N)» массово зальёт весь ба…
  - Фикс: Не предотмечать lowConfidence-строки (или вообще ничего); прогонять создаваемое имя через тот же coreName/титл-кейс (полное юр-имя сохранять в nameRawVariants — оно уже туда пишется); добавить понятную ошибку при >500 и/или чанковать импорт.
  - Файлы: `src/components/partners/RegistryBuildTable.tsx`, `src/lib/partners/import-from-bank.ts`, `src/app/api/partners/from-bank/import/route.ts`, `src/lib/partners/registry-build.ts`
- **[medium|bug] Поиск партнёров обещает «телефон, e-mail», но ищет только по названию** — Плейсхолдер в PartnersFilters.tsx — «Название, телефон, e-mail…», однако searchFilter в listPartners и countPartnersByRole (repository.ts:67-69, 119-121) матчит только c.name_canonical (ILIKE + trigram similarity). Поиск по телефону или адресу контакта всегда возвращает пусто, хотя counterparty_cont…
  - Фикс: Добавить в searchFilter EXISTS-подзапрос по counterparty_contacts (phone ILIKE / lower(email) LIKE), либо честно сократить плейсхолдер до «Название…».
  - Файлы: `src/components/partners/PartnersFilters.tsx`, `src/lib/partners/repository.ts`
- **[medium|missing-feature] Карточка перевозчика не показывает его котировки из опросов (request_owner_quotes)** — Вкладка «История» собирается из requests (clientSuggestedId), orders (clientSuggestedId), directions и deals (repository.ts:557-641) — всё это клиентская/собственническая сторона исполнения. Но опросы перевозчиков (request_owner_quotes.owner_id → counterparties, есть индекс idx_owner_quotes_owner) в…
  - Фикс: Добавить в getPartnerDossier выборку request_owner_quotes по owner_id (запрос, дата, ставка, статус ответа) и секцию «Котировки перевозчика» в HistoryTab; в списке для вкладки carrier показывать счётчик его котировок вместо клиентских запросов.
  - Файлы: `src/lib/partners/repository.ts`, `src/components/partners/HistoryTab.tsx`, `src/components/partners/PartnerCard.tsx`
- **[low|data-integrity] isPrimary у контактов не эксклюзивен — можно получить несколько «основных» контактов** — addContact/updateContact (repository.ts:242-287) пишут isPrimary как есть, не снимая флаг с остальных контактов компании; attachEmail при банковском импорте (import-from-bank.ts:87-97) дополнительно ставит isPrimary первому добавленному. Отметив «основной» у второго контакта в ContactsEditor, получа…
  - Фикс: При isPrimary=true в addContact/updateContact обнулять флаг у остальных контактов компании одной транзакцией (UPDATE ... SET is_primary=false WHERE counterparty_id=... AND id<>...).
  - Файлы: `src/lib/partners/repository.ts`, `src/lib/partners/import-from-bank.ts`, `src/components/partners/ContactsEditor.tsx`
- **[low|bug] as_owner в направлениях дossier может прийти NULL вместо false (SQL three-valued logic)** — В запросе направлений (repository.ts:595) `(d.owner_counterparty_id = ${id} OR dob.owner_id = ${id}) AS as_owner`: когда owner_counterparty_id IS NULL и LEFT JOIN не сматчился, выражение даёт NULL, а не false. Поле типизировано как boolean (DirRow.as_owner: boolean) и уходит в DossierDirection.asOwn…
  - Фикс: Обернуть в COALESCE(..., false) обе колонки as_client/as_owner.
  - Файлы: `src/lib/partners/repository.ts`
- **[medium|dead-end] «Счета из почты» и «Задолженности» — витрины без действий: оплатить распознанный счёт нельзя** — InboundInvoices.tsx и Debts.tsx — чисто read-only списки: нет кнопки «Оплатить» (префилл PaymentForm из уже распознанного inbound_invoice), нет ручного «отметить оплаченным», нет привязки к контрагенту/сделке (поля inbound_invoices.deal_id/direction_id с комментарием «оператор подтверждает» никогда …
  - Фикс: Кнопка «Оплатить» на строке счёта: /finances/payments?invoiceId=… → серверный префилл из inbound_invoices (toPrefill в invoice-upload.ts уже умеет собирать PaymentPrefill из строки БД — выделить и переиспользовать). Добавить действия «отметить оплаченным вручную» и «привязать к сделке», и кнопку «напомнить» для просроченной дебиторки.
  - Файлы: `src/components/finances/InboundInvoices.tsx`, `src/components/finances/Debts.tsx`, `src/lib/db/schema/inboundInvoices.ts`
- **[medium|ux] Счётчик «N не разнесено» некликабелен; фильтры операций реализованы в репозитории, но не подключены к UI** — listRecentTransactions поддерживает opts.direction / onlyUnlinked / search (repository.ts:99-113), но finances/page.tsx:59 вызывает её только с {limit:100} — на странице нет ни поиска, ни фильтра «только не разнесённые», ни переключателя приход/расход. Подсказка «N не разнесено» на плитке «Чистый по…
  - Фикс: Прокинуть searchParams (?unlinked=1&dir=in&q=...) со страницы в listRecentTransactions, сделать «N не разнесено» ссылкой на ?unlinked=1, добавить строку поиска над TransactionFeed (URL-as-state).
  - Файлы: `src/app/(app)/finances/page.tsx`, `src/lib/finances/repository.ts`
- **[medium|bug] Частично оплаченный счёт показывается в задолженностях на полную сумму** — getDebtSummary и listDebts (repository.ts:506-599) фильтруют paid_tx_id IS NULL AND status <> 'paid', т.е. включают status='partial', но суммируют amount_total целиком — уже оплаченная часть (Σ активных черновиков, см. getInvoiceRemaining в payments.ts:144) не вычитается. «К оплате (мы должны)» завы…
  - Фикс: В SQL задолженностей вычитать COALESCE(Σ payment_drafts.amount по invoice_id со статусом on_sign/paid, 0) из amount_total (LEFT JOIN LATERAL), либо хранить amount_paid на самом счёте и обновлять его в refreshInvoiceRemaining.
  - Файлы: `src/lib/finances/repository.ts`, `src/lib/finances/payments.ts`
- **[medium|data-integrity] Черновики платежей не связываются с проведёнными операциями; counterpartyId/dealId черновика никогда не заполняются** — PaymentForm.tsx отправляет форму без counterpartyId/dealId (submit, стр.177-181), хотя API (payments/route.ts:71-72) и схема paymentDrafts их принимают — поля мёртвые. Когда подписанный платёж проводится и приходит в bank_transactions, никакого кода, связывающего транзакцию с черновиком (например по…
  - Фикс: В sync после upsert искать для новых out-транзакций черновик paid по счёту получателя+сумме+дате (или по Точкиному paymentId, если он совпадает с requestId-цепочкой) и создавать bank_tx_link с counterparty/deal из черновика + проставлять inbound_invoices.paid_tx_id. В PaymentForm после ИИ-распознавания резолвить контрагента по ИНН и слать counterpartyId.
  - Файлы: `src/components/finances/PaymentForm.tsx`, `src/lib/finances/payments.ts`, `src/lib/finances/reconcile-invoices.ts`
- **[low|bug] Сшивка счёта с платежом игнорирует направление операции и направление счёта** — reconcileInboundInvoices (reconcile-invoices.ts:27-36) подбирает кандидатов из bank_transactions только по counterparty_inn, без фильтра t.direction: входящий счёт от поставщика (мы должны заплатить, ожидается direction='out') может «оплатиться» ВХОДЯЩИМ платежом от того же контрагента на ту же сумм…
  - Фикс: Добавить в выборку фильтр direction ('out' для incoming-счетов, 'in' для outgoing) и ORDER BY posted_at DESC; в matchInvoiceToTransactions поднять минимальный порог до inn+номер (0.8), а inn+сумма (0.6) отправлять в status='review', а не сразу 'paid'.
  - Файлы: `src/lib/finances/reconcile-invoices.ts`, `src/lib/finances/match-invoice.ts`
- **[low|bug] «Приход/Расход за месяц» считает переводы между своими счетами и pending-операции как оборот** — getFinanceSummary (repository.ts:37-48) суммирует все bank_transactions за месяц без исключения переводов между собственными счетами компании (при двух счетах в Точке один перевод надувает и month_in, и month_out на ту же сумму) и без фильтра status='booked'. Граница месяца — UTC (startOfCurrentMont…
  - Фикс: Исключать пары операций, где counterparty_account входит в bank_accounts (external_account_id LIKE counterparty_account||'/%'), фильтровать status='booked', считать границу месяца в Europe/Moscow.
  - Файлы: `src/lib/finances/repository.ts`
- **[low|bug] reconcileByInn привязывает по ИНН «первого по created_at» при дублях контрагентов — молча и с confidence 1.0** — reconcile.ts:40-45: при нескольких counterparties с одним ИНН (в системе контрагент может существовать в ролях клиент/перевозчик отдельными записями — см. /partners/from-bank) LATERAL берёт ORDER BY created_at LIMIT 1 — операция детерминированно, но возможно неверно, уходит на старейшую запись с mat…
  - Фикс: При >1 контрагенте с этим ИНН либо понижать confidence (<1.0) и помечать «требует проверки», либо не автопривязывать вовсе и оставлять в очереди ручного разноса.
  - Файлы: `src/lib/finances/reconcile.ts`
- **[medium|bug] Оборачиваемость: turnover_days нигде не вычисляется, а среднее не исключает provisional-значения вопреки D1** — (1) deals.turnoverDays / turnoverProvisional (src/lib/db/schema/deals.ts:63-65) нигде в коде не вычисляются и не записываются — формула D1 из docs/planning/DOMAIN_MODEL.md (строки 16, 752-757: cross-row цикл next_loading_arrival − this_loading_arrival, fallback помечается provisional) не реализована…
  - Фикс: Добавить в avg() фильтр AND turnover_provisional = FALSE; реализовать пересчёт turnover_days по D1 (cross-row окно по вагону: LEAD(date_arrived_loading_ts) OVER (PARTITION BY wagon_number ORDER BY ...)) в момент создания/обновления deals.
  - Файлы: `src/lib/partners/analytics.ts`, `src/lib/db/schema/deals.ts`, `docs/planning/DOMAIN_MODEL.md`, `src/components/partners/AnalyticsTab.tsx`
- **[medium|data-integrity] План-факт сравнивает маржу сделок с валовыми банковскими потоками с НДС — дельта систематически искажена при ОСНО** — getDirectionPnl (src/lib/finances/repository.ts:396-403, 416-426) считает «факт» как сумму всех приходов минус расходов по bank_tx_links направления. Банковские суммы — брутто с НДС 20% (бизнес на ОСНО), и в них смешаны платежи разной природы (авансы, возвраты, частичные оплаты). «План» — deals.marg…
  - Фикс: Либо приводить факт к нетто (вычитать НДС по ставке из связанного счёта/назначения платежа), либо честно переименовать колонку в «денежный поток (с НДС)» и не называть её фактической маржой; в идеале — сверять с inbound_invoices, где vat_amount уже извлекается.
  - Файлы: `src/lib/finances/repository.ts`, `src/components/finances/DirectionPnl.tsx`, `src/lib/finances/invoice-upload.ts`
- **[medium|missing-feature] Единственный работающий «отчёт» — банковская выписка; нет ни одного отчёта по маржe/обороту, дашборд без маржи** — Реально работающая выгрузка одна: выписка Точки в CSV/XLSX/1C (src/lib/finances/export-builders.ts — чистые билдеры с тестами, route src/app/api/finances/tochka/statement/export/route.ts, UI src/components/finances/StatementBuilder.tsx). Для экспедитора, чей продукт — маржа с рейса, нет: помесячного…
  - Фикс: Минимальный полезный шаг до полного «Отчёта ПВ»: агрегат плановой маржи по orders×месяц (из direction_monthly_rates и order_stone_lines уже всё есть в БД) + плитка «Маржа за месяц (план)» на Сводке + xlsx-выгрузка этого свода через существующий buildXlsx-паттерн.
  - Файлы: `src/lib/finances/export-builders.ts`, `src/components/trades/MonthlyRateGrid.tsx`, `src/app/(app)/dashboard/page.tsx`
- **[low|ux] UX: /reports дублирует карточки /finances и не имеет собственного содержания** — Обе карточки на src/app/(app)/reports/page.tsx (строки 20-45) ведут на поверхности «Финансов» («Выписка по счёту» → /finances/statement, «План-факт» → /finances), которые уже доступны с самой страницы /finances (там те же карточки «Выписка»/«Платёж»). Своих данных у вкладки ноль — для оператора это …
  - Фикс: До реализации Отчёта ПВ наполнить /reports хотя бы реальными агрегатами из живых таблиц (orders, bank_transactions, inbound_invoices): выручка/закупка щебня по месяцам, дебиторка/кредиторка (getDebtSummary уже есть), счётчик заявок по статусам — всё это уже считается в других репозиториях и требует только композиции.
  - Файлы: `src/app/(app)/reports/page.tsx`, `src/app/(app)/finances/page.tsx`
- **[medium|bug] Баг разбора: «ВЫГРУЖЕН» классифицируется как гружёный вагон** — LOADED_RE = /(ГРУЖ|ПОГРУЖ|ЗАГРУЖ|загруж|погруж|груж)/i (src/lib/mail-intake/parse-dislocation.ts:31) — подстрока «ГРУЖ» содержится в словах «ВЫГРУЖЕН/выгружена/выгружен на ПП», типичных для колонки операции дислокационных отчётов. Проверка LOADED_RE идёт первой (строки 46–48), поэтому строка выгруже…
  - Фикс: Добавить негативную проверку перед LOADED_RE: если строка матчит /ВЫГРУЖ|выгруж|РАЗГРУЖ|разгруж/ — считать loaded=false (выгружен) либо null, и проверять EMPTY_RE до LOADED_RE. Добавить тест-кейсы «ВЫГРУЖЕН», «ВЫГРУЖЕНА НА ПП».
  - Файлы: `src/lib/mail-intake/parse-dislocation.ts`, `src/lib/mail-intake/parse-dislocation.test.ts`
- **[medium|bug] Из xlsx-дислокации читается только первый лист книги** — xlsxToText (src/lib/requests/xlsx.ts:6–13) берёт wb.SheetNames[0] и игнорирует остальные листы. getEmailExtractableText (src/lib/mail-intake/inbox-repo.ts:363–383), через который идёт разбор дислокации, наследует это ограничение. Реальные дислокационные книги собственников часто многолистовые (гружё…
  - Фикс: В xlsxToText конкатенировать все листы (for sheetName of wb.SheetNames → sheet_to_csv, с заголовком [лист N]), либо добавить параметр allSheets=true и использовать его в getEmailExtractableText. Для «Создать запрос» поведение первого листа можно оставить.
  - Файлы: `src/lib/requests/xlsx.ts`, `src/lib/mail-intake/inbox-repo.ts`
- **[medium|missing-feature] Дислокация распознаётся только из тела + xlsx; PDF/CSV/изображения-вложения молча пропускаются** — getEmailExtractableText (src/lib/mail-intake/inbox-repo.ts:357–383) подключает только вложения, прошедшие isXlsxAttachment (расширение .xls/.xlsx или mime spreadsheet/excel), плюс text/plain тело (getEmailText:276–295 — text/plain only, HTML-only письма дают пустой текст). Дислокация, присланная PDF…
  - Фикс: В getEmailExtractableText добавить ветки: text/csv → как есть; application/pdf → существующий pdf-экстрактор текста; для HTML-only писем — html→text fallback в getEmailText (таблица дислокации нередко прямо в теле письма). Контрольная цифра в parseDislocation уже отфильтрует шум.
  - Файлы: `src/lib/mail-intake/inbox-repo.ts`, `src/lib/mail-intake/pdf.ts`, `src/components/inbox/LetterActions.tsx`
- **[medium|missing-feature] Пересылка дислокаций клиенту не реализована: forward_to_email хранится, но никогда не используется для отправки** — direction_client_bindings.forward_to_email / forward_cc_emails (src/lib/db/schema/directionBindings.ts:45–66) заполняются через BindingsPanel и репозиторий (src/lib/directions/repository.ts:379–392), но grep по src/ не находит ни одного места, где эти адреса читаются для отправки письма — нет ни for…
  - Фикс: Либо реализовать минимальную пересылку (после привязки дислокации к направлению — кнопка/авто-шаг «Переслать клиенту»: SMTP-отправка оригинала .eml/вложений на forward_to_email, лог в ingested_files), либо до реализации скрыть поле из BindingsPanel/пометить его «(пока не используется)», чтобы оператор не считал пересылку настроенной.
  - Файлы: `src/lib/db/schema/directionBindings.ts`, `src/components/directions/BindingsPanel.tsx`, `docs/planning/PRODUCT_DIRECTIONS.md`
- **[low|ux] POST /api/inbox/[id]/dislocation не проверяет тип письма, не помечает его дислокацией и не сверяет отправителя с привязкой** — Роут (src/app/api/inbox/[id]/dislocation/route.ts:22–44) принимает любой id письма и любой directionId: (1) не проверяет kind письма — можно «разобрать дислокацию» из счёта, и случайные 8-значные числа с валидной контрольной цифрой засорят expected_wagon_ids (контрольная цифра пропускает 1 из 10 слу…
  - Фикс: В роуте: после успешного разбора вызывать setInboxCategory(id, 'dislocation'); при kind письма, явно отличном от dislocation/other, возвращать предупреждение в payload; если у направления несколько активных привязок или sender ≠ inboundMailbox — отдавать список привязок для явного выбора, а не молчаливый saved:false.
  - Файлы: `src/app/api/inbox/[id]/dislocation/route.ts`, `src/lib/mail-intake/inbox-repo.ts`
- **[low|missing-feature] Нет сводного экрана дислокации и алертов по простою — данные о вагонах видны только внутри карточки сделки** — Единственная точка, где оператор видит положение вагонов — вкладка «Исполнение» внутри карточки сделки (src/app/(app)/deals/[id]/page.tsx:268,280 → ExecutionTab). Нет: (а) сводного экрана «все вагоны по всем направлениям» (вагон, не попавший ни в одну привязку/сделку, невидим в принципе — bound-множ…
  - Фикс: После починки ингестии movements (finding 1): сводная страница/виджет «Вагоны» с фильтром «простой > N сут» и «needsReview», плюс бейдж с количеством проблемных вагонов на карточке направления в досках. Источник данных уже готов — getDirectionExecution возвращает per-wagon daysInOperation и needsReview.
  - Файлы: `src/app/(app)/deals/[id]/page.tsx`, `src/components/execution/ExecutionTab.tsx`, `src/lib/execution/repository.ts`, `docs/planning/PRODUCT_DIRECTIONS.md`
- **[medium|data-integrity] Заявка, созданная ИИ из письма, не видна со страницы письма — риск дублей** — Провенанс письмо→заявка хранится только текстом: requests.sourceRef = email.messageId (src/lib/mail-intake/result-to-request.ts:77), FK на ingested_files нет. Страница письма /inbox/[id] (page.tsx + LetterActions.tsx:44-54) ничего не знает о том, что из этого письма ИИ уже авто-создал заявку R-…: кн…
  - Фикс: В getInboxEmailDetail подтянуть заявки по sourceRef = gmailMessageId (или добавить колонку requests.sourceFileId FK) и показывать на странице письма баннер «Из этого письма создана заявка R-… → открыть» вместо/рядом с кнопкой создания. На карточке заявки — обратная ссылка на письмо.
  - Файлы: `src/lib/mail-intake/result-to-request.ts`, `src/components/inbox/LetterActions.tsx`, `src/app/(app)/inbox/[id]/page.tsx`
- **[medium|bug] RFQ из вложения никогда не авто-файлится: bodyConfidence||0.7 игнорирует уверенность вложений** — В orchestrator.ts:84 disposition считается от confidence = classification.bodyConfidence || 0.7. Частый кейс «пустое тело + заявка в xlsx/картинке»: bodyKind='other', bodyConfidence≈0 → подставляется выдуманное 0.7, которое всегда < AUTO_INTAKE_MIN_CONFIDENCE (0.85, thresholds.ts:7). Даже если класс…
  - Фикс: Считать confidence = max(bodyConfidence, max(confidence вложений с kind='client_rfq')) — данные уже есть в classification.attachments; убрать хардкод || 0.7.
  - Файлы: `src/lib/mail-intake/orchestrator.ts`, `src/lib/mail-intake/thresholds.ts`, `src/lib/mail-intake/classify-schema.ts`
- **[medium|bug] Клиентский запрос с confidence<0.6 молча игнорируется без какой-либо пометки** — decideRfqDisposition (thresholds.ts:34-35): confidence<0.6 → 'ignore'; в orchestrator.ts:125-127 это превращается в outcome.ignored=true — ни карантина, ни флага. Письмо остаётся в плоском списке «Все» как рядовое, и поскольку kind на письме не проставляется вообще (см. находку про типизацию), у опе…
  - Фикс: Для kind='client_rfq' с confidence 0..0.6 писать карантин-ряд LOW_CONFIDENCE (или хотя бы проставлять kind на письме), оставив 'ignore' только для не-RFQ типов.
  - Файлы: `src/lib/mail-intake/thresholds.ts`, `src/lib/mail-intake/orchestrator.ts`
- **[medium|bug] Повторная отправка RFQ плодит дубли опросов в request_owner_quotes** — sendRfqToCarriers (outreach.ts:127-137) на каждый клик «Отправить» вставляет новые ряды (line × carrier, status='polled') без проверки уже существующих polled-рядов и без уникального индекса в схеме requestOwnerQuotes. Оператор, отправивший запрос дважды (или добавивший одного перевозчика к прежнему…
  - Фикс: Перед insert обновлять существующий (requestLineId, ownerId, status='polled') ряд новым sourceMessageId/polledAt (upsert) либо добавить частичный уникальный индекс по (request_line_id, owner_id) WHERE status='polled'.
  - Файлы: `src/lib/rfq/outreach.ts`, `src/lib/db/schema/requestOwnerQuotes.ts`
- **[medium|missing-feature] Скан-PDF и Word-вложения всегда уходят в ручной разбор (OCR-фоллбэк не сделан)** — PDF без текстового слоя (типичный скан счёта) детектится в pdf.ts:33 (<40 символов → 'scan') и через to-extract-input.ts:79-81 уходит в карантин «Вложение не читается», хотя vision-путь для изображений уже существует (modality:'image', to-extract-input.ts:67-71) — не хватает только рендера первой ст…
  - Фикс: Рендерить 1-ю страницу скан-PDF в PNG (pdfjs canvas или @napi-rs/canvas) и пускать по существующему image/vision-пути; для docx — mammoth/docx-парсер в текст.
  - Файлы: `src/lib/mail-intake/pdf.ts`, `src/lib/mail-intake/to-extract-input.ts`
- **[medium|bug] Счета сохраняются без гейта по уверенности и с хардкодом direction:'incoming'** — Ветка invoice в orchestrator.ts:131-160 пишет каждый extract как pending-счёт безусловно: ни порога confidence (классификация вложения может быть 0), ни карантина для сомнительных, ни проверки «не наш ли это исходящий счёт» — direction всегда 'incoming'. Галлюцинация экстрактора (выдуманный ИНН/сумм…
  - Фикс: Добавить decideInvoiceDisposition: per-attachment confidence ниже порога или отсутствие ИНН+суммы → карантин вместо pending; статус 'needs_review' для середины диапазона.
  - Файлы: `src/lib/mail-intake/orchestrator.ts`, `src/lib/mail-intake/invoice-extract.ts`
- **[low|ux] Из карантин-карточки нельзя перейти к самому письму** — QuarantineList показывает тему/отправителя/вложения, а подсказки говорят «Откройте письмо…», но ссылки на /inbox/[id] нет — sourceFileId выбирается в listQuarantine (quarantine-repo.ts:47), однако в QuarantineItem наружу не отдаётся и в карточке не используется. Оператор вынужден искать письмо в общ…
  - Фикс: Прокинуть sourceFileId в QuarantineItem и сделать тему письма ссылкой на /inbox/{sourceFileId}.
  - Файлы: `src/lib/mail-intake/quarantine-repo.ts`, `src/components/requests/QuarantineList.tsx`
- **[low|bug] Мелочи: бессмысленный тернарник для scan_pdf и мёртвая колонка ingested_files.deal_id** — (1) orchestrator.ts:39: `conv.reason === "scan_pdf" ? "UNSUPPORTED_ATTACHMENT" : "UNSUPPORTED_ATTACHMENT"` — обе ветки одинаковы, различие скана и неподдержанного формата теряется в reasonCode (остаётся только в agentReason-тексте). (2) Колонка ingested_files.deal_id (schema/ingest.ts:51 + индекс id…
  - Фикс: (1) Завести отдельный reasonCode SCAN_PDF (quarantine-map уже расширяем) с подсказкой «нужен OCR». (2) Либо писать dealId при привязке (через направление → его orderId), либо выпилить мёртвое поле из выборок.
  - Файлы: `src/lib/mail-intake/orchestrator.ts`, `src/lib/db/schema/ingest.ts`, `src/lib/mail-intake/inbox-repo.ts`
- **[medium|dead-end] Комбинированная КП-страница /requests/kp осиротела после свёртки доски «Запросы» в «Сделки»** — Страница /requests/kp (мульти-КП по направлениям из разных запросов, с markDirectionsKpIssued) существует и работает, но единственный UI-вход на неё пропал: /requests теперь redirect('/deals') (src/app/(app)/requests/page.tsx:6-8), а grep по «requests/kp» находит только сами страницы; RequestWorklis…
  - Фикс: Либо добавить мульти-выбор направлений на доске «Сделки» с кнопкой «КП по выбранным» (ссылка /requests/kp?lines=...), либо удалить страницу, чтобы не висел мёртвый эндпоинт с побочной записью kpIssuedAt.
  - Файлы: `src/app/(app)/requests/kp/page.tsx`, `src/app/(app)/requests/page.tsx`, `src/components/requests/RequestWorklist.tsx`
- **[medium|data-integrity] kpIssuedAt перезаписывается при каждом открытии страницы КП (side-effect в GET)** — RequestKpPage и CombinedKpPage — серверные GET-страницы, которые на каждом рендере вызывают markLinesKpIssued/markDirectionsKpIssued (src/app/(app)/requests/[id]/kp/page.tsx:36, src/app/(app)/requests/kp/page.tsx:27), а репозиторий ставит kpIssuedAt = new Date() без условия «только если NULL» (src/l…
  - Фикс: В UPDATE добавить условие WHERE kp_issued_at IS NULL (сохранять первую дату), а в идеале — выносить выпуск КП в явное POST-действие, а не побочный эффект просмотра.
  - Файлы: `src/app/(app)/requests/[id]/kp/page.tsx`, `src/app/(app)/requests/kp/page.tsx`, `src/lib/requests/repository.ts`
- **[medium|bug] КП печатает «к тарифу 10-01», хотя с 2026 действует ТР-1 (Приказ ФАС 894/25)** — DEFAULT_TARIFF_REF = "10-01" зашит в src/lib/pricing/rate-expression.ts:8, и formatRateExpression подставляет его в клиентский документ КП («+10% к тарифу 10-01», «по тарифу 10-01») через rateText в proposalKp.ts:93-99. При этом targetTariffRef, который AI-extraction сохраняет из письма (requests/sc…
  - Фикс: Добавить в RateExpression поле tariffRef, прокидывать line.targetTariffRef, дефолт сменить на «ТР-1» (для старых писем сохранять исходный ref); поправить тесты rate-expression.test.ts.
  - Файлы: `src/lib/pricing/rate-expression.ts`, `src/lib/documents/proposalKp.ts`
- **[medium|data-integrity] rateClientSuggested пишется при конверсии запроса в сделку, но нигде не читается — целевая ставка клиента теряется в карточке Запроса** — conversion.ts:48 и intakeToTrade.ts:42 сохраняют targetRatePerWagon в directions.rateClientSuggested (колонка существует: db/schema/directions.ts:50). Но карточка сделки выбирает только directions.rateClient (deals/[id]/page.tsx:139) и не передаёт suggestion в воркшит: RateInput «Ставка клиенту» пол…
  - Фикс: Выбирать rateClientSuggested в primaryDir-запросе страницы сделки и передавать его как suggested в RateInput «Ставка клиенту» (паттерн D16 уже готов в RateInput).
  - Файлы: `src/lib/trades/conversion.ts`, `src/app/(app)/deals/[id]/page.tsx`, `src/components/trades/RequestWorksheet.tsx`
- **[medium|missing-feature] В карточке Запроса нет поля груза — авто-тариф всегда считает щебень (класс 1), cargoName хардкожен в null** — RequestWorksheet.save() шлёт cargoName: null (строка 138), а upsertPrimaryDirection/upsertPrimaryStoneLine подставляют 'щебень' (quoteRepository.ts:96,150). RequestTariffPanel не передаёт etsngCode в /api/tariff/matrix — computeQuoteMatrix берёт DEFAULT_ETSNG_CODE 232431 (щебень, класс 1, quoteMatri…
  - Фикс: Добавить в воркшит компактный выбор груза (пресеты как в TariffCalculator ETSNG_PRESETS), сохранять cargoName/etsngCode и пробрасывать etsngCode в RequestTariffPanel → /api/tariff/matrix, чтобы scope-guard честно отказывал на не-классе-1.
  - Файлы: `src/components/trades/RequestWorksheet.tsx`, `src/components/trades/RequestTariffPanel.tsx`, `src/lib/tariff/quoteMatrix.ts`, `src/lib/trades/quoteRepository.ts`
- **[medium|dead-end] Результат калькулятора — тупик: «Новая сделка» не переносит расчёт, итог нельзя сохранить** — На странице /tariff карточка «Новая сделка — Занести расчёт в запрос» — это голый Link на /deals/new (tariff/page.tsx:33-45): станции, число вагонов, рассчитанный тариф и предоставление не передаются, оператор перенабирает всё вручную в воркшите (где авто-тариф ещё и пересчитается только в повагонно…
  - Фикс: Передавать расчёт в /deals/new через query-параметры (originEsr/destEsr/raw, wagonCount, rateClient=тариф, provision) и префиллить NewDealForm; как минимум — кнопка «Скопировать расчёт» текстом для вставки в письмо.
  - Файлы: `src/app/(app)/tariff/page.tsx`, `src/components/tariff/TariffCalculator.tsx`
- **[low|ux] VoiceQuote выбрасывает кандидатов неоднозначных станций, которые сервер уже вернул** — API /api/tariff/voice возвращает StationResolution с массивом candidates (voice/route.ts:28-38, resolveStation наполняет его и при ambiguous). Клиентский интерфейс StationResolution в VoiceQuote.tsx:52-56 поле candidates не объявляет и не использует: при неоднозначной станции пользователь видит толь…
  - Фикс: Прокинуть candidates в applyVoiceResponse и отрисовать чипы выбора (как в StationField.pickCandidate) под соответствующим полем.
  - Файлы: `src/components/tariff/VoiceQuote.tsx`, `src/app/api/tariff/voice/route.ts`
- **[low|bug] Мёртвый параметр emptyRun + дрейф типов MatrixCell между сервером и воркшитом** — (1) emptyRun принимается distance-схемой (src/lib/distance/schema.ts:19) и передаётся всеми вызовами resolveDistance (quoteService.ts:176, quoteMatrix.ts:204 — всегда false), но в самом движке расстояния нигде не используется — vestigial. По существу порожний пробег в ставке предоставления УЧТЁН вну…
  - Фикс: Удалить emptyRun из distance-схемы и вызовов (или реализовать честный расчёт порожнего возврата по полной дистанции как опцию); синхронизировать MatrixCell в requestTypes.ts с серверным (nullable + inventoryConfidence) и guard-ить null в ProvisionFigures; убрать неиспользуемый проп dealType.
  - Файлы: `src/lib/distance/schema.ts`, `src/lib/tariff/computeInventory.ts`, `src/components/trades/requestTypes.ts`, `src/components/trades/RequestTariffPanel.tsx`
