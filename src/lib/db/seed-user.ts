import { auth } from "@/lib/auth";
import { pool } from "@/lib/db/client";

// Seeds the first operator (internal tool — public signup is disabled). Reads
// SEED_USER_EMAIL / SEED_USER_PASSWORD straight from process.env (NOT the global
// env contract, so the running app never requires seed credentials). Idempotent:
// re-running with an existing email is a no-op. Run once manually after deploy:
//   SEED_USER_EMAIL=… SEED_USER_PASSWORD=… pnpm db:seed:user

const MIN_PASSWORD_LENGTH = 10;

function readSeedCredentials(): { email: string; password: string; name: string } {
  const email = process.env.SEED_USER_EMAIL?.trim();
  const password = process.env.SEED_USER_PASSWORD;

  const errors: string[] = [];
  if (!email) errors.push("SEED_USER_EMAIL is required");
  if (!password) errors.push("SEED_USER_PASSWORD is required");
  else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`SEED_USER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} chars`);
  }
  if (errors.length > 0 || !email || !password) {
    console.error("❌ Cannot seed user:");
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }

  return { email, password, name: process.env.SEED_USER_NAME?.trim() || email };
}

async function main(): Promise<void> {
  const { email, password, name } = readSeedCredentials();
  const ctx = await auth.$context;

  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (existing) {
    console.log(`✓ User ${email} already exists (id ${existing.user.id}) — skipping.`);
    return;
  }

  // Mirror what sign-up/email does internally, bypassing disableSignUp:
  // hash the password, create the user (first operator = admin), then link a
  // credential account holding the Argon2id hash.
  const passwordHash = await ctx.password.hash(password);
  const user = await ctx.internalAdapter.createUser({ email, name, role: "admin" });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: passwordHash,
  });

  console.log(`✓ Seeded admin user ${email} (id ${user.id}).`);
}

main()
  .catch((error: unknown) => {
    console.error("❌ Seed failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => {
    void pool.end();
  });
