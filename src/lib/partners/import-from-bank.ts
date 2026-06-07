import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { counterpartyContacts } from "@/lib/db/schema/counterpartyContacts";

// Фаза 2 «Занести в партнёры»: переносит выбранных контрагентов из банковской
// выгрузки в реестр counterparties. Идемпотентно — апсерт по ИНН (или по
// каноничному имени, если ИНН нет): существующей карточке добавляем роль и
// варианты названия, новой — создаём. Почта (если подтверждена оператором)
// привязывается контактом. Роль задаёт оператор (только client | carrier).

export interface ImportItem {
  inn: string | null;
  name: string;
  nameVariants: string[];
  role: "client" | "carrier";
  email: string | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  contactsAdded: number;
}

function uniq(values: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = v?.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

interface ExistingRow {
  id: string;
  roles: string[] | null;
  inn: string | null;
  variants: string[] | null;
}

async function findByInn(inn: string): Promise<ExistingRow | null> {
  const r = await db
    .select({
      id: counterparties.id,
      roles: counterparties.roles,
      inn: counterparties.inn,
      variants: counterparties.nameRawVariants,
    })
    .from(counterparties)
    .where(eq(counterparties.inn, inn))
    .limit(1);
  return r[0] ?? null;
}

async function findByName(name: string): Promise<ExistingRow | null> {
  const r = await db
    .select({
      id: counterparties.id,
      roles: counterparties.roles,
      inn: counterparties.inn,
      variants: counterparties.nameRawVariants,
    })
    .from(counterparties)
    .where(eq(counterparties.nameCanonical, name))
    .limit(1);
  return r[0] ?? null;
}

async function attachEmail(counterpartyId: string, rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) return false;

  const dup = await db
    .select({ id: counterpartyContacts.id })
    .from(counterpartyContacts)
    .where(
      and(
        eq(counterpartyContacts.counterpartyId, counterpartyId),
        sql`lower(${counterpartyContacts.email}) = ${email}`,
      ),
    )
    .limit(1);
  if (dup[0]) return false;

  const existingCount = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(counterpartyContacts)
    .where(eq(counterpartyContacts.counterpartyId, counterpartyId));
  const isFirst = (existingCount[0]?.n ?? 0) === 0;

  await db.insert(counterpartyContacts).values({
    counterpartyId,
    email,
    isPrimary: isFirst,
  });
  return true;
}

export async function importFromBank(items: readonly ImportItem[]): Promise<ImportResult> {
  let created = 0;
  let updated = 0;
  let contactsAdded = 0;

  for (const item of items) {
    const name = item.name.trim();
    if (name === "") continue;
    const inn = item.inn?.trim() || null;

    let existing = inn ? await findByInn(inn) : null;
    if (!existing) existing = await findByName(name);

    let id: string;
    if (existing) {
      const roles = uniq([...(existing.roles ?? []), item.role]);
      const variants = uniq([...(existing.variants ?? []), name, ...item.nameVariants]);
      await db
        .update(counterparties)
        .set({ roles, nameRawVariants: variants, inn: existing.inn ?? inn })
        .where(eq(counterparties.id, existing.id));
      id = existing.id;
      updated += 1;
    } else {
      try {
        const ins = await db
          .insert(counterparties)
          .values({
            nameCanonical: name,
            roles: [item.role],
            inn,
            nameRawVariants: uniq([name, ...item.nameVariants]),
          })
          .returning({ id: counterparties.id });
        id = ins[0].id;
        created += 1;
      } catch (error: unknown) {
        // Гонка/коллизия каноничного имени — подхватываем существующую и мёржим.
        const byName = await findByName(name);
        if (!byName) throw error;
        const roles = uniq([...(byName.roles ?? []), item.role]);
        await db
          .update(counterparties)
          .set({ roles, inn: byName.inn ?? inn })
          .where(eq(counterparties.id, byName.id));
        id = byName.id;
        updated += 1;
      }
    }

    if (item.email) {
      const added = await attachEmail(id, item.email);
      if (added) contactsAdded += 1;
    }
  }

  return { created, updated, contactsAdded };
}
