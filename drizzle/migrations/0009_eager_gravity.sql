ALTER TABLE "bank_accounts" ADD COLUMN "balance" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "balance_at" timestamp with time zone;