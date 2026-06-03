# SimpleCargo — Domain Model (Definitive)

> **Status:** Implementation-ready specification for the ingestion → normalization → matching → report pipeline.
> **Scope:** This document is the single source of truth for how heterogeneous rail-wagon dislocation files become rows in **"Отчет ПВ Приоритет Логистика.xlsx"** WITHOUT errors.
> **Audience:** Worker / ingestion engineers and the web layer that reads the resulting tables.
> **Sibling docs:** `STACK.md` (Next.js web + Python worker + Postgres + Redis on Railway), `SECURITY.md`, `OBSERVABILITY.md`. This doc owns the *data* contract; those own *infrastructure*.

---

## 0. Locked Decisions (read this first)

These decisions resolve every contradiction found across the research and the adversarial domain-correctness review. They are **binding**. Where the research disagreed with itself, the version below wins.

| # | Decision | Why (and what it overrides) |
|---|----------|------------------------------|
| **D1** | **Оборот (turnover) = cross-row cycle: `next_loading_arrival − this_loading_arrival`.** It is NOT trip duration. | CRITIC domain-correctness CRITICAL-1/2. The sample оборот=11 for a ~1-day Асбест→Голышманово haul only makes sense as a full load→haul→unload→empty-return cycle. The `trip_end − loading_arrival` formula (in canonical-schema & report-gen findings) is **wrong** and is downgraded to a *provisional* value only. |
| **D2** | **Source B/D column alignment is fixed by CONTENT SIGNATURE typing, never by positional offset arithmetic. Waybill is NEVER fabricated from a date column.** | CRITIC CRITICAL-3. The "shift columns right, pull waybill from col 14" approach in map-rns is **deleted**. If waybill can't be located by signature, set `NULL` and route to date-window matching. |
| **D3** | **Wagon number = 8-digit zero-padded string. Checksum (Luhn-11) is ADVISORY (WARNING + `needs_review`), never a CRITICAL drop.** | CRITIC HIGH-1 / stack-fit M4. The margin report is the product; never silently drop a real revenue row on a checksum heuristic. Verify the weight vector against real wagons before enabling at all. |
| **D4** | **No ESR codes or road codes are hardcoded from memory. Source A's inline ESR is authoritative. The dictionary is seeded ONLY from the RZhD classifier import + ESR codes observed in real Source A files + operator-confirmed report names.** | CRITIC HIGH-2. Three findings invented three different ESR codes for "Асбест" (712008 / 768504 / 764607). All invented literals are removed. |
| **D5** | **Source A load state derives primarily from `Вес груза (кг) > 0` AND presence of `Номер накладной`, with `Тип парка`/mnemonic as tie-breakers only. `РП`/`НРП` = serviceability, NOT load state.** | CRITIC HIGH-3. `Тип парка` does not encode loaded/empty reliably. |
| **D6** | **One date utility. Excel serial base = `1899-12-30`. `xlrd` path MUST pass `book.datemode`. openpyxl cells already arrive as `datetime` — do not re-interpret. Every parsed date asserted within `[2015-01-01, today+30d]`.** | CRITIC MEDIUM-1. Reconciles the conflicting epoch math across findings. |
| **D7** | **`Клиент` (report col [0]) is NEVER auto-filled from `Грузополучатель` (consignee).** It comes only from the commercial deal record (operator/contract). | CRITIC MEDIUM-4. In a forwarder model the client is who pays УА, frequently not the consignee. |
| **D8** | **All timestamps stored as `TIMESTAMPTZ` in UTC. Source dates parsed as MSK (Europe/Moscow) then converted to UTC. Display in MSK.** | stack-fit gap #5. Naive datetimes at month boundaries silently misfile a deal into the wrong monthly sheet. |
| **D9** | **Cross-source event identity** = `(wagon_number, operation_code_norm, operation_ts rounded to 15 min)`. This is the canonical dedup key that unifies the file-hash, row-hash, and matching-hash schemes. | stack-fit H4. The A∩C overlap (same physical event in two files) must not double-count margin. |
| **D10** | **Dedup hashes COALESCE NULLs to a sentinel** (`"∅"`). SQL `UNIQUE` treats NULLs as distinct, so a NULL `operation_ts` would defeat the constraint. | CRITIC LOW. |
| **D11** | **Month-sheet bucketing is by `Дата окончания рейса` (trip_end) by default, but this is CONFIGURABLE** (`REPORT_MONTH_BASIS = trip_end | dispatch`). Verify against a real sheet before first prod report. | CRITIC LOW / stack-fit. |
| **D12** | **Turnover rounding = `round()` to whole days (banker's-neutral standard rounding), NOT `ceil`.** Confirm against real data; `ceil` systematically inflates the KPI by up to +1 day. | CRITIC LOW. |
| **D13** | **Waybill regex matches the REAL sample (`ЭУ477040`): `^[А-ЯЁ]{1,3}\d{4,}$` OR pure `^\d{6,}$`.** The pure-`\d{8,}` validation rule that would reject `ЭУ477040` is removed. | CRITIC LOW. |

---

## 1. Pipeline Overview

```
┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   ┌──────────────┐   ┌────────────┐
│ FILE INTAKE  │ → │  PER-SOURCE   │ → │   NORMALIZE +    │ → │   LIFECYCLE  │ → │   DEAL     │
│ (hash, type, │   │  PARSE +      │   │   VALIDATE +     │   │   STATE      │   │   MATCH +  │
│  header)     │   │  COLUMN MAP   │   │   DEDUP          │   │   MACHINE    │   │   MERGE    │
└──────────────┘   └───────────────┘   └──────────────────┘   └──────────────┘   └────────────┘
                                              │                       │                  │
                                              ▼                       ▼                  ▼
                                       quarantine_rows         wagon_movements        deals
                                       (CRITICAL/ERROR)        (canonical fact)   (one report row)
                                                                                        │
                                                                  ┌─────────────────────┘
                                                                  ▼
                                                          REPORT GENERATION
                                                          (per-month xlsx sheets)
```

**Stages:**
1. **File intake** — SHA-256 fingerprint (idempotency), source-type detection, header-row autodetection.
2. **Per-source parse + column map** — map raw columns to the canonical `WagonMovement` schema; correct Source B/D alignment by content signature.
3. **Normalize + validate + dedup** — wagon number, dates, load state, station ESR; apply validation ruleset; dedup at row + cross-source event level.
4. **Lifecycle state machine** — derive trip boundaries (loading arrival → dispatch → destination arrival → unload) per wagon, ordered in time.
5. **Deal match + merge** — attach movements to commercial `Deal` records by `(wagon, waybill)` + date window; apply source precedence; compute оборот across rows.
6. **Report generation** — completed deals → 17-column monthly xlsx sheets.

---

## 2. Canonical Schema

The canonical key throughout is the **8-digit wagon number** (primary join) and **ESR code** (station identity). Every inbound row from every source becomes an immutable `WagonMovement`. Commercial data lives in `Deal`. The xlsx export is a projection of completed `Deal`s.

### 2.1 `stations` — ESR-keyed station dictionary

```sql
CREATE TABLE stations (
    esr_code        CHAR(6) PRIMARY KEY,          -- canonical station identity (authoritative)
    name_etran      TEXT NOT NULL,                -- raw ЭТРАН name, e.g. 'ДОБРЯТИНО'
    name_normalized TEXT NOT NULL,                -- uppercase, NFKD, punctuation-stripped
    name_human      TEXT,                         -- report place name, e.g. 'Голышманово' (NULL until enriched)
    road_code_short VARCHAR(8),                   -- 'ГОР', 'ДВС' (from B/D)
    road_name_full  TEXT,                         -- 'ГОРЬКОВСКАЯ' (from A)
    road_esr        CHAR(2),                      -- '24' (from A inline)
    is_stub         BOOLEAN NOT NULL DEFAULT FALSE,-- ESR authoritative but human name not yet curated
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_stations_name_norm ON stations(name_normalized);

CREATE TABLE station_aliases (
    id               BIGSERIAL PRIMARY KEY,
    esr_code         CHAR(6) NOT NULL REFERENCES stations(esr_code),
    alias            TEXT NOT NULL,
    alias_normalized TEXT NOT NULL,
    source           TEXT NOT NULL,               -- 'report' | 'manual' | 'fuzzy_confirmed' | 'classifier'
    confidence       NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE (alias_normalized)                     -- one normalized alias → exactly one ESR
);

CREATE TABLE road_codes (
    short_code     VARCHAR(8) PRIMARY KEY,        -- 'ГОР'
    full_name_ru   TEXT NOT NULL,                 -- 'ГОРЬКОВСКАЯ'
    rzd_road_code  CHAR(2)                        -- '24' — populated ONLY from classifier/observed, never guessed
);
```

> **Note on `road_codes`:** seed `short_code → full_name_ru` from the RZhD classifier. Do **not** hardcode `rzd_road_code` numbers from memory (D4); fill them from the classifier or from Source A's inline `"ГОРЬКОВСКАЯ (24)"` observations.

### 2.2 `counterparties` — clients, owners, carriers, shippers

```sql
CREATE TABLE counterparties (
    id              BIGSERIAL PRIMARY KEY,
    name_canonical  TEXT UNIQUE NOT NULL,
    name_variants   TEXT[],                       -- all raw spellings seen, for fuzzy match
    roles           TEXT[],                       -- {'client','owner','shipper','consignee','carrier'}
    inn             VARCHAR(12)
);
```

### 2.3 `wagons` — one row per physical wagon

```sql
CREATE TABLE wagons (
    wagon_number          CHAR(8) PRIMARY KEY,    -- canonical 8-digit
    wagon_type            VARCHAR(20),            -- 'ПВ'
    wagon_subtype_raw     TEXT,                   -- 'Полувагоны (60)'
    model                 VARCHAR(20),            -- '12-9837'
    volume_m3             NUMERIC(8,2),
    capacity_tonnes       NUMERIC(8,2),
    owner_administration  TEXT,                   -- 'РЖД (20)'
    build_date            DATE,
    next_repair_date      DATE,
    current_mileage_km    INTEGER,
    checksum_valid        BOOLEAN,                -- advisory (D3); NULL = not checked
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);
```

### 2.4 `ingested_files` — file-level idempotency

```sql
CREATE TABLE ingested_files (
    id            BIGSERIAL PRIMARY KEY,
    sha256        CHAR(64) UNIQUE NOT NULL,        -- idempotency key (skip re-ingest)
    filename      TEXT NOT NULL,
    source_type   CHAR(1) NOT NULL,               -- 'A'|'B'|'C'|'D'
    header_row    SMALLINT,
    column_shift  SMALLINT DEFAULT 0,             -- detected B/D alignment offset (audit only)
    snapshot_date DATE,                           -- reference date of the snapshot (filename/metadata)
    row_count     INTEGER,
    quarantined   BOOLEAN DEFAULT FALSE,
    notes         TEXT,
    ingested_at   TIMESTAMPTZ DEFAULT now()
);
```

### 2.5 `wagon_movements` — the core immutable fact table

One row per operation/snapshot per wagon per source file. **Never updated, never deleted** — only appended and soft-superseded.

```sql
CREATE TABLE wagon_movements (
    id                     BIGSERIAL PRIMARY KEY,
    event_key              CHAR(64) UNIQUE NOT NULL,  -- D9 cross-source identity hash
    row_fingerprint        CHAR(64) NOT NULL,         -- D10 exact-row hash (provenance)
    source_type            CHAR(1) NOT NULL,          -- 'A'|'B'|'C'|'D'
    source_file_id         BIGINT REFERENCES ingested_files(id),
    is_primary             BOOLEAN NOT NULL DEFAULT TRUE,   -- cross-source winner (R3)
    superseded_by          BIGINT REFERENCES wagon_movements(id),
    needs_review           BOOLEAN NOT NULL DEFAULT FALSE,

    -- Wagon identity
    wagon_number           CHAR(8) NOT NULL,
    wagon_type             VARCHAR(20),
    wagon_model            VARCHAR(20),

    -- Operation
    operation_code         VARCHAR(16),               -- normalized mnemonic: ОТПР, ПРИБ, УВПП, ВЫГР...
    operation_name         TEXT,                      -- full op text
    operation_ts           TIMESTAMPTZ,               -- canonical operation timestamp (UTC)
    trip_start_ts          TIMESTAMPTZ,               -- 'Дата и время начала рейса'
    depart_ts              TIMESTAMPTZ,
    arrive_dislocation_ts  TIMESTAMPTZ,
    estimated_arrival_ts   TIMESTAMPTZ,               -- Source D 'Расчетная дата приб'
    delivery_deadline_ts   TIMESTAMPTZ,               -- A norm срок / D ЭТРАН RT

    -- State
    load_state             VARCHAR(8),                -- 'ГРУЖ' | 'ПОР' | NULL (UNKNOWN)
    load_state_source      VARCHAR(16),               -- 'weight' | 'gruzpor_col' | 'mnemonic' | 'parktype'

    -- Stations (raw + resolved ESR)
    station_depart_esr     CHAR(6),
    station_depart_raw     TEXT,
    road_depart_raw        TEXT,
    station_dest_esr       CHAR(6),
    station_dest_raw       TEXT,
    road_dest_raw          TEXT,
    station_current_esr    CHAR(6),
    station_current_raw    TEXT,
    road_current_raw       TEXT,

    -- Commercial linkage keys
    waybill_number         TEXT,                      -- secondary join key
    shipment_id            TEXT,                      -- A 'Идентификатор отправки' 2024ЭУ477040

    -- Cargo
    cargo_name             TEXT,
    cargo_code_etsnk       VARCHAR(16),
    cargo_weight_kg        NUMERIC(12,2),
    shipper_name_raw       TEXT,
    consignee_name_raw     TEXT,

    -- Idle / distance metrics
    idle_days_station      NUMERIC(6,2),
    idle_days_operation    NUMERIC(6,2),
    days_no_operation      INTEGER,
    days_no_movement       INTEGER,
    distance_remaining_km  INTEGER,
    distance_traveled_km   INTEGER,
    distance_total_km      INTEGER,
    train_index            TEXT,
    park_type_raw          TEXT,                      -- A 'Тип парка' (serviceability metadata, NOT load state)

    raw_json               JSONB,                     -- full original row, audit
    ingested_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wm_wagon       ON wagon_movements(wagon_number);
CREATE INDEX idx_wm_waybill     ON wagon_movements(waybill_number);
CREATE INDEX idx_wm_op_ts       ON wagon_movements(operation_ts);
CREATE INDEX idx_wm_wagon_opts  ON wagon_movements(wagon_number, operation_ts);
```

### 2.6 `deals` — one completed trip = one report row

```sql
CREATE TYPE deal_status AS ENUM ('PENDING','ACTIVE','CLOSED','CONFLICT','ABANDONED');

CREATE TABLE deals (
    id                    BIGSERIAL PRIMARY KEY,
    wagon_number          CHAR(8) NOT NULL REFERENCES wagons(wagon_number),
    waybill_number        TEXT,
    status                deal_status NOT NULL DEFAULT 'PENDING',

    -- Commercial (operator/contract sourced — NEVER from dislocation; D7)
    client_id             BIGINT REFERENCES counterparties(id),
    owner_id              BIGINT REFERENCES counterparties(id),
    carrier_raw           TEXT,                        -- report [15]
    company_raw           TEXT DEFAULT 'Приоритет Логистика', -- report [16]
    invoice_number        TEXT,                        -- report [14]
    revenue_ua            NUMERIC(12,2),               -- report [3]  Сумма УА
    cost_owner            NUMERIC(12,2),               -- report [7]  Сумма от Поставщика

    -- Operational (movement-derived)
    station_origin_esr    CHAR(6) REFERENCES stations(esr_code),
    station_dest_esr      CHAR(6) REFERENCES stations(esr_code),
    cargo_name            TEXT,                        -- report [13]
    wagon_type            VARCHAR(20) DEFAULT 'ПВ',    -- report [10]

    -- Dates (UTC stored; D8)
    loading_arrival_ts    TIMESTAMPTZ,                 -- report [5] дата прибытия на станцию погрузки (S1→S2)
    dispatch_ts           TIMESTAMPTZ,                 -- report [9] Дата выполнения (отправки)  (S4→S5)
    trip_end_ts           TIMESTAMPTZ,                 -- report [4] Дата окончания рейса        (→S8)

    -- KPI (computed cross-row; D1/D12)
    turnover_days         INTEGER,                     -- report [6] оборот,сут
    turnover_provisional  BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = fallback, exclude from KPI averages

    report_month          CHAR(7),                     -- '2026-08' (assignment per D11)
    source_movement_ids   BIGINT[],                    -- all linked WagonMovement ids
    conflict_flags        JSONB,                       -- field-level disagreements
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_deals_wagon_waybill ON deals(wagon_number, waybill_number);
CREATE INDEX idx_deals_month         ON deals(report_month);
CREATE INDEX idx_deals_status        ON deals(status);
```

> **`margin` is NOT a stored generated column.** It is computed `revenue_ua − cost_owner` ONLY at report-export time, behind the guard `revenue_ua IS NOT NULL AND cost_owner IS NOT NULL` (CRITIC MEDIUM-2). A half-filled deal must never reach a sheet showing margin = full revenue.

### 2.7 `quarantine_rows` & `operator_alerts`

```sql
CREATE TABLE quarantine_rows (
    id             BIGSERIAL PRIMARY KEY,
    source_file_id BIGINT REFERENCES ingested_files(id),
    row_index      INTEGER,
    rule_id        TEXT NOT NULL,          -- 'W-02','D-02','CS-03'...
    reason_code    TEXT NOT NULL,
    severity       TEXT NOT NULL CHECK (severity IN ('CRITICAL','ERROR','WARNING')),
    field_name     TEXT,
    raw_value      TEXT,
    raw_row_json   JSONB,
    resolved       BOOLEAN DEFAULT FALSE,
    resolved_by    TEXT,
    resolved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE operator_alerts (
    id           BIGSERIAL PRIMARY KEY,
    deal_id      BIGINT REFERENCES deals(id),
    wagon_number CHAR(8),
    waybill_number TEXT,
    alert_type   TEXT NOT NULL,            -- see §8 alert taxonomy
    payload      JSONB,
    created_at   TIMESTAMPTZ DEFAULT now(),
    resolved_at  TIMESTAMPTZ
);
```

---

## 3. Source → Canonical Field-Mapping Tables

All four sources locate columns **by header name**, never by positional index (column counts drift between export runs). Header-row indices and detection rules are in §6 (H-rules).

### 3.0 Universal normalizers (apply at parse time, every source)

```python
import re, pandas as pd
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")
UTC = ZoneInfo("UTC")
EXCEL_EPOCH = datetime(1899, 12, 30)            # D6

def normalize_wagon(raw) -> str | None:
    """'52266772.0' | 52266772 | '065098634' | '52 266 772' -> '52266772' (8-digit)."""
    if raw is None or str(raw).strip().lower() in ("", "nan"):
        return None
    s = str(raw).strip().replace(" ", "")
    if "." in s:
        s = s.split(".")[0]
    digits = re.sub(r"\D", "", s)
    if not digits:
        return None
    return digits.zfill(8)[-8:] if len(digits) >= 8 else digits.zfill(8)
    # NOTE: length != 8 after this is a W-02 validation failure (handled downstream).

def parse_dt(raw, datemode: int = 0) -> datetime | None:
    """Returns a UTC-aware datetime. Source local time assumed MSK (D8)."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return None
    if isinstance(raw, datetime):                       # openpyxl already converted
        dt = raw if raw.tzinfo else raw.replace(tzinfo=MSK)
        return dt.astimezone(UTC)
    if isinstance(raw, (int, float)):                   # genuine Excel serial
        # xlrd path: caller must pass datemode; serial already day-count from epoch
        base = EXCEL_EPOCH if datemode == 0 else datetime(1904, 1, 1)
        dt = base + timedelta(days=float(raw))
        return dt.replace(tzinfo=MSK).astimezone(UTC)
    s = str(raw).strip()
    for fmt in ("%d.%m.%Y %H:%M", "%d.%m.%Y %H:%M:%S",
                "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d.%m.%Y"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=MSK).astimezone(UTC)
        except ValueError:
            continue
    return None                                         # D-01 failure downstream

_LOAD_MAP = {
    "ГРУЖ": "ГРУЖ", "ГРУЖЕН": "ГРУЖ", "ГРУЖЕНЫЙ": "ГРУЖ", "ГРУЖЕННОГО": "ГРУЖ", "Г": "ГРУЖ",
    "ПОР": "ПОР", "ПОРОЖ": "ПОР", "ПОРОЖН": "ПОР", "ПОРОЖНИЙ": "ПОР", "П": "ПОР",
}
def normalize_load_state(raw) -> str | None:
    if raw is None: return None
    return _LOAD_MAP.get(str(raw).strip().upper())      # None => UNKNOWN (G-01)

_STATION_RE = re.compile(r"^(.+?)\s*\((\d{4,6})\)\s*$")
def parse_station(raw) -> tuple[str | None, str | None]:
    """'ДОБРЯТИНО (243309)' -> ('ДОБРЯТИНО','243309'). Falls back to (name, None)."""
    if not isinstance(raw, str): return (None, None)
    m = _STATION_RE.match(raw.strip())
    return (m.group(1).strip(), m.group(2).zfill(6)) if m else (raw.strip() or None, None)

_TYPE_MAP = {"Полувагоны": "ПВ", "Крытые": "КР", "Цистерны": "ЦС", "Платформы": "ПЛ", "Хопперы": "ХП"}
def normalize_wagon_type(raw) -> str | None:
    if not isinstance(raw, str): return None
    m = re.match(r"^(.+?)\s*\(\d+\)", raw.strip())
    base = (m.group(1).strip() if m else raw.strip())
    return _TYPE_MAP.get(base, base)

WAYBILL_RE = re.compile(r"^([А-ЯЁ]{1,3}\d{4,}|\d{6,})$")   # D13: matches 'ЭУ477040' and pure digits
```

---

### 3.A SOURCE A — Добрятино / ЭТРАН-АСОУП (`.xlsx`, header row 3, ~67-68 cols)

Most complete source. Carries inline ESR codes, weight, shipper/consignee. **Has NO Груж/Порож column** — load state is derived (D5).

| Canonical field | Source A column (by name) | Transform |
|---|---|---|
| `wagon_number` | `Номер вагона` | `normalize_wagon` |
| `wagon_subtype_raw` / `wagon_type` | `Род вагона` | store raw; `normalize_wagon_type` → e.g. `ПВ` |
| `owner_administration` | `Администрация собственника` | store raw `РЖД (20)` |
| `trip_start_ts` | `Дата и время начала рейса` | `parse_dt` |
| `station_depart_esr`, `station_depart_raw` | `Станция отправления` | `parse_station` |
| `road_depart_raw` | `Дорога отправления` | store raw `ГОРЬКОВСКАЯ (24)` |
| `station_dest_esr`, `station_dest_raw` | `Станция назначения` | `parse_station` |
| `road_dest_raw` | `Дорога назначения` | store raw |
| `shipper_name_raw` | `Грузоотправитель(наим)` | strip |
| `consignee_name_raw` | `Грузополучатель(наим)` | strip (**not** used as Клиент — D7) |
| `cargo_name` | `Наименование груза` | strip |
| `cargo_weight_kg` | `Вес груза (кг)` | `pd.to_numeric` |
| `operation_name` | `Операция с вагоном` | strip |
| `operation_code` | `Мнемокод операции` | upper, strip → e.g. `УВПП` |
| `operation_ts` | `Дата операции` | `parse_dt` |
| `days_no_operation` | `Дней без операций` | int |
| `days_no_movement` | `Дней без движения` | int |
| `park_type_raw` | `Тип парка` | store raw (serviceability metadata — **NOT** load state) |
| `waybill_number` | `Номер накладной` | strip; validate vs `WAYBILL_RE` |
| `shipment_id` | `Идентификатор отправки` | strip `2024ЭУ477040` |
| `delivery_deadline_ts` | `Нормативный срок доставки` | `parse_dt` (or int days → derived) |
| `distance_remaining_km` | `Остаток пробега` | int |

**Load-state derivation for Source A (D5):**
```python
def derive_load_state_A(weight_kg, waybill, park_type, mnemonic) -> tuple[str|None, str]:
    if weight_kg and float(weight_kg) > 0:
        return "ГРУЖ", "weight"
    if waybill and WAYBILL_RE.match(str(waybill)):     # a loaded leg always has a waybill
        return "ГРУЖ", "weight"
    # tie-breakers ONLY:
    mn = (mnemonic or "").upper()
    if any(k in mn for k in ("ВЫГР", "УВПП", "ПОРПР")):
        return "ПОР", "mnemonic"
    if any(k in mn for k in ("ПОГР", "ОТПГР")):
        return "ГРУЖ", "mnemonic"
    return None, "unknown"                              # UNKNOWN — do NOT default
```

**Fields Source A CANNOT fill:** `Клиент` [0], `Сумма УА` [3], `Сумма от Поставщика` [7], `Комиссия` [8], `Счет фактура` [14], `перевозчик` [15] (owner admin ≠ carrier — needs mapping), `от компании` [16] (hardcode "Приоритет Логистика").

---

### 3.B SOURCE B — Дислокация РНС (`.xlsx`, header row 0, ~67 cols, ~28 meaningful)

**Has the column-misalignment bug.** See §4 for the content-signature correction (D2). Short road codes (ДВС, ВСБ, ОКТ, ГОР).

Canonical layout AFTER correction (column identity by signature, not position):

| Canonical field | Source B header (nominal) | Transform |
|---|---|---|
| `wagon_number` | `Номер вагона` | `normalize_wagon` |
| `wagon_type` | `Тип вагона` | expect `ПВ` |
| `wagon_model` | `Модель вагона` | `12-9837` |
| `volume_m3` (→ wagons) | `Объем вагона` | float |
| `capacity_tonnes` (→ wagons) | `Грузоподъемность тн` | float |
| `operation_code` | `Операция` | upper `ОТПР` |
| `idle_days_station` | `Простой на станции дислокации` | float |
| `operation_ts` | `Дата последней операции` | `parse_dt` |
| `distance_remaining_km` | `Расстояние осталось` | int |
| `road_depart_raw` / `station_depart_raw` | `Дорога/Станция отправления` | split road+station |
| `station_current_raw` | `Станция текущей дислокации` | strip |
| `road_current_raw` | `Дорога дислокации` | short code (ДВС/ВСБ/ОКТ/ГОР) |
| `station_dest_raw` / `road_dest_raw` | `Станция/Дорога назначения` | split |
| `arrive_dislocation_ts` | `Дата прибытия на станцию дислокации` | `parse_dt` |
| `depart_ts` | `Дата отправления` | `parse_dt` |
| `waybill_number` | `Накладная №` | **located by `WAYBILL_RE` signature** (D2) |
| `load_state` | `Груж\Порож` | **located by `_LOAD_MAP` signature** (D2) |
| `cargo_name` | `Груз` | string (Cyrillic, e.g. `СЕРА`) |
| `cargo_code_etsnk` | `Код груза ЕТСНГ` | numeric string |
| `build_date` (→ wagons) | `Дата постройки` | `parse_dt` |
| `next_repair_date` (→ wagons) | `Дней до планового ремонта` | int days → derive date |
| `current_mileage_km` (→ wagons) | `Тек пробег` | int |
| `train_index` | `Индекс поезда` | strip |

`load_state_source = "gruzpor_col"` for Source B.

---

### 3.C SOURCE C — Дислокация_отгруженных (`.xlsx`, header row 2, 17 cols)

Simplest source. Mid-trip snapshots of *dispatched* wagons — **never produces a complete deal alone; only enriches.** No Груж/Порож column → infer from operation/cargo.

| Col # | Source C header | Canonical field | Transform |
|---|---|---|---|
| 0 | `Номер вагона` | `wagon_number` | `normalize_wagon` |
| 1 | `Дата и время начала рейса` | `trip_start_ts` | `parse_dt` |
| 2 | `Станция отправления` | `station_depart_raw`(+esr) | `parse_station`; `road_depart_raw` = NULL |
| 3 | `Простой по Станции` | `idle_days_station` | float |
| 4 | `Станция назначения` | `station_dest_raw`(+esr) | `parse_station`; `road_dest_raw` = NULL |
| 5 | `Грузополучатель (наим)` | `consignee_name_raw` | strip (not Клиент — D7) |
| 6 | `Наименование груза` | `cargo_name` | strip |
| 7 | `Простой по операции` | `idle_days_operation` | float |
| 8 | `Дата операции` | `operation_ts` | `parse_dt` |
| 9 | `Станция операции` | `station_current_raw`(+esr) | `parse_station` |
| 10 | `Дорога операции` | `road_current_raw` | short code or full; normalize |
| 11 | `Операция с вагоном` | `operation_name` | strip |
| 12 | `Индекс поезда` | `train_index` | strip |
| 13 | `Расстояние пройденное` | `distance_traveled_km` | float |
| 14 | `Расстояние общее` | `distance_total_km` | float |
| 15 | `Грузоподъемность вагона` | `capacity_tonnes` (→ wagons) | float |
| 16 | `Накладная` | `waybill_number` | strip; validate `WAYBILL_RE` |

**Load-state inference for C:** if `cargo_name` present AND `operation_name` contains `ОТПР`/`ПОГР`/`ГРУЗ` → `ГРУЖ`; if `operation_name` contains `ВЫГРУЗКА` (completed) → `ПОР`; else `NULL` (pending merge). `load_state_source = "mnemonic"`.

---

### 3.D SOURCE D — RDB_dislocation (`.xls` legacy BIFF, header row 1, 20 cols, needs `xlrd>=2.0.1`)

Read via `xlrd` with `book.datemode` passed to `parse_dt` (D6). `xlrd 2.x` is formula/macro-safe.

| Col # | Source D header | Canonical field | Transform |
|---|---|---|---|
| 0 | `Номер вагона` | `wagon_number` | `normalize_wagon` |
| 1 | `Простой на станции дислокации` | `idle_days_station` | float |
| 2 | `Дата отправления` | `depart_ts` | `parse_dt(.., datemode)` |
| 3 | `Станция/Дорога отправления` | `station_depart_raw`/`road_depart_raw` | split on `/` |
| 4 | `Станция текущей дислокации` | `station_current_raw` | strip |
| 5 | `Дорога дислокации` | `road_current_raw` | short code |
| 6 | `Дата последней операции` | `operation_ts` | `parse_dt(.., datemode)` |
| 7 | `Операция полное наименование` | `operation_name`/`operation_code` | `ВЫГРУЗКА НА ПП` → code `ВЫГР` |
| 8 | `Станция/Дорога назначения` | `station_dest_raw`/`road_dest_raw` | split on `/` |
| 9 | `Дата прибытия на станцию дислокации` | `arrive_dislocation_ts` | `parse_dt(.., datemode)` |
| 10 | `Расстояние осталось` | `distance_remaining_km` | int (0 = arrived) |
| 11 | `Груж\Порож` | `load_state` | `normalize_load_state` |
| 12 | `Срок доставки (ЭТРАН RT)` | `delivery_deadline_ts` | `parse_dt` |
| 13 | `Расчетная дата приб` | `estimated_arrival_ts` | `parse_dt` |
| 14 | `Модель вагона` | `wagon_model` (→ wagons) | strip |
| 15 | `Объем вагона` | `volume_m3` (→ wagons) | float |
| 16 | `Грузоподъемность тн` | `capacity_tonnes` (→ wagons) | float |
| 17 | `Дата следующего планового ремонта` | `next_repair_date` (→ wagons) | `parse_dt` |
| 18-19 | *(unnamed)* | retain raw, drop if null-only | — |

`load_state_source = "gruzpor_col"`. **D has no waybill column** → `waybill_number = NULL`, deals match by date window.

**ETA resolution (D-specific):** `estimated_arrival_ts` (col 13) preferred; fallback `delivery_deadline_ts` (col 12); else NULL.

---

## 4. Source B / D Column-Alignment Correction (Content Signature, D2)

> **The "shift columns right and read waybill from a date column" approach is DELETED.** A header-vs-data label drift is corrected by **typing each data column and assigning canonical identity by content signature** — never by positional arithmetic, and the waybill is **never fabricated**.

### Algorithm

```python
def assign_columns_by_signature(df: pd.DataFrame) -> dict[str, int]:
    """
    Inspect the first N non-null data rows and assign canonical column identity
    by what the VALUES look like, regardless of header label drift.
    Returns {canonical_field: column_index}. Missing => not present.
    """
    N = min(15, len(df))
    sample = df.iloc[:N]
    assigned: dict[str, int] = {}
    used: set[int] = set()

    def col_matches(col_idx, predicate) -> float:
        vals = [v for v in sample.iloc[:, col_idx] if pd.notna(v)]
        if not vals: return 0.0
        return sum(1 for v in vals if predicate(str(v).strip())) / len(vals)

    # 1. load_state: column whose values are ГРУЖ/ПОР vocabulary
    best, best_score = None, 0.6
    for i in range(df.shape[1]):
        if i in used: continue
        s = col_matches(i, lambda v: v.upper() in _LOAD_MAP)
        if s > best_score: best, best_score = i, s
    if best is not None:
        assigned["load_state"] = best; used.add(best)

    # 2. waybill: column whose values match WAYBILL_RE (e.g. ЭУ477040 or pure digits 6+)
    #    EXCLUDE any column already typed as a date (avoids the date-as-waybill bug).
    best, best_score = None, 0.6
    for i in range(df.shape[1]):
        if i in used: continue
        if col_matches(i, lambda v: parse_dt(v) is not None) > 0.5:
            continue                                   # it's a date column — never waybill
        s = col_matches(i, lambda v: bool(WAYBILL_RE.match(v)))
        if s > best_score: best, best_score = i, s
    if best is not None:
        assigned["waybill_number"] = best; used.add(best)

    # 3. cargo_name: Cyrillic text, not a load-state token, not numeric
    # 4. wagon_number, dates, etc. typed similarly (digits-of-len-8, parseable date, ...)
    #    ... (analogous predicates per field) ...

    return assigned
```

### Post-correction validation (CS-03 — hard gate)

After assignment, assert ALL of:
- `load_state` column values ∈ `{ГРУЖ, ГРУЖЕН, ПОР, ПОРОЖ, NULL}`.
- If a `waybill_number` column was assigned, its values match `WAYBILL_RE`.
- `wagon_number` column resolves to 8 digits in ≥ 80% of rows.

If `load_state` and `cargo_name` **cannot both be located**, the whole file is quarantined (`COLUMN_SHIFT_UNRESOLVABLE`, severity ERROR). If only `waybill_number` can't be located, set it `NULL` (matching falls back to date window — §7) and continue. **Never fabricate the waybill.**

`ingested_files.column_shift` records the detected nominal offset for audit only; it does not drive parsing.

---

## 5. Station / Road Dictionary Strategy

**ESR code is the join key between sources and report. Never join on station name strings (D4).**

### Resolution pipeline (per inbound station reference)

```
inbound reference
   │
   ├─ parse_station() extracts ESR? ──yes──► stations[esr] exists?
   │                                              ├─ yes → resolved (name_human or name_etran)
   │                                              └─ no  → auto-insert STUB (is_stub=TRUE, name authoritative
   │                                                       from ЭТРAN text); usable as join key immediately
   │
   └─ no ESR (B/C/D plain name) ──► normalize_station_name()
                                          │
                                          ├─ station_aliases[norm] hit ──► esr
                                          ├─ stations.name_normalized hit ─► esr
                                          └─ RapidFuzz token_sort_ratio ≥ 0.82
                                                ├─ hit → INSERT alias(source='fuzzy_confirmed', conf=score) → esr
                                                └─ miss → station_quarantine + needs_review, alert ONCE per value
```

```python
import unicodedata
def normalize_station_name(raw: str) -> str:
    s = re.sub(r"\s*\(\d{4,6}\)\s*$", "", raw.strip().upper())     # drop ESR suffix
    s = "".join(c for c in unicodedata.normalize("NFKD", s)
                if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^\w\s\-]", "", s)
    return re.sub(r"\s+", " ", s).strip()
```

### Bootstrap (in order)

1. **Load the full RZhD ESR classifier** (~10k stations) as the base `stations` table. This self-resolves ~95% of Source A rows (ESR embedded). `source='classifier'`.
2. **Seed `road_codes`** short→full names from the classifier (do NOT hardcode numeric road codes; D4).
3. **Seed report aliases**: extract every unique origin/dest from historical report sheets, normalize, match to `stations`; unmatched → quarantine for one-time operator resolution. The first occurrence of each report place name is **operator-confirmed** (`source='manual'`, `confidence=1.0`).
4. **Dry-run one historical file per source type**, drain quarantine, confirm aliases.
5. **Validate**: every Source A ESR resolves; missing ESR → stub (authoritative, `is_stub=TRUE`).

> **No invented ESR/road literals anywhere in code.** Source A's inline `"NAME (ESR)"` is trusted over any seed.

---

## 6. File-Level & Header-Detection Rules

### F-rules (file gate)

| ID | Rule | Severity | Action |
|---|---|---|---|
| F-01 | Extension and binary magic must agree (`D0CF11E0`→.xls BIFF8; `PK\x03\x04`→.xlsx OOXML) | ERROR | Quarantine file |
| F-02 | SHA-256 already in `ingested_files` → skip entirely (idempotency) | INFO | Skip |
| F-03 | Non-empty file | ERROR | Quarantine |
| F-04 | ≥ 1 data row after header | WARNING | Accept + alert |
| F-05 | Source type resolvable (filename pattern → header sniff fallback) | ERROR if unresolved | Quarantine |

### H-rules (header autodetect — locate by anchor, not assume)

| Source | Expected header row (0-based) | Anchor columns (both required) | Min cols |
|---|---|---|---|
| A | 3 | `Номер вагона` + `Дата и время начала рейса` | 55 |
| B | 0 | `Номер вагона` + `Тип вагона` | 23 |
| C | 2 | `Номер вагона` + `Станция отправления` | 17 |
| D | 1 | `Номер вагона` + `Станция текущей дислокации` | 17 |

Scan rows 0–9 for both anchors. Found at expected index → OK. Found elsewhere → WARNING + use discovered index. Not found → ERROR, quarantine file.

---

## 7. Validation, Dedup & Quarantine Rules

### Severity model

| Severity | Meaning | Row outcome |
|---|---|---|
| CRITICAL | Data untrustworthy; report would be wrong | Row quarantined, NOT inserted |
| ERROR | Structural failure; processing impossible | Row or file quarantined |
| WARNING | Suspect but usable | Inserted with `needs_review=TRUE` |
| INFO | Informational | Logged only |

### W-rules (wagon number)

| ID | Rule | Severity |
|---|---|---|
| W-01 | `normalize_wagon` returns non-NULL | CRITICAL if NULL |
| W-02 | Result is exactly 8 digits | CRITICAL if not |
| W-03 | **Luhn-11 checksum — ADVISORY only** (D3). Set `wagons.checksum_valid`; on fail → WARNING + `needs_review`, **never drop**. Verify weight vector against real wagons (52266772, 65098634) before enabling. | WARNING |

### D-rules (dates)

| ID | Rule | Severity |
|---|---|---|
| D-01 | `parse_dt` succeeds for date-keyed fields | CRITICAL on keyed; WARNING on optional |
| D-02 | Parsed date ∈ `[2015-01-01, today+30d]` (catches epoch mistakes) | CRITICAL → quarantine |
| D-03 | `depart_ts ≤ operation_ts ≤ depart_ts + 90d` | WARNING + `needs_review` |
| D-04 | computed turnover ∈ `(0, 90]` | WARNING + `needs_review` |

### G-rules (load state)

`normalize_load_state` → `{ГРУЖ, ПОР}` or NULL (UNKNOWN). A value present but unmappable → ERROR, quarantine row (`LOAD_STATE_INVALID`). Cross-check with operation (G-02): contradiction → WARNING + `needs_review`.

### R-rules (dedup)

- **R-01 row fingerprint** (`row_fingerprint`): `SHA256(wagon ‖ source_type ‖ COALESCE(waybill,'∅') ‖ COALESCE(operation_code,'∅') ‖ COALESCE(operation_ts_iso,'∅'))` (D10). Provenance-level.
- **R-02 cross-source `event_key`** (D9): `SHA256(wagon ‖ operation_code_norm ‖ floor(operation_ts/15min))`. This is the `UNIQUE` constraint. Same physical event from A and C collapses here — **prevents margin double-count** (stack-fit H4). On conflict → keep higher-priority source as `is_primary=TRUE`, mark others `is_primary=FALSE` (do not discard; retain for audit).
- **R-03 near-duplicate** (same wagon+op, `operation_ts` within 15 min): the event_key bucket handles it; tie broken by source priority (§9).

### Quarantine flow

```
F-01/F-03/F-05 fail → quarantine WHOLE FILE (no rows)
F-02 match         → skip silently
H-rules fail       → quarantine WHOLE FILE
per row: CRITICAL/ERROR → quarantine_rows, skip insert
         WARNING        → insert with needs_review=TRUE, log quarantine entry
         all pass       → upsert wagon_movements (R-02 event_key dedup)
```

Original files are always retained in shared object storage (NOT a per-service Railway volume — stack-fit H3) so operators can re-download.

---

## 8. Wagon Lifecycle State Machine & Turnover

### States

| ID | State | Load |
|---|---|---|
| S0 | EMPTY_AT_OWNER | ПОР |
| S1 | DISPATCHED_TO_LOADING | ПОР |
| **S2** | **AT_LOADING_STATION** (empty arrival) | ПОР |
| S3 | LOADING | ПОР→ГРУЖ |
| S4 | LOADED_READY | ГРУЖ |
| S5 | IN_TRANSIT_LOADED | ГРУЖ |
| S6 | ARRIVED_AT_DEST | ГРУЖ |
| S7 | UNLOADING | ГРУЖ→ПОР |
| **S8** | **UNLOADED_AT_DEST** (trip end) | ПОР |
| S9 | EMPTY_RETURN_TRANSIT | ПОР |

Cycle: `S2 → S3 → S4 → S5 → S6 → S7 → S8 → S9 → S2(next)`.

### Transition triggers (snapshot-diff inferred)

| Transition | Trigger | Timestamp captured |
|---|---|---|
| S1→S2 | arrival op AND load=ПОР AND station = loading station | **`loading_arrival_ts`** = report [5] |
| S2/S3→S4 | `Вес груза>0` / `ПОГР` / load flips ПОР→ГРУЖ | — |
| S4→S5 | `ОТПР` AND load=ГРУЖ | **`dispatch_ts`** = report [9] |
| S5→S6 | arrival AND load=ГРУЖ AND station = dest | — |
| S6/S7→S8 | `ВЫГРУЗКА`/`УВПП`/`ВЫГР` AND load flips ГРУЖ→ПОР | **`trip_end_ts`** = report [4] |
| S9→S2 | next empty arrival at loading station | `loading_arrival_ts` of NEXT trip |

Loading-station vs destination disambiguation uses the active waybill's origin/dest ESR (matched against arrival station ESR).

### Turnover formula (D1, D12 — the single binding definition)

```
оборот,сут (turnover_days) =
    round( (loading_arrival_ts[trip N+1] − loading_arrival_ts[trip N]) / 1 day )
```

- This is the **full cycle** (load → haul → unload → empty return → next load). It is **cross-row**: computed per wagon, ordered in time, carrying `prev_loading_arrival_ts`.
- **Fallback** (next-trip loading not yet known): `round(trip_end_ts − loading_arrival_ts)` → set `turnover_provisional = TRUE`, **exclude from KPI averages**, and never treat as final.
- If `loading_arrival_ts` is missing entirely → fallback base = `dispatch_ts`; still mark provisional.
- Rounding = standard `round()`, not `ceil` (D12).

> Turnover MUST be computed in the lifecycle/matching layer (with access to the wagon's prior trip), then written to the deal row. The report-row builder never recomputes it from a single row in isolation.

---

## 9. Deal-Matching Engine

### Matching

1. **Waybill present:** key `(wagon_number, waybill_number)`. Find open deal (PENDING/ACTIVE) → attach + merge + advance state. Else create PENDING and alert `NEW_WAYBILL_NO_DEAL`.
2. **No waybill** (B, D, some C): fuzzy on `(wagon_number, load=ГРУЖ, |trip_start_ts diff| ≤ window)`. Exactly one open match → attach. Zero + load=ГРУЖ → create PENDING (`waybill=NULL`) + alert `NO_WAYBILL`. Multiple → CONFLICT + alert `MULTI_DEAL_AMBIGUOUS`.
3. **Date-window guard:** a CLOSED deal is never reopened by an old snapshot; late movement attached as anomaly log only.

**Window (configurable by route distance):** loaded leg cap = 60 days; full cycle cap = 120 days. Derive from `distance_total_km` where available. (Reconciles CRITIC MEDIUM-3: the 3-day window was too tight, the 45-day cap too loose.)

### Source precedence (field merge — higher wins)

| Priority | Source | Rationale |
|---|---|---|
| 4 | Operator manual entry | Human correction always wins |
| 3 | A (ЭТРАН full export) | Most columns, official, has weight/consignee |
| 2 | C (отгруженных) | Clean, reliable dates |
| 1 | D (legacy RDB) | Older system |
| 0 | B (РНС) | Column-shift risk; use only for fields A/C/D lack |

Per-field winners: stations/dates/cargo/load_state from A → C → D → B; `wagon_model`/`capacity` from B/D; `station_current` / `distance_remaining` always from the most-recent `operation_ts` regardless of source.

**Conflict detection:** priority-equal sources disagreeing (> 3 days for dates, non-empty string mismatch for text) → `conflict_flags[field] = {srcX, srcY}`, status=CONFLICT, alert `FIELD_CONFLICT`.

### State machine

```
PENDING ─[operator sets client + revenue + cost]→ ACTIVE
ACTIVE  ─[trip-end op detected, load→ПОР]────────→ CLOSED (if prices present; else stays ACTIVE)
CLOSED  ─[conflicting late movement]─────────────→ CONFLICT (log only, no reopen)
PENDING ─[30 days, no client]────────────────────→ ABANDONED (alert)
ANY     ─[operator override]─────────────────────→ ACTIVE | CLOSED
```

Once CLOSED with both prices filled, the deal is **frozen** (immutable). Late files cannot alter it — prevents report drift.

### Price attachment

- **Path A (contract lookup):** `contracts(counterparty, type CLIENT|OWNER, wagon_type, route patterns, valid_from/to, rate)`. Match narrowest route; ambiguous → alert.
- **Path B (manual):** operator enters `revenue_ua`/`cost_owner` (Priority 4, wins). Neither comes from any dislocation source (D7).
- **Computed at export only:** `margin = revenue_ua − cost_owner` (guard: both non-NULL).

### Alert taxonomy (`operator_alerts.alert_type`)

`NEW_WAYBILL_NO_DEAL`, `NO_WAYBILL`, `PRICE_MISSING`, `FIELD_CONFLICT`, `MULTI_DEAL_AMBIGUOUS`, `ABANDONED_PENDING`, `STATION_UNKNOWN`.

---

## 10. Report Generation (17-column monthly sheets)

### Column order (header row 0)

| # | Column | Source |
|---|---|---|
| 0 | Клиент | `counterparties[client_id].name_canonical` (operator/contract; D7) |
| 1 | Пункт отправления | `stations[station_origin_esr].name_human` |
| 2 | Пункт назначения | `stations[station_dest_esr].name_human` |
| 3 | Сумма УА | `revenue_ua` |
| 4 | Дата окончания рейса | `trip_end_ts` (date, MSK) |
| 5 | дата прибытия на станцию погрузки | `loading_arrival_ts` (date, MSK) |
| 6 | оборот,сут | `turnover_days` (cross-row; D1) |
| 7 | Сумма от Поставщика вагона | `cost_owner` |
| 8 | Комиссия | `revenue_ua − cost_owner` (computed at export; both non-NULL) |
| 9 | Дата выполнения (отправки) | `dispatch_ts` (date, MSK) |
| 10 | Тип вагона | `wagon_type` ('ПВ') |
| 11 | Номер вагона | `wagon_number` written as plain integer (legacy float format `52266772.0` preserved via numeric cell) |
| 12 | Номер накладной | `waybill_number` |
| 13 | Наименование груза | `cargo_name` |
| 14 | Счет фактура | `invoice_number` |
| 15 | перевозчик | `carrier_raw` |
| 16 | от компании | `company_raw` ('Приоритет Логистика') |

### Rules

- **Eligibility:** only `status='CLOSED'` deals with `revenue_ua IS NOT NULL AND cost_owner IS NOT NULL` reach a sheet. Half-filled deals go to a separate "pending" surface, never a margin row (CRITIC MEDIUM-2).
- **Month bucketing:** by `trip_end_ts` month by default; `REPORT_MONTH_BASIS` config switch to `dispatch_ts` — verify against a real sheet first (D11).
- **Sheet order:** январь→декабрь (calendar order), not insertion order.
- **Versioned output:** never overwrite the prior report. Write timestamped artifacts to object storage; the "current" pointer updates after a successful regen (stack-fit gap #6).
- **Negative margin:** allowed, exported as-is (flag red via conditional format).
- **Dates** display in MSK; stored UTC (D8).

### Recompute trigger

Any new file ingested → re-derive lifecycle for affected wagons → update OPEN deals → recompute `turnover_days` (cross-row) → regenerate xlsx only for months containing modified deals. CLOSED+priced deals are immutable.

---

## 11. Edge-Case Register

| Scenario | Handling |
|---|---|
| Same event in A and C | `event_key` (D9) collapses; A wins via precedence; no double-count |
| Waybill absent | date-window match; never fabricated from a date column (D2) |
| Source B misalignment | content-signature typing (§4); quarantine if load_state+cargo unlocatable |
| Wagon checksum fail | WARNING + `needs_review`; never drop (D3) |
| Source A no Груж/Порож | derive from weight+waybill (D5) |
| Wagon in repair (no cargo, no waybill) | skip for report; log to maintenance ledger |
| 1904-mode .xls | `parse_dt` honors `book.datemode` (D6) |
| Late file after CLOSE | anomaly log only; no reopen |
| Month-boundary TZ drift | UTC store / MSK parse+display (D8) |
| Provisional turnover | flagged, excluded from KPI averages (D1) |
| Client = consignee assumption | forbidden; Клиент only from deal record (D7) |

---

## 12. Open Items to Confirm Against Real Data (before first prod report)

1. Verify Luhn-11 weight vector on real wagons before enabling W-03 even as advisory (D3).
2. Confirm `REPORT_MONTH_BASIS` (trip_end vs dispatch) against a real monthly sheet (D11).
3. Confirm turnover rounding (`round` vs convention) against several known оборот values (D12).
4. Confirm the route-distance → matching-window mapping against real Ural↔Siberia cycle times (§9).
5. Load and validate the RZhD ESR classifier; confirm Source A ESR coverage (§5).
