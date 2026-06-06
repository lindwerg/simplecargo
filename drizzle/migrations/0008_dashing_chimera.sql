CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_account_id" text NOT NULL,
	"customer_code" text,
	"currency" varchar(3) DEFAULT 'RUB' NOT NULL,
	"masked_number" text,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_external_account_id_unique" UNIQUE("external_account_id"),
	CONSTRAINT "ck_bank_account_status" CHECK ("bank_accounts"."status" IN ('active','closed'))
);
--> statement-breakpoint
CREATE TABLE "bank_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_tx_id" text NOT NULL,
	"payment_id" text,
	"direction" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"amount_nat" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'RUB' NOT NULL,
	"posted_at" timestamp with time zone NOT NULL,
	"purpose_raw" text,
	"counterparty_inn" varchar(12),
	"counterparty_kpp" varchar(9),
	"counterparty_name" text,
	"counterparty_account" text,
	"counterparty_bank_bic" varchar(9),
	"status" text DEFAULT 'booked' NOT NULL,
	"source" text DEFAULT 'statement' NOT NULL,
	"raw" jsonb,
	"dedup_hash" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_bank_tx_account_extid" UNIQUE("account_id","external_tx_id"),
	CONSTRAINT "ck_bank_tx_direction" CHECK ("bank_transactions"."direction" IN ('in','out')),
	CONSTRAINT "ck_bank_tx_status" CHECK ("bank_transactions"."status" IN ('booked','pending')),
	CONSTRAINT "ck_bank_tx_source" CHECK ("bank_transactions"."source" IN ('statement','webhook'))
);
--> statement-breakpoint
CREATE TABLE "bank_tx_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"counterparty_id" uuid,
	"deal_id" uuid,
	"direction_id" uuid,
	"amount_allocated" numeric(14, 2),
	"match_confidence" numeric(4, 3),
	"match_method" text NOT NULL,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_bank_tx_link_method" CHECK ("bank_tx_links"."match_method" IN ('inn_amount_invoice','inn_fuzzy','name_fuzzy','subset_sum','manual'))
);
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_tx_links" ADD CONSTRAINT "bank_tx_links_transaction_id_bank_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."bank_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_tx_links" ADD CONSTRAINT "bank_tx_links_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_tx_links" ADD CONSTRAINT "bank_tx_links_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_tx_links" ADD CONSTRAINT "bank_tx_links_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_tx_links" ADD CONSTRAINT "bank_tx_links_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bank_tx_account_posted" ON "bank_transactions" USING btree ("account_id","posted_at");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_inn" ON "bank_transactions" USING btree ("counterparty_inn");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_direction" ON "bank_transactions" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_payment" ON "bank_transactions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_link_tx" ON "bank_tx_links" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_link_counterparty" ON "bank_tx_links" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_link_deal" ON "bank_tx_links" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_bank_tx_link_direction" ON "bank_tx_links" USING btree ("direction_id");