# RFQ "Запросы" Upgrade — Consolidated Understanding & Build Plan

> Synthesis of the 8 area studies (01–08) in this folder. Lead-engineer view.
> Verified against live code on `main` (commit `d462ec1`): migrations `0000`–`0003`,
> `IntakeStudio.tsx` = 495 lines, no `src/lib/geo`, no `src/lib/wagons`,
> no `src/lib/documents`, no `src/lib/config`, no `pg_trgm` anywhere.

---

## A. Current-state verdict (against the 6 goals)

The RFQ intake slice that shipped (commits `5bfb62e`/`d462ec1`) is genuinely solid as a **capture funnel** but stops dead at the point where every one of the 6 upgrade goals begins. **Goal 1 (station auto-resolve with confirm): ~10%** — the `requests` flow stores `originRaw`/`destRaw` verbatim, `request_lines.originEsr/destEsr` exist as nullable FKs but are *always NULL*; the `stations`/`roads`/`station_aliases` tables exist (migration `0000`) but hold **zero rows**, there is no resolver, no `pg_trgm`, no confirm UI. **Goal 2 (client auto-find with confirm): ~25%** — the AI emits `clientGuess` and `ClientPicker` does a client-side substring filter, but there is no fuzzy search endpoint, `nameRawVariants` is never written, and `clientGuess` is shoved straight into a `temp` label with no "это они?" step. **Goal 3 (wagon types first-class): ~15%** — `wagonType` is free text defaulting to `'ПВ'` on the *header only* (no per-line column, verified `requests.ts:54`), no enum, no dropdown, no normalizer (the canonical map lives only as Python pseudocode in `DOMAIN_MODEL.md`). **Goal 4 (three rate forms): ~33%** — flat ₽/wagon works (`price_protocol_rates.rate` NUMERIC, verified `pricing.ts:87`), raw text survives in `targetRateRaw`, but there is no `rate_kind` discriminator, no Прейскурант 10-01 data/table/calculator, no markup fields. **Goal 5 (owner letter + A4 КП): ~0%** — no template, route, PDF lib, print CSS, company config, or requisites exist anywhere; the term "КП" is absent from all four blueprints. **Goal 6 (tight mobile + desktop): ~50%** — strong OKLCH/token foundation and compositor-only motion, but a concentrated set of mobile failures (sub-44px touch targets everywhere via `h-9`, fixed-width `w-40` filters, wasted drop-zone height, safe-area bug on the sticky save bar, scattered detail-line wrapping) cause the "scary" feel.

---

## B. Data-source decision

### B1. ESR station codes + roads — MUST be seeded; no live API

- **Source of truth: the RZhD ЕСР classifier (Единый Сетевой Разметочный классификатор)** — ~10–11k active station rows (`esr_code`, name, road code, region) plus ~17 roads. Obtained as CSV/XLSX from the RZhD open-data portal / "Техническая документация РЖД". This is a **one-time seed**, refreshed occasionally — *not* a runtime API.
- **Supplement the seed with two authoritative inline sources already in-repo:** (1) the golden fixtures `docs/planning/examples/order-zayavka-cem1.md` and `psc-vektor-rns.md` (real names + inline ESR like `ДОБРЯТИНО (243309)`); (2) the operator's historical `Отчет ПВ Приоритет Логистика.xlsx` (P15-4) — its origin/dest names are the **priority manual aliases** (Асбест, Голышманово, Добрятино…).
- **Decision:** seed `roads` first (~17 rows), then `stations` (~10k, `ON CONFLICT (esr_code) DO NOTHING`), then `station_aliases` (`source='manual', confidence=1.0`, `ON CONFLICT (alias_normalized) DO NOTHING`). The three planning-doc ESR codes for "Асбест" (712008/768504/764607) are **all invented** — the real code comes only from the classifier import, never from doc text.
- **Fuzzy resolution = in-process Postgres `pg_trgm`**, not a Python worker (the RFQ flow runs in Node/Next.js). Threshold **0.55–0.65 + mandatory top-3 confirm** (the D15/§5 figure of 0.82 is too high for voice distortion — "Азбест"→"Асбест" ≈ 0.73).

### B2. Прейскурант 10-01 tariff — DEFER; do NOT seed in this upgrade

- No table, seed, calculator, or zone mapping exists. The real tariff requires either a licensed feed (ЭТРАН / ГВЦ / ЖТТК) or a scraping pipeline, plus an ESR→tariff-zone map that **does not exist** and depends on the station dict being seeded first.
- 10-01 amounts change by ФАС/government decree → any cached base goes stale silently; VAT basis differs (10-01 is без НДС, ПСЦ is в т.ч. НДС 22%).
- **Decision:** for Goal 4 ship the **schema + expression model only** now (store the indicative expression, resolve to a number at confirm time), and treat the *actual* 10-01 base number as **operator-entered** ("тариф 10-01 по направлению = X ₽, +N%"). Build the live tariff calculator as a separate, later milestone. This unblocks "+X% к тарифу" as a representable, computable rate **without** the licensed dataset.

---

## C. Dependency-ordered build plan

Phases are ordered so each item's dependencies ship first. Sizes: S ≈ ½ day, M ≈ 1–2 days, L ≈ 3–5 days.

### Phase 0 — Foundations (unblocks everything; no UI risk)

1. **Enable `pg_trgm` + trigram indexes** — *new migration `0004`* (`CREATE EXTENSION IF NOT EXISTS pg_trgm;`, GIN indexes on `stations.name_normalized`, `station_aliases.alias_normalized`, `counterparties.name_canonical`). Touches: `drizzle/migrations/0004_*.sql`, `src/lib/db/schema/{geo,counterparties}.ts` (index decls). **S.** Serves Goals 1 & 2. *Verify Railway Postgres allows the extension before merging.*

2. **Canonical wagon-type module** — port the `DOMAIN_MODEL.md` map to TS. New `src/lib/wagons/wagon-type.ts`: `WAGON_TYPES` const (`{code,labelRu,labelRuPlural,aliases}` for ПВ/КР/ЦС/ПЛ/ХП + escape hatch) and `normalizeWagonType(raw): string|null`. Touches: new file + unit test. **S.** Serves Goal 3.

3. **Company config + requisites + logo** — new `src/lib/config/company.ts` (`COMPANY = {name, inn, kpp, ogrn, legalAddress, bank, contacts}` typed const) and `public/logo.svg` (vectorize the SC monogram or drop a real Приоритет Логистика mark). Touches: new files. **S.** Serves Goal 5. *Blocked on operator providing real requisites (see Open Q).*

### Phase 1 — Station resolution (Goal 1, the live pain)

4. **Seed scripts: roads + stations + aliases** — new `scripts/seed-roads.ts`, `scripts/seed-stations.ts`, `scripts/seed-aliases.ts` consuming the RZhD ЕСР classifier + golden fixtures. Touches: new scripts, package.json script entries. **L** (data wrangling dominates). Serves Goal 1. *Hard dependency for items 5–7 — FK violations occur if a Direction/line stores an ESR not yet in `stations`.*

5. **Resolver service** — new `src/lib/geo/resolver.ts`: `resolveStationName(raw): Promise<StationCandidate[]>` (3-step: exact on `name_normalized`/`alias_normalized` → `similarity() > threshold` top-5 → return scored candidates incl. ESR + road name). Read-only. Touches: new file + test. **M.** Serves Goal 1.

6. **Resolve API + extract wiring** — `POST /api/stations/resolve` (or fold candidates into the `/api/requests/extract` response: `candidatesOrigin[]`/`candidatesDest[]` per line) and `POST /api/stations/confirm-alias` (writes `station_aliases` `source='fuzzy_confirmed'`, score→`confidence`, self-training). Also relax `prompt.ts` rule 10 to **pass through inline ESR** like `(243309)`. Touches: `src/app/api/stations/**`, `src/lib/requests/{extraction,prompt}.ts`. **M.** Serves Goal 1.

7. **Station-confirm UI in review** — per-line confirm chip in `IntakeStudio` review phase: "AI распознал «Азбест» → Асбест (СВР, 712008)? Да / Другая / Оставить как есть". Touches: `src/components/requests/IntakeStudio.tsx` (or extract `IntakeReviewCard.tsx`). **M.** Serves Goals 1 & 6 (tight mobile chip).

### Phase 2 — Client auto-match (Goal 2)

8. **Fuzzy counterparty search** — `searchCounterparties(query): Promise<{id,name,roles,score}[]>` using `word_similarity(query, name_canonical) OR ANY(name_raw_variants)` top-5; new `GET /api/counterparties/search?q=`. Keep the existing full-list endpoint for picker init. Touches: `src/lib/counterparties/repository.ts`, `src/app/api/counterparties/search/route.ts`. **M.** Serves Goal 2.

9. **Populate `nameRawVariants` on confirm** — in `resolveCounterpartyId`/`linkClient`, append the confirmed raw string (`WHERE NOT name_raw_variants @> ARRAY[raw]`) to grow the corpus organically. Touches: `src/lib/counterparties/repository.ts`, `src/lib/requests/repository.ts`. **S.** Serves Goal 2.

10. **`ConfirmClientBanner` + intake wiring** — new `src/components/requests/ConfirmClientBanner.tsx` ("AI распознал «{guess}». Это {candidate}?" Да/Нет/Выбрать). `IntakeStudio.applyResult()` calls the search endpoint when `clientGuess` set, shows banner above `ClientPicker`; **D16: never auto-confirm** — explicit keystroke only (annotate `// D16: operator-confirmed`). Show banner only when top score > 0.3 (env `COUNTERPARTY_SIMILARITY_THRESHOLD`). Touches: new component, `IntakeStudio.tsx`. **M.** Serves Goal 2.

### Phase 3 — Wagon types first-class (Goal 3)

11. **Per-line `wagon_type` column + propagation** — *migration `0005`* adds nullable `wagon_type` to `request_lines` (inherits header when NULL). Touches: `drizzle/migrations/0005_*.sql`, `src/lib/db/schema/requests.ts`, `src/lib/requests/{schema,repository}.ts`. **S.** Serves Goal 3.

12. **`<WagonTypePicker>` everywhere + normalize-on-save** — replace free-text inputs in `IntakeStudio.tsx`, `PriceProtocolForm.tsx`, `DirectionForm.tsx` with a combobox backed by `WAGON_TYPES`; run `normalizeWagonType()` in `normalize.ts` before DB write; add the normalization table to the AI prompt; relax `rateLineSchema`/`requestCreateSchema` to `z.enum([...]) | z.string()` (validate known, warn unknown). Touches: 3 components, `src/lib/requests/{normalize,schema,prompt}.ts`, `src/lib/pricing/schema.ts`. **M.** Serves Goal 3. *Also normalize both sides in `pricing/{lookup,resolve}.ts` so 'Полувагон' and 'ПВ' match the same rate line.*

### Phase 4 — Rate expressions (Goal 4, schema-only for tariff)

13. **`rate_kind` discriminator + markup fields** — *migration `0006`* adds to `price_protocol_rates` (and mirror nullable fields on `request_lines`): `rate_kind TEXT CHECK ('flat_rub','tariff_indicative','tariff_plus_markup') DEFAULT 'flat_rub'`, nullable `tariff_ref`, `tariff_base_amount`, `markup_pct`. Additive, flat_rub unchanged. Touches: `drizzle/migrations/0006_*.sql`, `src/lib/db/schema/{pricing,requests}.ts`. **M.** Serves Goal 4.

14. **Discriminated-union schema + `resolveAmount()`** — extend Zod `rateLineSchema` to a `z.discriminatedUnion('kind', …)`; add `resolveAmount(rateLine, tariffBase?)` in `src/lib/pricing/resolve.ts` that always yields ₽/wagon for margin math (expression kept intact in storage). Gate Direction activation on a resolved absolute number (D17 immutability). Touches: `src/lib/pricing/{schema,resolve,lookup}.ts`. **M.** Serves Goal 4.

15. **Rate-mode toggle in form + raw-rate parsing** — per-row "Фиксированная / Индикатив к 10-01" toggle in `PriceProtocolForm.tsx` (indicative ⇒ `markup_pct %` + operator-entered tariff base, live computed-rate preview). Extend the intake prompt to extract `targetRateMarkupPct`/`targetRateTariffRef` from text like "+10% к тарифу". Touches: `PriceProtocolForm.tsx`, `src/lib/requests/prompt.ts`, review UI. **M.** Serves Goal 4.

### Phase 5 — Outputs: owner letter + КП (Goal 5)

16. **Plain-text owner letter** — new `src/lib/documents/ownerLetter.ts`: `buildOwnerLetterText(request, line, ownerName)` → formatted Russian string from data available *today* (origin, dest, cargo, wagons, period, wagonType, notes). Wire "Копировать письмо" per line via Clipboard API in the detail page. Touches: new file, `src/app/(app)/requests/[id]/page.tsx`, `RequestStatusActions.tsx`. **M.** Serves Goal 5. *Add `email`/`phone` to `counterparties` (migration) so letters can be pre-addressed — small additive.*

17. **A4 КП print route** — new `src/app/(app)/requests/[id]/kp/page.tsx` + `print.css` with `@media print` (A4, force light-theme vars, letterhead = `logo.svg` + `COMPANY` requisites, embed `public/fonts/` woff2). "Печать КП" button opens it in a new tab → browser Print→PDF. **Approach (a) print-CSS first** (zero deps); defer `@react-pdf/renderer` server route until automation is needed. Mark owner-cost/margin fields "по результатам опроса" until owner-sourcing (RFQ-3) exists. Also surface `periodFrom/periodTo` on the detail page (loaded but not rendered today). Touches: new route + css, detail page, company config. **L.** Serves Goal 5.

### Phase 6 — Mobile/desktop tightening (Goal 6; can run in parallel after Phase 0)

18. **Touch-target pass (44px)** — responsive `h-11 md:h-9` (never blanket) across `BoardFilters`, `BoardTabs`, `IntakeStudio` buttons, `RequestStatusActions`, `ClientPicker` items (`min-h-11`); wrap the bare `Trash2` icon in a `size-11` hit area. Touches: ~5 components. **M.** Serves Goal 6.

19. **Layout fixes** — `BoardFilters` `w-40`→`w-full sm:w-40` + `flex-col sm:flex-row`; tabs/filters own rows on mobile; drop-zone `py-14`→`py-8 sm:py-14`; main top padding `pt-4 md:pt-[var(--space-section)]`; detail direction-lines → 2-row block on mobile (drop `min-w-[7rem]`); `EntryCard` subtitle `line-clamp-3`; route-hero `flex-[2] min-w-0` both spans. Touches: `BoardFilters.tsx`, board pages, `IntakeStudio.tsx`, `layout.tsx`, `[id]/page.tsx`, `requests/page.tsx`, `RequestCard.tsx`. **M.** Serves Goal 6.

20. **Safe-area + sticky save bar** — `bottom-[calc(5.5rem+env(safe-area-inset-bottom))]`, `md:bottom-[calc(1rem+env(safe-area-inset-bottom))]`; introduce a `--bottombar-clearance` token to decouple from `BottomBar` height; add a scroll region to the review phase. Touches: `IntakeStudio.tsx`, `src/styles/tokens.css`. **S.** Serves Goal 6.

### Phase 7 — Hardening (cross-cutting, do alongside)

21. **Voice channel safety** — cap audio bytes before base64 (`MAX_AUDIO_BYTES` ~4MB) / duration limit + countdown; add `try/catch` around the `MediaRecorder.onstop` async IIFE; validate `OPENROUTER_AUDIO_MODEL` at startup (currently `openai/gpt-4o-audio-preview`); rate-limit `/api/requests/extract`. Touches: `IntakeStudio.tsx`, `src/lib/requests/extraction.ts`, route. **M.** Serves Goals 1–3 reliability (see Open Q on STT).

---

## D. Open questions for the operator (only the load-bearing few)

1. **RZhD ЕСР classifier file** — can you provide the actual classifier CSV/XLSX (or confirm we may scrape the RZhD open-data portal)? Item 4 is blocked without authoritative ESR↔road data; planning-doc codes are invented.
2. **Прейскурант 10-01 — confirm we defer the live calculator** and accept **operator-entered tariff base** for "+X%" rates in this round (Goal 4 schema ships now; licensed ЭТРАН/ГВЦ feed is a later milestone). Yes/no?
3. **Company requisites for the КП** — need real ИНН, КПП, ОГРН, юр. адрес, банковские реквизиты, and an official logo for "Приоритет Логистика". Item 3/17 cannot legally issue a letterhead КП without these.
4. **Voice STT provider** — keep single-pass Gemini/`gpt-4o-audio-preview` transcription-in-extraction, or add a dedicated Whisper STT step? The current path silently fails if the configured model lacks `input_audio`. Affects voice tolerance for all of Goals 1–3.
5. **Confirm thresholds** — OK to ship station fuzzy at **0.55–0.65** (not the doc's 0.82) and client banner at **>0.3**, both with mandatory confirm? Tunable via env after first production use.

---

## E. Risks + sequencing notes

- **FK ordering is hard:** `directions/price_protocol_rates/request_lines` ESR FKs are `ON DELETE SET NULL` but inserting an ESR not present in `stations` **fails**. The classifier seed (item 4) MUST land before any item that writes ESR. Until then, raw-string storage (D15) is the correct interim — do not force ESR.
- **One-time backfill needed:** every row created today has `originEsr/destEsr = NULL`; seeding the dict later will **not** auto-populate them. Plan a backfill migration after item 5.
- **D16 is locked:** client identity is *never* auto-confirmed regardless of similarity score. Any high-score auto-select violates the decision — the confirm step stays mandatory (item 10).
- **D17 is locked:** indicative rates must resolve to an absolute number before a Direction goes `active`; `resolveAmount()` must gate activation, not defer (item 14).
- **Wagon-type silent misses:** the rate-lookup index key includes `wagon_type`; until item 12 normalizes both stored and query sides, "Полувагон" vs "ПВ" returns *no rate with no error*. Ship the normalizer before relying on suggested prices.
- **Voice base64 payload:** long recordings exceed Next.js/nginx body limits (the 10MB guard only covers multipart uploads, not the inline JSON voice path) → opaque 413. Item 21 must cap size.
- **КП without sourcing data:** owner cost/coverage/margin do not exist until RFQ-3..5 (unbuilt). A КП generated now shows only the client's desired rate — render margin/owner fields as "по результатам опроса" to avoid sending misleading numbers.
- **Print rendering:** the dark-default theme produces unreadable print output; the КП route must force light-theme vars and embed `public/fonts/` woff2 (Geist Mono tabular alignment breaks otherwise). Test print in Chrome/Firefox/Safari.
- **Mobile edits need responsive guards, not blanket changes:** `h-9` is load-bearing on desktop; every fix must be `h-11 md:h-9`, and detail-line restructuring must be `…md:flex-nowrap` so desktop's table-like layout survives.
- **Parallelism:** Phase 6 (mobile) and Phase 7 (hardening) are independent of the data work and can run concurrently after Phase 0. Phases 1→2→3→4→5 are the critical path; KP (5) depends only on Phase 0 items 2/3, not on 1–4, so it can start early if requisites arrive.
