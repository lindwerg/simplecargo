# Приказ (вводная/операционная часть, дата вступления в силу, отмена 10-01)

> **Rulebook chunk.** Primary regulation header + operative clauses of ТР-1 2026.
> **Source (verbatim, no paywall):** https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prikaz/
> **Document:** Приказ ФАС России от 06.11.2025 № 894/25 «Об утверждении … (Тарифное руководство N 1)».
> **Registration (cross-ref, NOT on this page):** рег. Минюст 22.12.2025 № 84708 — recorded in [`scripts/seed-data/tr1-rounding-rules.json`](../../../scripts/seed-data/tr1-rounding-rules.json) `_meta.regulation` and [`tr1-coefficients`]; the sudact `/prikaz/` sub-page body does not print the Минюст line, so it is flagged here as cross-referenced, not quoted from this URL.
> **Fetched:** 2026-06-09. Two independent WebFetch passes of the same URL returned identical operative text.

---

## 1. Verbatim text — header + operative clauses (RU)

Reproduced from the page body, from the organ name down to the signature. Quotation marks in the original render as `"…"`.

> ФЕДЕРАЛЬНАЯ АНТИМОНОПОЛЬНАЯ СЛУЖБА
>
> ПРИКАЗ
>
> от 6 ноября 2025 г. N 894/25
>
> ОБ УТВЕРЖДЕНИИ ПОРЯДКА РАСЧЕТА ТАРИФОВ НА ПЕРЕВОЗКИ ГРУЗОВ ЖЕЛЕЗНОДОРОЖНЫМ ТРАНСПОРТОМ ОБЩЕГО ПОЛЬЗОВАНИЯ И УСЛУГИ ПО ИСПОЛЬЗОВАНИЮ ИНФРАСТРУКТУРЫ ЖЕЛЕЗНОДОРОЖНОГО ТРАНСПОРТА ОБЩЕГО ПОЛЬЗОВАНИЯ, ВЫПОЛНЯЕМЫЕ ОАО "РЖД", А ТАКЖЕ СБОРОВ НА ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ (УСЛУГИ), СВЯЗАННЫЕ С ПЕРЕВОЗКОЙ ГРУЗОВ ЖЕЛЕЗНОДОРОЖНЫМ ТРАНСПОРТОМ ОБЩЕГО ПОЛЬЗОВАНИЯ, И ТАРИФОВ НА ПЕРЕВОЗКИ ГРУЗОВ ЖЕЛЕЗНОДОРОЖНЫМ ТРАНСПОРТОМ ОБЩЕГО ПОЛЬЗОВАНИЯ И УСЛУГИ ПО ИСПОЛЬЗОВАНИЮ ИНФРАСТРУКТУРЫ ЖЕЛЕЗНОДОРОЖНОГО ТРАНСПОРТА ОБЩЕГО ПОЛЬЗОВАНИЯ, ВЫПОЛНЯЕМЫЕ ОАО "РЖД", СБОРОВ НА ДОПОЛНИТЕЛЬНЫЕ РАБОТЫ (УСЛУГИ), СВЯЗАННЫЕ С ПЕРЕВОЗКОЙ ГРУЗОВ ЖЕЛЕЗНОДОРОЖНЫМ ТРАНСПОРТОМ ОБЩЕГО ПОЛЬЗОВАНИЯ (ТАРИФНОЕ РУКОВОДСТВО N 1)
>
> В соответствии с абзацем пятым пункта 1 статьи 4, абзацем вторым части первой статьи 6, абзацами третьим и шестым статьи 10, абзацем третьим пункта 1 статьи 11 Федерального закона от 17 августа 1995 г. 147-ФЗ "О естественных монополиях", пунктом 1 статьи 8 Федерального закона от 10 января 2003 г. N 17-ФЗ "О железнодорожном транспорте в Российской Федерации", абзацем двадцать седьмым статьи 2 Федерального закона от 10 января 2003 г. N 18-ФЗ "Устав железнодорожного транспорта Российской Федерации", пунктом 3(1) постановления Правительства Российской Федерации от 30 июня 2004 г. N 331 "Об утверждении Положения о Федеральной антимонопольной службе", пунктом 1 и подпунктами 5.3.21.21, 5.3.21.22 пункта 5 Положения о Федеральной антимонопольной службе, утвержденного постановлением Правительства Российской Федерации от 30 июня 2004 г. N 331, пунктами 3, 7, 9 и 10 Положения о государственном регулировании тарифов, сборов и платы в отношении работ (услуг) субъектов естественных монополий в сфере железнодорожных перевозок, утвержденного постановлением Правительства Российской Федерации от 5 августа 2009 г. N 643, приказываю:
>
> 1. Утвердить Порядок расчета тарифов на перевозки грузов железнодорожным транспортом общего пользования и услуги по использованию инфраструктуры железнодорожного транспорта общего пользования, выполняемые ОАО "РЖД", а также сборов на дополнительные работы (услуги), связанные с перевозкой грузов железнодорожным транспортом общего пользования, и тарифы на перевозки грузов железнодорожным транспортом общего пользования и услуги по использованию инфраструктуры железнодорожного транспорта общего пользования, выполняемые ОАО "РЖД", сборы на дополнительные работы (услуги), связанные с перевозкой грузов железнодорожным транспортом общего пользования (Тарифное руководство N 1), согласно приложению N 1 к настоящему приказу.
>
> 2. Признать утратившими силу нормативные правовые акты и отдельные положения нормативных правовых актов ФЭК России, ФСТ России и ФАС России по перечню согласно приложению N 2 к настоящему приказу.
>
> 3. Настоящий приказ вступает в силу с 1 января 2026 г.
>
> Руководитель
>
> М.А.ШАСКОЛЬСКИЙ

**Note on a verbatim quirk:** the legal-basis paragraph prints the natural-monopolies law as `Федерального закона от 17 августа 1995 г. 147-ФЗ` — i.e. the `N` before `147-ФЗ` is missing on the source page. Reproduced as-is; the act is 147-ФЗ «О естественных монополиях». Not transcribed in; this is what the page shows.

---

## 2. Plain-Russian explanation — HOW this enters the calculation

This Приказ is the **root authority** of the whole tariff. It does not itself contain a multiplier or a unit — it is the legal envelope that:

1. **п.1** — утверждает сам **Порядок расчёта** и **Тарифное руководство N 1** как **Приложение N 1**. Every computation step the engine performs (база по схеме, K3/Табл.4, K4/Табл.5, K1/класс, порожний, округление до копеек/рубля) lives in **Приложении N 1, Разделе II** «Порядок расчёта тарифов». So: this page = the cover; the actual arithmetic = `…/prilozhenie-n-1/ii/` (already extracted verbatim in [`TARIFF_RULES_EXACT.md`](../TARIFF_RULES_EXACT.md)).
2. **п.3** — фиксирует **дату включения** правил в расчёт: тариф считается по ТР-1 **для накладных с датой оформления ≥ 2026-01-01**. This is the engine's date-gate: a quote dated on/after 2026-01-01 must use the ТР-1 base tables (Прил.N2) and Раздел II order-of-operations, not 10-01.
3. **п.2** — снимает старую методику (см. §3): Прейскурант 10-01 и связанные акты ФЭК/ФСТ/ФАС перестают быть основанием расчёта с той же даты.

**Unit / step where it lands:** none directly. It selects *which rulebook* the engine loads. No coefficient, no belt cell, no ruble figure originates here. The numbers all originate in Приложение N 1 (Раздел II + таблицы) and Приложение N 2 (базовые ставки тарифных схем).

---

## 3. What EXTENDS or CONTRADICTS the current engine / seed

### 3.1 Confirms (no change needed)
- **Effective-date gate 2026-01-01** — matches `_meta.regulation` in [`tr1-rounding-rules.json`](../../../scripts/seed-data/tr1-rounding-rules.json) and [`tr1-coefficients.json`](../../../scripts/seed-data/tr1-coefficients.json) («в силе с 2026-01-01»). п.3 is the primary-source proof of that gate.
- **«Тарифное руководство N 1» naming** — the engine/seed label «Тарифное руководство N 1 (Приказ 894/25)» matches п.1 verbatim. The companion docs (`TARIFF_MASTER_AUDIT.md`, `TARIFF_PERFECTION_REPORT.md`) cite the same приказ number.
- **10-01 superseded** — the operator memory and seed comments treating 10-01 as the *methodological predecessor* (not the live basis) are consistent with п.2 («признать утратившими силу»).

### 3.2 Extends (new facts this page pins that the seed did not carry)
- **Signatory + exact issuing organ:** Руководитель ФАС **М.А. Шаскольский**, ФЕДЕРАЛЬНАЯ АНТИМОНОПОЛЬНАЯ СЛУЖБА, **6 ноября 2025 г.** No seed file recorded the signer; now pinned to primary source.
- **Full legal basis chain** (147-ФЗ, 17-ФЗ, 18-ФЗ, ПП РФ № 331, ПП РФ № 643) — none of this was in the seed; it is the citation backbone if the derivation is ever challenged.
- **Two appendices, explicit roles:** **Приложение N 1** = Порядок + сами тарифы (Тарифное руководство N 1, i.e. Раздел II rules + rate tables); **Приложение N 2** = the перечень утративших силу актов (the repeal list). This is a structural correction worth noting: in casual usage «Приложение N 2» is sometimes used to mean the base-rate schemes, but per **this приказ** Приложение N 2 is the **repeal list**, and the base-rate схемы live **inside Приложение N 1**. The seed docs that say «базовые ставки … Приложение N 2 к Тарифному руководству» are referring to **Приложение N 2 к Тарифному руководству (i.e. внутри Прил.N1 к приказу)**, which is a *different* «Приложение N 2» from the приказ-level one named in п.2. Flag for the engine: keep «Приложение N 2 к приказу» (repeal list) and «Приложение N 2 к Тарифному руководству» (базовые ставки тарифных схем, cited in п.15.4) strictly separate — they are homonyms at two nesting levels.

### 3.3 Contradicts
- **None.** Nothing on this page contradicts the engine. The only watch-item is the §3.2 homonym («Приложение N 2» at приказ-level vs ТР-level), which is a naming-collision risk, not a numeric contradiction.

---

## 4. Tables on this page

This sub-page (`/prikaz/`) contains **no tables** — it is the operative text only. The two referenced appendices live at separate URLs:

| Reference | Role per приказ | Where the machine table / verbatim text lives |
|---|---|---|
| Приложение N 1 к приказу | Порядок расчёта + Тарифное руководство N 1 (rules + rate schemes) | Раздел II rules: `…/prilozhenie-n-1/ii/` (verbatim in [`TARIFF_RULES_EXACT.md`](../TARIFF_RULES_EXACT.md)); machine rate tables: [`tr1-rate-belts.json`](../../../scripts/seed-data/tr1-rate-belts.json), [`tr1-i-belts-full.json`](../../../scripts/seed-data/tr1-i-belts-full.json), [`tr1-n8-corrected.json`](../../../scripts/seed-data/tr1-n8-corrected.json), [`tr1-empty-run.json`](../../../scripts/seed-data/tr1-empty-run.json); coefficients: [`tr1-k1-full.json`](../../../scripts/seed-data/tr1-k1-full.json), [`tr1-k3-full.json`](../../../scripts/seed-data/tr1-k3-full.json), [`tr1-k4-full.json`](../../../scripts/seed-data/tr1-k4-full.json), [`tr1-class-coeff.json`](../../../scripts/seed-data/tr1-class-coeff.json), [`tr1-min-weight-norms.json`](../../../scripts/seed-data/tr1-min-weight-norms.json) |
| Приложение N 2 к приказу | Перечень утративших силу актов ФЭК/ФСТ/ФАС (repeal list) | **NOT yet captured on disk.** Source to obtain: `…/prilozhenie-n-2/` on sudact. Flagged for a future rulebook chunk; needed only for legal traceability of «what 10-01 era acts are dead», not for arithmetic. |

---

## 5. Unfetchable / needs-obtaining

- **Минюст registration line** (рег. 22.12.2025 № 84708) — referenced in seed `_meta` but **not printed on this `/prikaz/` page**. Obtain from the publication header on consultant.ru `LAW_522347` or the official pravo.gov.ru publication if a verbatim Минюст line is required.
- **Приложение N 2 к приказу** (repeal list of 10-01-era acts) — not captured; obtain from `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-2/` for a dedicated chunk.
