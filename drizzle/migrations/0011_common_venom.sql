CREATE TABLE "payment_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_request_id" text,
	"amount" numeric(14, 2) NOT NULL,
	"payment_date" text NOT NULL,
	"payment_number" integer,
	"purpose" text NOT NULL,
	"counterparty_name" text NOT NULL,
	"counterparty_inn" varchar(12),
	"counterparty_kpp" varchar(9),
	"counterparty_account" text NOT NULL,
	"counterparty_bank_bic" varchar(9) NOT NULL,
	"counterparty_corr_account" text,
	"status" text DEFAULT 'on_sign' NOT NULL,
	"tochka_status" text,
	"last_error" text,
	"counterparty_id" uuid,
	"deal_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_payment_draft_status" CHECK ("payment_drafts"."status" IN ('on_sign','paid','rejected','error'))
);
--> statement-breakpoint
ALTER TABLE "payment_drafts" ADD CONSTRAINT "payment_drafts_account_id_bank_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_drafts" ADD CONSTRAINT "payment_drafts_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_drafts" ADD CONSTRAINT "payment_drafts_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_drafts" ADD CONSTRAINT "payment_drafts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_drafts_account" ON "payment_drafts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_payment_drafts_status" ON "payment_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_drafts_request" ON "payment_drafts" USING btree ("external_request_id");