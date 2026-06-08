import { char, index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { counterparties } from "./counterparties";
import { counterpartyDocuments } from "./counterpartyDocuments";
import { stations } from "./geo";
import { users } from "./auth";

// Каталог щебня карьеров. Цель — быстро искать нужный материал из запроса по
// всем карьерам (нашим и не нашим). Берём ВСЁ из паспорта: типовые поля ГОСТ
// 8267 отдельными колонками (для фильтров) + jsonb passportFields под всё
// остальное, что встретится в паспорте. ИИ извлекает поля из загруженного PDF,
// оператор подтверждает. quarryCounterpartyId nullable — «не наши» карьеры
// допустимы (quarryRaw хранит сырое имя).
export const quarryMaterials = pgTable(
  "quarry_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    quarryCounterpartyId: uuid("quarry_counterparty_id").references(() => counterparties.id, {
      onDelete: "set null",
    }),
    quarryRaw: text("quarry_raw"), // имя карьера, если он не заведён в реестр

    materialName: text("material_name").notNull().default("щебень"),
    fraction: text("fraction"), // "5-20", "20-40", "0-5" (отсев)
    gost: text("gost"), // "ГОСТ 8267-93"

    // Типовые характеристики паспорта щебня (как текст — допускают «М1200», «F150»,
    // «1 группа», диапазоны; фильтрация по подстроке/префиксу).
    strengthGrade: text("strength_grade"), // марка по дробимости (прочности), М
    flakiness: text("flakiness"), // лещадность (группа / %)
    frostResistance: text("frost_resistance"), // морозостойкость, F
    radioactivityClass: text("radioactivity_class"), // класс по удельной активности (1/2)
    abrasion: text("abrasion"), // истираемость, И
    bulkDensity: numeric("bulk_density", { precision: 10, scale: 2 }), // насыпная плотность, кг/м³

    // Всё остальное из паспорта (содержание пылевидных частиц, зёрна слабых пород,
    // удельная эффективная активность Бк/кг и т.п.) — без миграции под новое поле.
    passportFields: jsonb("passport_fields"),

    pricePerTon: numeric("price_per_ton", { precision: 14, scale: 2 }),
    currency: char("currency", { length: 3 }).notNull().default("RUB"),
    priceValidFrom: timestamp("price_valid_from", { withTimezone: true }),

    locationEsr: char("location_esr", { length: 6 }).references(() => stations.esrCode),
    locationRaw: text("location_raw"),

    passportDocumentId: uuid("passport_document_id").references(() => counterpartyDocuments.id, {
      onDelete: "set null",
    }),

    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_quarry_materials_quarry").on(t.quarryCounterpartyId),
    index("idx_quarry_materials_fraction").on(t.fraction),
    index("idx_quarry_materials_material").on(t.materialName),
  ],
);
