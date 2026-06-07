/**
 * Manual one-off: выгрузить сводный список контрагентов из банка + почты в файлы
 * (CSV для Excel + JSON для машинной сверки). READ-ONLY — ничего не пишет в БД.
 *
 * Запуск (в т.ч. против прод-БД):
 *   set -a; source .env; set +a; pnpm export:counterparties
 *   DATABASE_URL='<prod>' pnpm export:counterparties [outDir]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildCounterpartyRegistry, buildRegistryCsv } from "@/lib/partners/registry-build";

async function main(): Promise<void> {
  const outDir = resolve(process.argv[2] ?? ".");
  console.log("Собираю контрагентов из bank_transactions + реестра + почты…");
  const rows = await buildCounterpartyRegistry();

  const csvPath = resolve(outDir, "counterparties-export.csv");
  const jsonPath = resolve(outDir, "counterparties-export.json");
  writeFileSync(csvPath, buildRegistryCsv(rows), "utf8");
  writeFileSync(jsonPath, JSON.stringify(rows, null, 2), "utf8");

  const byRole = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.suggestedRole] = (acc[r.suggestedRole] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`Готово: ${rows.length} контрагентов`);
  console.log(`  по подсказке роли: ${JSON.stringify(byRole)}`);
  console.log(`  в реестре уже: ${rows.filter((r) => r.inRegistry).length}`);
  console.log(`  с почтой из карточки: ${rows.filter((r) => r.matchedEmails.length > 0).length}`);
  console.log(`  с почтой-кандидатом (нечётко): ${rows.filter((r) => r.candidateEmails.length > 0).length}`);
  console.log(`Файлы:\n  ${csvPath}\n  ${jsonPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Выгрузка не удалась:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
