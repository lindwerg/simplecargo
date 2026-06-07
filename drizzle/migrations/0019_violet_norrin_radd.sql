CREATE TABLE "direction_monthly_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction_id" uuid NOT NULL,
	"effective_month" char(7) NOT NULL,
	"rate_client" numeric(14, 2),
	"rate_owner" numeric(14, 2),
	"rate_client_suggested" numeric(14, 2),
	"rate_owner_suggested" numeric(14, 2),
	"currency" char(3) DEFAULT 'RUB' NOT NULL,
	"rate_basis" text,
	"status" text DEFAULT 'proposed' NOT NULL,
	"agreed_at" timestamp with time zone,
	"agreed_by" uuid,
	"source_protocol_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_dir_monthly_rates_status" CHECK ("direction_monthly_rates"."status" IN ('proposed','agreed'))
);
--> statement-breakpoint
ALTER TABLE "direction_monthly_rates" ADD CONSTRAINT "direction_monthly_rates_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_monthly_rates" ADD CONSTRAINT "direction_monthly_rates_agreed_by_users_id_fk" FOREIGN KEY ("agreed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_monthly_rates" ADD CONSTRAINT "direction_monthly_rates_source_protocol_id_price_protocols_id_fk" FOREIGN KEY ("source_protocol_id") REFERENCES "public"."price_protocols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_monthly_rates" ADD CONSTRAINT "direction_monthly_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dir_monthly_rates_direction_status" ON "direction_monthly_rates" USING btree ("direction_id","status");--> statement-breakpoint
-- Manually added: drizzle-kit does not emit this composite unique. One rate version per
-- (direction, effective_month) — upsert target for the monthly-rate repository.
ALTER TABLE "direction_monthly_rates" ADD CONSTRAINT "uq_dir_monthly_rates_dir_month" UNIQUE ("direction_id","effective_month");