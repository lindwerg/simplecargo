CREATE TABLE "tariff_indexations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"pct" numeric(6, 3) NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"applies_to_class" smallint,
	"tariff_ref" text DEFAULT '10-01' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_tariff_idx_class" CHECK ("tariff_indexations"."applies_to_class" IS NULL OR "tariff_indexations"."applies_to_class" IN (1,2,3))
);
--> statement-breakpoint
CREATE TABLE "tariff_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"origin_esr" char(6),
	"dest_esr" char(6),
	"origin_raw" text NOT NULL,
	"dest_raw" text NOT NULL,
	"wagon_type" text,
	"freight_class" smallint,
	"etsng_code" varchar(8),
	"base_amount" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'RUB' NOT NULL,
	"tariff_ref" text DEFAULT '10-01' NOT NULL,
	"vat_inclusive" text DEFAULT 'no' NOT NULL,
	"effective_from" timestamp with time zone,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_tariff_rates_class" CHECK ("tariff_rates"."freight_class" IS NULL OR "tariff_rates"."freight_class" IN (1,2,3)),
	CONSTRAINT "ck_tariff_rates_vat" CHECK ("tariff_rates"."vat_inclusive" IN ('yes','no','unknown'))
);
--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "wagon_type" text;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "target_rate_kind" text;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "target_rate_markup_pct" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "target_tariff_class" smallint;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "target_tariff_ref" text;--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD COLUMN "rate_kind" text DEFAULT 'flat_rub' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD COLUMN "markup_pct" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD COLUMN "tariff_class" smallint;--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD COLUMN "tariff_ref" text;--> statement-breakpoint
ALTER TABLE "tariff_indexations" ADD CONSTRAINT "tariff_indexations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_origin_esr_stations_esr_code_fk" FOREIGN KEY ("origin_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_dest_esr_stations_esr_code_fk" FOREIGN KEY ("dest_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rates" ADD CONSTRAINT "tariff_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tariff_idx_effective" ON "tariff_indexations" USING btree ("effective_from");--> statement-breakpoint
CREATE INDEX "idx_tariff_rates_route" ON "tariff_rates" USING btree ("origin_raw","dest_raw","wagon_type","freight_class");--> statement-breakpoint
CREATE INDEX "idx_tariff_rates_esr" ON "tariff_rates" USING btree ("origin_esr","dest_esr");--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "ck_request_lines_rate_kind" CHECK ("request_lines"."target_rate_kind" IS NULL OR "request_lines"."target_rate_kind" IN ('flat_rub','tariff_indicative','tariff_plus_markup'));--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "ck_request_lines_tariff_class" CHECK ("request_lines"."target_tariff_class" IS NULL OR "request_lines"."target_tariff_class" IN (1,2,3));--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD CONSTRAINT "ck_psc_rate_kind" CHECK ("price_protocol_rates"."rate_kind" IN ('flat_rub','tariff_indicative','tariff_plus_markup'));--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD CONSTRAINT "ck_psc_rate_tariff_class" CHECK ("price_protocol_rates"."tariff_class" IS NULL OR "price_protocol_rates"."tariff_class" IN (1,2,3));