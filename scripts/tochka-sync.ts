/**
 * Manual one-off: run the Tochka sync against the live bank into the local DB.
 * READ-ONLY against the bank; writes only our own bank_* tables (idempotent).
 *
 * Run:  set -a; source .env; set +a; pnpm tsx scripts/tochka-sync.ts
 */
import { syncTochka } from "@/lib/finances/sync";

async function main(): Promise<void> {
  const months = Number(process.argv[2] ?? "3");
  console.log(`Syncing last ${months} month(s)…`);
  const result = await syncTochka({ months });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Sync failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
