# DB_SCHEMA — SimpleCargo

Definitive database schema for SimpleCargo (rail-wagon freight forwarder "Приоритет Логистика").

- **ORM:** Drizzle ORM (`drizzle-orm` + `drizzle-kit`) — per the `[db]` research decision. Postgres dialect, `node-postgres` (`pg`) driver.
- **Database:** Railway-managed PostgreSQL.
- **Migrations:** `drizzle-kit generate` → committed `.sql` → `drizzle-kit migrate` in Railway `preDeployCommand` against `DATABASE_URL_DIRECT` (bypasses PgBouncer; runtime uses pooled `DATABASE_URL`).
- This file is the source of truth for table shapes. Each entity is given **(1) Drizzle TypeScript** and **(2) equivalent SQL DDL**. They must stay in sync.

---

## 0. Cross-Cutting Conventions (locked decisions)

These resolve the contradictions flagged in the adversarial critiques. They are binding.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **All timestamps are `TIMESTAMPTZ`, stored in UTC.** Source dates are parsed as MSK (`Europe/Moscow`) then converted to UTC on ingest. Display converts back to MSK. | Prevents ±1-day `turnover_days` drift at month boundaries (which would move a deal into the wrong monthly sheet). |
| D2 | **Canonical wagon number = 8-char zero-padded string** (`CHAR(8)`), e.g. `"52266772"`. Normalize by `str(int(float(v))).zfill(8)`. | Single join key across all sources and the report. |
| D3 | **Wagon checksum (Luhn-11) is ADVISORY only** — failures set `needs_review=TRUE`, never drop the row. | A typo in an owner's file must never silently delete a real revenue trip from the margin report. |
| D4 | **ESR code is the canonical station identity.** Source A carries ESR inline (`"ДОБРЯТИНО (243309)"`) — trust the file, never hardcode ESR literals. Human names live in `station_aliases`. | Removes the invented/contradictory ESR literals across the research findings. |
| D5 | **Turnover (`оборот, сут`) = cycle turnover**: `next_loading_event_ts − this_loading_event_ts` for the same wagon (loading event = transition to ГРУЖ at the loading station, i.e. `дата прибытия на станцию погрузки`). Computed **cross-row** in the matching/lifecycle layer, then written to `deals.turnover_days`. A single-trip fallback (`trip_end − arrive_loading`) is allowed only with `turnover_provisional=TRUE` and is excluded from KPI averages. | The brief's verified definition. Trip-duration would undercount by the whole empty-return leg (~30–50%). |
| D6 | **Dedup is layered:** `ingested_files.content_sha256` (file), `wagon_movements.fingerprint` (row), and a **cross-source canonical event key** `event_key = (wagon_number, operation_code, operation_ts rounded to 15 min)` to collapse the same physical event seen in Source A (full export) and Source C/B/D (subsets). | The same movement in two sources has different file/row hashes but is one event; this prevents double-counting margin. |
| D7 | **Money** = `NUMERIC(14,2)`. **`deals.margin` is a generated STORED column** `revenue_ua - cost_owner` (operator-confirmed P0-3, per ROADMAP P0-3 + ARCHITECTURE §4.2). Postgres yields `NULL` whenever either input is `NULL`, so a half-filled deal never carries a misleading margin. The report-export path additionally gates on `revenue_ua IS NOT NULL AND cost_owner IS NOT NULL`; `report_rows.margin` is a plain projected column. | A half-filled deal must never emit a misleading margin — `NULL` propagation enforces this at the column level. |
| D8 | **Source priority for field merge:** A > C > B > D < operator-manual (manual always wins). Stored per-field via provenance where it matters. | Source B has the column-shift risk; D is legacy; A is the official ЭТРАН export. |
| D9 | Soft enums use Postgres `TEXT` + `CHECK` (not native `pgEnum`) so new values from messy sources do not require a migration to ingest-then-quarantine. | Resilience to source drift. |
| D10 | UUID PKs (`uuid` default `gen_random_uuid()`) for domain entities; `bigserial` for high-volume append-only logs (`wagon_movements`, `quarantine_rows`). | Domain rows are referenced/shared; log rows are sequential and internal. |

**Enum vocabularies**

- `load_state` ∈ `{ГРУЖ, ПОР, UNKNOWN}` (normalized; `ГРУЖЕН/ГРУЖЕНЫЙ→ГРУЖ`, `ПОРОЖ/ПОРОЖНИЙ→ПОР`).
- `source_type` ∈ `{A, B, C, D, REPORT_IMPORT, MANUAL}`.
- `deal.status` ∈ `{OPEN, ACTIVE, COMPLETE, CONFLICT, ABANDONED}`.
- `severity` ∈ `{CRITICAL, ERROR, WARNING, INFO}`.
- `ingest.status` ∈ `{pending, processing, normalized, quarantined, committed}`.

---

## 1. Auth — `users`, `sessions`, `accounts`, `verifications`

MVP scope = auth + login to dashboard. Better Auth owns these tables (per `[auth]`). Sessions live in Postgres (Redis secondary storage is deferred — MVP is Postgres-only). Schema shape matches Better Auth's generator; we pin it here so it is reviewable.

> **Secret naming locked:** `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` (not `NEXTAUTH_*`).

### Drizzle

```typescript
// src/db/schema/auth.ts
import { pgTable, uuid, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id:            uuid("id").primaryKey().defaultRandom(),
  email:         text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name:          text("name"),
  image:         text("image"),
  role:          text("role").notNull().default("operator"), // admin | operator | viewer
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:     text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx:    index("idx_sessions_user").on(t.userId),
  expiresIdx: index("idx_sessions_expires").on(t.expiresAt),
}));

// OAuth/credentials store (future Google email-agent refresh tokens land here)
export const accounts = pgTable("accounts", {
  id:                    uuid("id").primaryKey().defaultRandom(),
  userId:                uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId:             text("account_id").notNull(),
  providerId:            text("provider_id").notNull(),
  accessToken:           text("access_token"),
  refreshToken:          text("refresh_token"),
  accessTokenExpiresAt:  timestamp("access_token_expires_at", { withTimezone: true }),
  password:              text("password"), // Argon2id hash for credentials provider
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("idx_accounts_user").on(t.userId),
}));

export const verifications = pgTable("verifications", {
  id:         uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value:      text("value").notNull(),
  expiresAt:  timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### SQL DDL

```sql
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  name           TEXT,
  image          TEXT,
  role           TEXT NOT NULL DEFAULT 'operator'
                 CHECK (role IN ('admin','operator','viewer')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE accounts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id                TEXT NOT NULL,
  provider_id               TEXT NOT NULL,
  access_token              TEXT,
  refresh_token             TEXT,
  access_token_expires_at   TIMESTAMPTZ,
  password                  TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_user ON accounts(user_id);

CREATE TABLE verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier  TEXT NOT NULL,
  value       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 2. Reference dictionaries — `roads`, `stations`, `station_aliases`

`roads` is a small seeded lookup. `stations` is bootstrapped from the RZhD ESR classifier + ESR codes observed in Source A. `station_aliases` maps human/report names and fuzzy-confirmed variants to ESR.

### Drizzle

```typescript
// src/db/schema/geo.ts
import { pgTable, integer, text, numeric, boolean, timestamp, uuid, index, char } from "drizzle-orm/pg-core";

export const roads = pgTable("roads", {
  rzdCode:        integer("rzd_code").primaryKey(),     // e.g. 24 (Горьковская). Authoritative from Source A "(24)".
  shortCode:      text("short_code").notNull(),         // e.g. "ГОР" (Source B/D). NOT unique: codes drift.
  fullNameRu:     text("full_name_ru").notNull(),       // "ГОРЬКОВСКАЯ"
  fullNameTranslit: text("full_name_translit"),
}, (t) => ({
  shortIdx: index("idx_roads_short").on(t.shortCode),
}));

export const stations = pgTable("stations", {
  esrCode:        char("esr_code", { length: 6 }).primaryKey(), // canonical key, e.g. "243309"
  nameEtran:      text("name_etran").notNull(),                 // raw ЭТРАН name "ДОБРЯТИНО"
  nameNormalized: text("name_normalized").notNull(),            // uppercase, NFKD, punctuation-stripped
  roadCode:       integer("road_code").references(() => roads.rzdCode),
  region:         text("region"),
  lat:            numeric("lat", { precision: 9, scale: 6 }),
  lon:            numeric("lon", { precision: 9, scale: 6 }),
  isQuarantined:  boolean("is_quarantined").notNull().default(false),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  normIdx: index("idx_stations_name_norm").on(t.nameNormalized),
  roadIdx: index("idx_stations_road").on(t.roadCode),
}));

export const stationAliases = pgTable("station_aliases", {
  id:              uuid("id").primaryKey().defaultRandom(),
  esrCode:         char("esr_code", { length: 6 }).notNull().references(() => stations.esrCode),
  alias:           text("alias").notNull(),             // "Асбест"
  aliasNormalized: text("alias_normalized").notNull().unique(), // one normalized alias → exactly one ESR
  source:          text("source").notNull().default("manual"), // report | manual | fuzzy_confirmed
  confidence:      numeric("confidence", { precision: 4, scale: 3 }), // 1.0 exact, <1.0 fuzzy
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  esrIdx: index("idx_alias_esr").on(t.esrCode),
}));
```

### SQL DDL

```sql
CREATE TABLE roads (
  rzd_code            INTEGER PRIMARY KEY,
  short_code          TEXT NOT NULL,
  full_name_ru        TEXT NOT NULL,
  full_name_translit  TEXT
);
CREATE INDEX idx_roads_short ON roads(short_code);

CREATE TABLE stations (
  esr_code        CHAR(6) PRIMARY KEY,
  name_etran      TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  road_code       INTEGER REFERENCES roads(rzd_code),
  region          TEXT,
  lat             NUMERIC(9,6),
  lon             NUMERIC(9,6),
  is_quarantined  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stations_name_norm ON stations(name_normalized);
CREATE INDEX idx_stations_road      ON stations(road_code);

CREATE TABLE station_aliases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  esr_code         CHAR(6) NOT NULL REFERENCES stations(esr_code),
  alias            TEXT NOT NULL,
  alias_normalized TEXT NOT NULL UNIQUE,
  source           TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('report','manual','fuzzy_confirmed')),
  confidence       NUMERIC(4,3),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alias_esr ON station_aliases(esr_code);
```

---

## 3. `counterparties`

Unified table for clients, owners, shippers, consignees, carriers.

### Drizzle

```typescript
// src/db/schema/counterparties.ts
import { pgTable, uuid, text, varchar, timestamp, index } from "drizzle-orm/pg-core";

export const counterparties = pgTable("counterparties", {
  id:             uuid("id").primaryKey().defaultRandom(),
  nameCanonical:  text("name_canonical").notNull().unique(), // "Ураласбест"
  nameRawVariants: text("name_raw_variants").array(),        // all raw strings seen, for fuzzy match
  roles:          text("roles").array().notNull().default([]), // {client,owner,shipper,consignee,carrier}
  inn:            varchar("inn", { length: 12 }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  innIdx: index("idx_counterparty_inn").on(t.inn),
}));
```

### SQL DDL

```sql
CREATE TABLE counterparties (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_canonical     TEXT NOT NULL UNIQUE,
  name_raw_variants  TEXT[],
  roles              TEXT[] NOT NULL DEFAULT '{}',
  inn                VARCHAR(12),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_counterparty_inn ON counterparties(inn);
```

---

## 4. `wagons`

One row per physical wagon. Wagon number is the master key.

### Drizzle

```typescript
// src/db/schema/wagons.ts
import { pgTable, char, varchar, numeric, integer, date, text, timestamp } from "drizzle-orm/pg-core";

export const wagons = pgTable("wagons", {
  wagonNumber:           char("wagon_number", { length: 8 }).primaryKey(), // canonical 8-digit
  wagonType:             varchar("wagon_type", { length: 20 }),            // "ПВ"
  wagonSubtypeRaw:       text("wagon_subtype_raw"),                        // "Полувагоны (60)"
  model:                 varchar("model", { length: 20 }),                 // "12-9837"
  volumeM3:              numeric("volume_m3", { precision: 8, scale: 2 }),
  capacityTonnes:        numeric("capacity_tonnes", { precision: 8, scale: 2 }),
  ownerAdministration:   text("owner_administration"),                     // "РЖД (20)"
  buildDate:             date("build_date"),
  nextPlannedRepairDate: date("next_planned_repair_date"),
  currentMileageKm:      integer("current_mileage_km"),
  checksumValid:         text("checksum_valid"),  // 'ok'|'fail'|'unknown' — ADVISORY (D3)
  createdAt:             timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:             timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### SQL DDL

```sql
CREATE TABLE wagons (
  wagon_number              CHAR(8) PRIMARY KEY,
  wagon_type                VARCHAR(20),
  wagon_subtype_raw         TEXT,
  model                     VARCHAR(20),
  volume_m3                 NUMERIC(8,2),
  capacity_tonnes           NUMERIC(8,2),
  owner_administration      TEXT,
  build_date                DATE,
  next_planned_repair_date  DATE,
  current_mileage_km        INTEGER,
  checksum_valid            TEXT CHECK (checksum_valid IN ('ok','fail','unknown')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 5. `ingested_files` — idempotency

File-level dedup (D6). One row per parsed attachment/upload, keyed by content hash.

### Drizzle

```typescript
// src/db/schema/ingest.ts
import { pgTable, uuid, char, text, integer, boolean, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const ingestedFiles = pgTable("ingested_files", {
  id:             uuid("id").primaryKey().defaultRandom(),
  contentSha256:  char("content_sha256", { length: 64 }).notNull().unique(), // idempotency key
  filename:       text("filename").notNull(),
  sourceType:     char("source_type", { length: 1 }).notNull(),  // A/B/C/D (REPORT_IMPORT/MANUAL elsewhere)
  senderEmail:    text("sender_email"),
  gmailMessageId: text("gmail_message_id"),
  storageKey:     text("storage_key"),                           // object-storage path to original (never local volume)
  headerRow:      integer("header_row"),                         // detected header row index
  columnShift:    integer("column_shift").default(0),            // Source B shift offset detected
  rowCount:       integer("row_count"),
  status:         text("status").notNull().default("pending"),   // pending|processing|normalized|quarantined|committed
  quarantined:    boolean("quarantined").notNull().default(false),
  errorDetail:    jsonb("error_detail"),
  agentRunId:     text("agent_run_id"),                          // Claude request id (future)
  receivedAt:     timestamp("received_at", { withTimezone: true }),
  ingestedAt:     timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("idx_files_status").on(t.status),
  sourceIdx: index("idx_files_source").on(t.sourceType),
}));
```

### SQL DDL

```sql
CREATE TABLE ingested_files (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_sha256   CHAR(64) NOT NULL UNIQUE,
  filename         TEXT NOT NULL,
  source_type      CHAR(1) NOT NULL,
  sender_email     TEXT,
  gmail_message_id TEXT,
  storage_key      TEXT,
  header_row       INTEGER,
  column_shift     INTEGER DEFAULT 0,
  row_count        INTEGER,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','normalized','quarantined','committed')),
  quarantined      BOOLEAN NOT NULL DEFAULT FALSE,
  error_detail     JSONB,
  agent_run_id     TEXT,
  received_at      TIMESTAMPTZ,
  ingested_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_files_status ON ingested_files(status);
CREATE INDEX idx_files_source ON ingested_files(source_type);
```

---

## 6. `wagon_movements` — time-series fact table

Core append-only log. One row per operation/snapshot per wagon per file. Never updated in place (only `is_primary`/`superseded_by`/`needs_review` flags flip). This is the highest-volume table and carries the join-key indexes that power turnover and report queries.

### Drizzle

```typescript
// src/db/schema/movements.ts
import {
  pgTable, bigserial, bigint, uuid, char, varchar, text, integer, numeric,
  boolean, jsonb, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { ingestedFiles } from "./ingest";
import { wagons } from "./wagons";

export const wagonMovements = pgTable("wagon_movements", {
  id:            bigserial("id", { mode: "number" }).primaryKey(),
  fingerprint:   char("fingerprint", { length: 64 }).notNull(),   // row-level dedup hash (D6)
  eventKey:      char("event_key", { length: 64 }).notNull(),     // cross-source canonical event (D6)
  sourceFileId:  uuid("source_file_id").references(() => ingestedFiles.id),
  sourceType:    char("source_type", { length: 1 }).notNull(),

  // dedup / merge bookkeeping
  isPrimary:     boolean("is_primary").notNull().default(true),
  supersededBy:  bigint("superseded_by", { mode: "number" }),
  needsReview:   boolean("needs_review").notNull().default(false),

  // identity
  wagonNumber:   char("wagon_number", { length: 8 }).notNull().references(() => wagons.wagonNumber),
  waybillNumber: text("waybill_number"),                          // secondary join key, nullable
  shipmentId:    text("shipment_id"),                             // Source A "2024ЭУ477040"

  // operation
  operationCode: varchar("operation_code", { length: 16 }),       // mnemonic "УВПП"
  operationName: text("operation_name"),                          // "ВЫГРУЗКА НА ПП"
  operationTs:   timestamp("operation_ts", { withTimezone: true }),
  loadState:     text("load_state"),                              // ГРУЖ|ПОР|UNKNOWN

  // trip timing (all UTC, parsed-as-MSK)
  tripStartTs:   timestamp("trip_start_ts", { withTimezone: true }),
  departTs:      timestamp("depart_ts", { withTimezone: true }),
  arriveTs:      timestamp("arrive_ts", { withTimezone: true }),  // arrival at current dislocation
  estArrivalTs:  timestamp("est_arrival_ts", { withTimezone: true }),
  deliveryDeadlineTs: timestamp("delivery_deadline_ts", { withTimezone: true }),

  // stations (raw + resolved ESR)
  stationDepartEsr:  char("station_depart_esr", { length: 6 }),
  stationDepartRaw:  text("station_depart_raw"),
  roadDepartRaw:     text("road_depart_raw"),
  stationCurrentEsr: char("station_current_esr", { length: 6 }),
  stationCurrentRaw: text("station_current_raw"),
  roadCurrentRaw:    text("road_current_raw"),
  stationDestEsr:    char("station_dest_esr", { length: 6 }),
  stationDestRaw:    text("station_dest_raw"),
  roadDestRaw:       text("road_dest_raw"),

  // cargo
  cargoName:       text("cargo_name"),
  cargoCodeEtsng:  varchar("cargo_code_etsng", { length: 16 }),
  cargoWeightKg:   numeric("cargo_weight_kg", { precision: 12, scale: 2 }),
  shipperRaw:      text("shipper_raw"),
  consigneeRaw:    text("consignee_raw"),

  // KPIs / metrics
  idleDaysStation:    numeric("idle_days_station", { precision: 6, scale: 2 }),
  idleDaysOperation:  numeric("idle_days_operation", { precision: 6, scale: 2 }),
  daysNoOperation:    integer("days_no_operation"),
  daysNoMovement:     integer("days_no_movement"),
  distRemainingKm:    integer("dist_remaining_km"),
  distTraveledKm:     integer("dist_traveled_km"),
  distTotalKm:        integer("dist_total_km"),
  trainIndex:         text("train_index"),
  parkTypeRaw:        text("park_type_raw"),

  rawJson:       jsonb("raw_json"),                               // full original row for audit
  ingestedAt:    timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // dedup
  fingerprintUx: uniqueIndex("ux_wm_fingerprint").on(t.fingerprint),
  // join keys (D2/D5)
  wagonIdx:      index("idx_wm_wagon").on(t.wagonNumber),
  waybillIdx:    index("idx_wm_waybill").on(t.waybillNumber),
  // cross-source event collapse
  eventIdx:      index("idx_wm_event").on(t.eventKey),
  // turnover / lifecycle: ordered scan of a wagon's events by time
  wagonTsIdx:    index("idx_wm_wagon_ts").on(t.wagonNumber, t.operationTs),
  // loading-event lookup for turnover (partial)
  loadEventIdx:  index("idx_wm_load_event").on(t.wagonNumber, t.operationTs),
  // matching by (wagon, waybill, time-window)
  matchIdx:      index("idx_wm_match").on(t.wagonNumber, t.waybillNumber, t.operationTs),
  reviewIdx:     index("idx_wm_review").on(t.needsReview),
}));
```

### SQL DDL

```sql
CREATE TABLE wagon_movements (
  id                   BIGSERIAL PRIMARY KEY,
  fingerprint          CHAR(64) NOT NULL,
  event_key            CHAR(64) NOT NULL,
  source_file_id       UUID REFERENCES ingested_files(id),
  source_type          CHAR(1) NOT NULL,

  is_primary           BOOLEAN NOT NULL DEFAULT TRUE,
  superseded_by        BIGINT REFERENCES wagon_movements(id),
  needs_review         BOOLEAN NOT NULL DEFAULT FALSE,

  wagon_number         CHAR(8) NOT NULL REFERENCES wagons(wagon_number),
  waybill_number       TEXT,
  shipment_id          TEXT,

  operation_code       VARCHAR(16),
  operation_name       TEXT,
  operation_ts         TIMESTAMPTZ,
  load_state           TEXT CHECK (load_state IN ('ГРУЖ','ПОР','UNKNOWN')),

  trip_start_ts        TIMESTAMPTZ,
  depart_ts            TIMESTAMPTZ,
  arrive_ts            TIMESTAMPTZ,
  est_arrival_ts       TIMESTAMPTZ,
  delivery_deadline_ts TIMESTAMPTZ,

  station_depart_esr   CHAR(6),
  station_depart_raw   TEXT,
  road_depart_raw      TEXT,
  station_current_esr  CHAR(6),
  station_current_raw  TEXT,
  road_current_raw     TEXT,
  station_dest_esr     CHAR(6),
  station_dest_raw     TEXT,
  road_dest_raw        TEXT,

  cargo_name           TEXT,
  cargo_code_etsng     VARCHAR(16),
  cargo_weight_kg      NUMERIC(12,2),
  shipper_raw          TEXT,
  consignee_raw        TEXT,

  idle_days_station    NUMERIC(6,2),
  idle_days_operation  NUMERIC(6,2),
  days_no_operation    INTEGER,
  days_no_movement     INTEGER,
  dist_remaining_km    INTEGER,
  dist_traveled_km     INTEGER,
  dist_total_km        INTEGER,
  train_index          TEXT,
  park_type_raw        TEXT,

  raw_json             JSONB,
  ingested_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dedup: fingerprint is the durable row-level idempotency key.
-- NULL operation_ts is COALESCE'd to a sentinel INSIDE the fingerprint hash
-- (computed in app code) so NULLs cannot collide or duplicate silently.
CREATE UNIQUE INDEX ux_wm_fingerprint ON wagon_movements(fingerprint);

-- Join keys
CREATE INDEX idx_wm_wagon     ON wagon_movements(wagon_number);
CREATE INDEX idx_wm_waybill   ON wagon_movements(waybill_number);
CREATE INDEX idx_wm_event     ON wagon_movements(event_key);

-- Turnover / lifecycle: ordered per-wagon time scan
CREATE INDEX idx_wm_wagon_ts  ON wagon_movements(wagon_number, operation_ts);

-- Loading-event lookup for cycle turnover (only loaded-at-origin transitions)
CREATE INDEX idx_wm_load_event ON wagon_movements(wagon_number, operation_ts)
  WHERE load_state = 'ГРУЖ';

-- Matching by (wagon, waybill, time window)
CREATE INDEX idx_wm_match    ON wagon_movements(wagon_number, waybill_number, operation_ts);
CREATE INDEX idx_wm_review   ON wagon_movements(needs_review) WHERE needs_review = TRUE;
```

---

## 7. `deals` — one completed trip = one report row

The unit of margin and turnover. Created/updated by matching `wagon_movements` to commercial terms. Money + commercial fields are operator-entered or contract-resolved; movement-derived fields come from the matched rows.

### Drizzle

```typescript
// src/db/schema/deals.ts
import {
  pgTable, uuid, char, varchar, text, numeric, integer, boolean,
  date, timestamp, bigint, jsonb, index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { wagons } from "./wagons";
import { counterparties } from "./counterparties";

export const deals = pgTable("deals", {
  id:            uuid("id").primaryKey().defaultRandom(),
  wagonNumber:   char("wagon_number", { length: 8 }).notNull().references(() => wagons.wagonNumber),
  waybillNumber: text("waybill_number"),                          // primary movement→deal join key
  reportMonth:   char("report_month", { length: 7 }).notNull(),   // "2026-08" (month of trip_end_ts, MSK)

  // commercial parties
  clientId:      uuid("client_id").references(() => counterparties.id),   // Клиент (pays us)
  ownerId:       uuid("owner_id").references(() => counterparties.id),    // Поставщик вагона (we pay)
  carrierRaw:    text("carrier_raw"),                             // перевозчик "Алькон"
  companyRaw:    text("company_raw").default("Приоритет Логистика"),

  // route (ESR resolved → human name on export)
  stationOriginEsr: char("station_origin_esr", { length: 6 }),
  stationDestEsr:   char("station_dest_esr", { length: 6 }),
  cargoName:        text("cargo_name"),
  wagonType:        varchar("wagon_type", { length: 20 }).default("ПВ"),

  // financials (D7: margin = generated STORED col, NULL unless both inputs present)
  revenueUa:     numeric("revenue_ua", { precision: 14, scale: 2 }),   // Сумма УА
  costOwner:     numeric("cost_owner", { precision: 14, scale: 2 }),   // Сумма от Поставщика
  margin:        numeric("margin", { precision: 14, scale: 2 })
                   .generatedAlwaysAs(sql`revenue_ua - cost_owner`),   // STORED; NULL if either NULL
  revenueSource: text("revenue_source"),  // manual | contract
  costSource:    text("cost_source"),     // manual | contract

  // dates (UTC)
  dateTripEndTs:        timestamp("date_trip_end_ts", { withTimezone: true }),       // Дата окончания рейса [4]
  dateArrivedLoadingTs: timestamp("date_arrived_loading_ts", { withTimezone: true }),// дата прибытия на погрузку [5]
  dateDispatchedTs:     timestamp("date_dispatched_ts", { withTimezone: true }),     // Дата выполнения (отправки) [9]

  // turnover (D5: cycle, cross-row computed)
  turnoverDays:        integer("turnover_days"),
  turnoverProvisional: boolean("turnover_provisional").notNull().default(false), // excluded from KPI avgs

  invoiceNumber: text("invoice_number"),                          // Счет фактура [14]

  status:        text("status").notNull().default("OPEN"),        // OPEN|ACTIVE|COMPLETE|CONFLICT|ABANDONED
  sourceMovementIds: bigint("source_movement_ids", { mode: "number" }).array(),
  conflictFlags: jsonb("conflict_flags"),                         // field-level disagreements
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  wagonIdx:    index("idx_deals_wagon").on(t.wagonNumber),
  waybillIdx:  index("idx_deals_waybill").on(t.waybillNumber),
  monthIdx:    index("idx_deals_month").on(t.reportMonth),
  statusIdx:   index("idx_deals_status").on(t.status),
  clientIdx:   index("idx_deals_client").on(t.clientId),
  // report query: a month's completed deals ordered by trip end
  monthEndIdx: index("idx_deals_month_end").on(t.reportMonth, t.dateTripEndTs),
  // matching open deals for a wagon by trip start
  matchIdx:    index("idx_deals_match").on(t.wagonNumber, t.tripStartFallback),
}));
```

> Note: `tripStartFallback` in the match index maps to `date_dispatched_ts` (the practical trip-start proxy used for waybill-less date-window matching). Implemented in SQL below directly on `date_dispatched_ts`.

### SQL DDL

```sql
CREATE TABLE deals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wagon_number             CHAR(8) NOT NULL REFERENCES wagons(wagon_number),
  waybill_number           TEXT,
  report_month             CHAR(7) NOT NULL,

  client_id                UUID REFERENCES counterparties(id),
  owner_id                 UUID REFERENCES counterparties(id),
  carrier_raw              TEXT,
  company_raw              TEXT DEFAULT 'Приоритет Логистика',

  station_origin_esr       CHAR(6),
  station_dest_esr         CHAR(6),
  cargo_name               TEXT,
  wagon_type               VARCHAR(20) DEFAULT 'ПВ',

  revenue_ua               NUMERIC(14,2),
  cost_owner               NUMERIC(14,2),
  margin                   NUMERIC(14,2) GENERATED ALWAYS AS (revenue_ua - cost_owner) STORED,
  revenue_source           TEXT CHECK (revenue_source IN ('manual','contract')),
  cost_source              TEXT CHECK (cost_source   IN ('manual','contract')),

  date_trip_end_ts         TIMESTAMPTZ,
  date_arrived_loading_ts  TIMESTAMPTZ,
  date_dispatched_ts       TIMESTAMPTZ,

  turnover_days            INTEGER,
  turnover_provisional     BOOLEAN NOT NULL DEFAULT FALSE,

  invoice_number           TEXT,

  status                   TEXT NOT NULL DEFAULT 'OPEN'
                           CHECK (status IN ('OPEN','ACTIVE','COMPLETE','CONFLICT','ABANDONED')),
  source_movement_ids      BIGINT[],
  conflict_flags           JSONB,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deals_wagon     ON deals(wagon_number);
CREATE INDEX idx_deals_waybill   ON deals(waybill_number);
CREATE INDEX idx_deals_month     ON deals(report_month);
CREATE INDEX idx_deals_status    ON deals(status);
CREATE INDEX idx_deals_client    ON deals(client_id);

-- Report query: completed deals for a month, ordered by trip end.
CREATE INDEX idx_deals_month_end ON deals(report_month, date_trip_end_ts);

-- Matching open deals by wagon + dispatch-time window.
CREATE INDEX idx_deals_match     ON deals(wagon_number, date_dispatched_ts);

-- Partial index to find deals still missing financials (alert/pending UI).
CREATE INDEX idx_deals_pending   ON deals(report_month)
  WHERE status = 'COMPLETE' AND (revenue_ua IS NULL OR cost_owner IS NULL);
```

---

## 8. `contract_prices`

Rate cards for auto-resolving `revenue_ua` (client) and `cost_owner` (owner) when a deal is created. Operator-entered prices always override (D8).

### Drizzle

```typescript
// src/db/schema/contracts.ts
import { pgTable, uuid, text, char, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { counterparties } from "./counterparties";

export const contractPrices = pgTable("contract_prices", {
  id:               uuid("id").primaryKey().defaultRandom(),
  counterpartyId:   uuid("counterparty_id").notNull().references(() => counterparties.id),
  counterpartyType: text("counterparty_type").notNull(),          // CLIENT | OWNER
  wagonType:        text("wagon_type"),                           // "ПВ" or NULL = any
  routeOriginEsr:   char("route_origin_esr", { length: 6 }),      // NULL = any
  routeDestEsr:     char("route_dest_esr", { length: 6 }),        // NULL = any
  rateRub:          numeric("rate_rub", { precision: 14, scale: 2 }).notNull(),
  rateBasis:        text("rate_basis").notNull(),                 // PER_TRIP | PER_TON | PER_DAY
  validFrom:        date("valid_from").notNull(),
  validTo:          date("valid_to").notNull(),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  lookupIdx: index("idx_contract_lookup")
    .on(t.counterpartyType, t.wagonType, t.routeOriginEsr, t.routeDestEsr, t.validFrom, t.validTo),
  cpIdx: index("idx_contract_cp").on(t.counterpartyId),
}));
```

### SQL DDL

```sql
CREATE TABLE contract_prices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty_id    UUID NOT NULL REFERENCES counterparties(id),
  counterparty_type  TEXT NOT NULL CHECK (counterparty_type IN ('CLIENT','OWNER')),
  wagon_type         TEXT,
  route_origin_esr   CHAR(6),
  route_dest_esr     CHAR(6),
  rate_rub           NUMERIC(14,2) NOT NULL,
  rate_basis         TEXT NOT NULL CHECK (rate_basis IN ('PER_TRIP','PER_TON','PER_DAY')),
  valid_from         DATE NOT NULL,
  valid_to           DATE NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contract_lookup
  ON contract_prices(counterparty_type, wagon_type, route_origin_esr, route_dest_esr, valid_from, valid_to);
CREATE INDEX idx_contract_cp ON contract_prices(counterparty_id);
```

---

## 9. `report_rows` — denormalized export projection

A materialized projection of `COMPLETE` deals, partitioned logically by `report_month`. Fields map 1:1 to the 17 Excel columns. Regenerated (not overwritten) on data change; versioned via `generation_id` so a bad regeneration never destroys the prior good report. `margin` is computed here (the only place it lives), populated only when both inputs are present (D7).

### Drizzle

```typescript
// src/db/schema/report.ts
import { pgTable, uuid, char, text, numeric, integer, date, timestamp, index } from "drizzle-orm/pg-core";
import { deals } from "./deals";

export const reportRows = pgTable("report_rows", {
  id:            uuid("id").primaryKey().defaultRandom(),
  generationId:  uuid("generation_id").notNull(),                 // one batch = one export run (versioning)
  dealId:        uuid("deal_id").notNull().references(() => deals.id),
  reportMonth:   char("report_month", { length: 7 }).notNull(),   // sheet selector

  // 17 columns, in report order [0..16]
  client:           text("client"),                               // [0]
  origin:           text("origin"),                               // [1] human place name
  destination:      text("destination"),                          // [2] human place name
  revenueUa:        numeric("revenue_ua", { precision: 14, scale: 2 }), // [3]
  dateTripEnd:      date("date_trip_end"),                        // [4]
  dateArrivedLoading: date("date_arrived_loading"),               // [5]
  turnoverDays:     integer("turnover_days"),                     // [6]
  costOwner:        numeric("cost_owner", { precision: 14, scale: 2 }), // [7]
  margin:           numeric("margin", { precision: 14, scale: 2 }),     // [8] = revenue - cost (both non-null)
  dateDispatched:   date("date_dispatched"),                      // [9]
  wagonType:        text("wagon_type"),                           // [10]
  wagonNumber:      char("wagon_number", { length: 8 }),          // [11] (written to xlsx as integer)
  waybillNumber:    text("waybill_number"),                       // [12]
  cargoName:        text("cargo_name"),                           // [13]
  invoiceNumber:    text("invoice_number"),                       // [14]
  carrier:          text("carrier"),                              // [15]
  company:          text("company"),                              // [16]

  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // export query: latest generation for a month, ordered by trip end
  monthGenIdx: index("idx_report_month_gen").on(t.reportMonth, t.generationId, t.dateTripEnd),
  dealIdx:     index("idx_report_deal").on(t.dealId),
  genIdx:      index("idx_report_gen").on(t.generationId),
}));
```

### SQL DDL

```sql
CREATE TABLE report_rows (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id         UUID NOT NULL,
  deal_id               UUID NOT NULL REFERENCES deals(id),
  report_month          CHAR(7) NOT NULL,

  client                TEXT,
  origin                TEXT,
  destination           TEXT,
  revenue_ua            NUMERIC(14,2),
  date_trip_end         DATE,
  date_arrived_loading  DATE,
  turnover_days         INTEGER,
  cost_owner            NUMERIC(14,2),
  margin                NUMERIC(14,2),  -- = revenue_ua - cost_owner, only when both non-null
  date_dispatched       DATE,
  wagon_type            TEXT,
  wagon_number          CHAR(8),
  waybill_number        TEXT,
  cargo_name            TEXT,
  invoice_number        TEXT,
  carrier               TEXT,
  company               TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_month_gen ON report_rows(report_month, generation_id, date_trip_end);
CREATE INDEX idx_report_deal      ON report_rows(deal_id);
CREATE INDEX idx_report_gen       ON report_rows(generation_id);
```

---

## 10. `quarantine_rows` — row/file rejects and review queue

Rows that fail validation (bad wagon checksum advisory, unparseable date, unresolvable column shift, unknown station, etc.) land here with a reason code and the raw row preserved for operator review/reprocess.

### Drizzle

```typescript
// src/db/schema/quarantine.ts
import { pgTable, bigserial, uuid, integer, text, jsonb, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { ingestedFiles } from "./ingest";

export const quarantineRows = pgTable("quarantine_rows", {
  id:           bigserial("id", { mode: "number" }).primaryKey(),
  sourceFileId: uuid("source_file_id").references(() => ingestedFiles.id),
  rowIndex:     integer("row_index"),                             // 0-based row after header
  tier:         text("tier").notNull(),                          // fatal | recoverable | row_warning
  severity:     text("severity").notNull(),                      // CRITICAL|ERROR|WARNING|INFO
  ruleId:       text("rule_id").notNull(),                       // 'W-03','D-02','CS-03',...
  reasonCode:   text("reason_code").notNull(),                   // 'WAGON_CHECKSUM_FAIL', etc.
  fieldName:    text("field_name"),
  rawValue:     text("raw_value"),
  rawRowJson:   jsonb("raw_row_json"),
  agentReason:  text("agent_reason"),                            // LLM explanation (future)
  resolved:     boolean("resolved").notNull().default(false),
  resolvedEsr:  text("resolved_esr"),                            // for station-resolution cases
  reviewAction: text("review_action"),                          // approved|rejected|reprocessed
  resolvedBy:   uuid("resolved_by"),                            // users.id (no hard FK; nullable)
  resolvedAt:   timestamp("resolved_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unresolvedIdx: index("idx_quarantine_unresolved").on(t.resolved),
  fileIdx:       index("idx_quarantine_file").on(t.sourceFileId),
  reasonIdx:     index("idx_quarantine_reason").on(t.reasonCode),
}));
```

### SQL DDL

```sql
CREATE TABLE quarantine_rows (
  id              BIGSERIAL PRIMARY KEY,
  source_file_id  UUID REFERENCES ingested_files(id),
  row_index       INTEGER,
  tier            TEXT NOT NULL CHECK (tier IN ('fatal','recoverable','row_warning')),
  severity        TEXT NOT NULL CHECK (severity IN ('CRITICAL','ERROR','WARNING','INFO')),
  rule_id         TEXT NOT NULL,
  reason_code     TEXT NOT NULL,
  field_name      TEXT,
  raw_value       TEXT,
  raw_row_json    JSONB,
  agent_reason    TEXT,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_esr    TEXT,
  review_action   TEXT CHECK (review_action IN ('approved','rejected','reprocessed')),
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quarantine_unresolved ON quarantine_rows(resolved) WHERE resolved = FALSE;
CREATE INDEX idx_quarantine_file       ON quarantine_rows(source_file_id);
CREATE INDEX idx_quarantine_reason     ON quarantine_rows(reason_code);
```

---

## 11. Key Query Patterns the Indexes Serve

| Query | Index used |
|-------|-----------|
| Per-wagon ordered event scan for **cycle turnover** (D5: loading-event → next loading-event) | `idx_wm_wagon_ts`, partial `idx_wm_load_event` |
| Match a movement to a deal by `(wagon, waybill, date window)` | `idx_wm_match`, `idx_deals_match` |
| Cross-source event dedup collapse | `idx_wm_event` |
| Row idempotency on re-ingest | `ux_wm_fingerprint` |
| File idempotency on re-ingest | `ingested_files.content_sha256` UNIQUE |
| Build a monthly report sheet (completed deals ordered by trip end) | `idx_deals_month_end`, `idx_report_month_gen` |
| Deals still missing prices (pending alert/UI) | partial `idx_deals_pending` |
| Operator review queue | partial `idx_wm_review`, `idx_quarantine_unresolved` |
| Station resolution by normalized name / alias | `idx_stations_name_norm`, `station_aliases.alias_normalized` UNIQUE |

---

## 12. Migration & Seeding Notes

1. **Migration runner uses `DATABASE_URL_DIRECT`** (bypasses PgBouncer). DDL must never run through the transaction-mode pooler.
2. `CREATE INDEX CONCURRENTLY` (for `wagon_movements` indexes added after data exists) **cannot run inside Drizzle's transactional migration wrapper** — write those as separate, hand-authored, non-transactional migration steps.
3. **Seed order (verified migrations, not best-effort cron):**
   1. `roads` from the static road table.
   2. `stations` from the RZhD ESR classifier import (full base dictionary — eliminates cold-start).
   3. `station_aliases` for every report place name (`Асбест`, `Голышманово`, `Добрятино`, …) — `source='manual'`, `confidence=1.0`.
   4. One seeded `users` admin row (internal tool; no open signup).
4. **Phase 1 (auth MVP)** creates only §1 (`users/sessions/accounts/verifications`) and the empty domain tables §2–§10 (scaffolded now so later ingestion work triggers no schema rewrite). Ingestion/matching/report logic is later phases.
5. **Phase 1.5 historical import:** parse the existing `Отчет ПВ Приоритет Логистика.xlsx` into `deals` (+ `report_rows`) via `source_type='REPORT_IMPORT'`, giving a non-empty dashboard with no ingestion pipeline.
