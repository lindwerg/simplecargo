# kniga1-sections.json — Книга 1 (участок ordinal + cumulative km)

Station→узел distance layer used for same-section (`L = l2 − l1`) and
adjacent-section (`L = l1 + l2`) subtraction so short intra-section pairs
compute EXACTLY instead of overestimating via spur+ТП.

## Source

`https://rlw.gov.ru/opendata/7708525167-tarifstations/data-20231012-structure-20180312.csv`
(РЖД / ФАС open data, "Тарифные станции", structure 2018-03-12, data 2023-10-12).
Downloaded with browser User-Agent + Referer (bare curl returns `Forbidden`).
4.42 MB. **Encoding is plain UTF-8** — the "double-mojibake" warning in the
brief did NOT materialize; bytes decode cleanly (`\xd0\x9a` = "К" etc.).

## Shape

Array of one record per source row (a station's cumulative km along its участок
to one узел; a station appears once per узел it has a distance to):

```json
{"esr":"190205","name":"Серпухов","uzelEsr":"190609","uzelName":"Столбовая",
 "km":35,"uchastok":"СТОЛБОВАЯ ТУЛА I-КУРСКАЯ","liniya":"","doroga":"Московская"}
```

- `esr` / `uzelEsr` — 6-digit zero-padded ESR (matches repo CSV + kniga3 format).
- `km` — integer cumulative km from station to that узел (range 0–1128).
- `liniya` is empty for ~70% of rows (source-blank); `doroga` empty for 59 rows.

## Verification

- **28,586 records, 0 decode losses.** Every row parsed; 56 rows had unquoted
  commas inside a name/участок (e.g. `… (через ст. Козелковская, Смышляевка)`,
  `Кавказ (паром, )`, `Советская Гавань-П 1, Сортировочная`) — all recombined
  correctly, not dropped.
- Distinct stations: 13,220 (12,419 = 93.9% resolve into repo RZD+CIS CSVs by
  6-digit ESR). Distinct узлы: 1,097 (1,055 = 96.2% resolve; 368 also appear as
  kniga3 backbone nodes).
- **Golden same-section subtraction (Серпухов→Ревякино = 74 km) reproduces exactly:**
  both on участок `СТОЛБОВАЯ ТУЛА I-КУРСКАЯ`; via узел Столбовая 109−35 = 74;
  cross-checked via узел Тула I-Курская 95−21 = 74. Both anchors agree.

## Caveats

- Dataset is 2023-10 (valid-through 2025-07-29, already expired) — Layer-C drift
  watch recommended, but the участок/km structure changes rarely.
- RF only (19 РЖД дороги + Якутия). No CIS/Baltic sections (consistent with the
  open-data scope).
- Does NOT contain Книга 3 (ТП↔ТП) — that lives in `kniga3-backbone.json`.
  This file only closes the intra/adjacent-section subtraction gap.
