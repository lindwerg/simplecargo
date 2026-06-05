CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"client_suggested_id" uuid,
	"notes" text,
	"created_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_orders_status" CHECK ("orders"."status" IN ('draft','confirmed','active','completed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "directions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"display_name" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"station_origin_esr" char(6),
	"station_dest_esr" char(6),
	"station_origin_raw" text,
	"station_dest_raw" text,
	"cargo_name" text,
	"wagon_count_planned" integer,
	"tonnage_per_wagon" numeric(10, 3),
	"rate_client" numeric(14, 2),
	"rate_owner" numeric(14, 2),
	"rate_client_suggested" numeric(14, 2),
	"rate_owner_suggested" numeric(14, 2),
	"currency" char(3) DEFAULT 'RUB' NOT NULL,
	"rate_basis" text,
	"rate_model" text DEFAULT 'per_wagon_trip' NOT NULL,
	"payment_terms_raw" text,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"seeded_from_extracted_price_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_directions_status" CHECK ("directions"."status" IN ('draft','open','active','paused','completed','cancelled')),
	CONSTRAINT "ck_directions_rate_model" CHECK ("directions"."rate_model" IN ('per_wagon_trip','lump_sum'))
);
--> statement-breakpoint
CREATE TABLE "counterparty_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_ref" text NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"signed_on" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_protocol_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_id" uuid NOT NULL,
	"origin_esr" char(6),
	"dest_esr" char(6),
	"origin_raw" text NOT NULL,
	"dest_raw" text NOT NULL,
	"wagon_type" text NOT NULL,
	"rate" numeric(14, 2) NOT NULL,
	"currency" char(3) DEFAULT 'RUB' NOT NULL,
	"rate_basis" text DEFAULT 'per_wagon' NOT NULL,
	"vat_inclusive" text DEFAULT 'yes' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocol_number" text,
	"contract_id" uuid,
	"counterparty_id" uuid NOT NULL,
	"side" text NOT NULL,
	"protocol_date" timestamp with time zone,
	"vat_inclusive" text DEFAULT 'yes' NOT NULL,
	"vat_rate" numeric(5, 2) DEFAULT 22.00,
	"valid_from" timestamp with time zone,
	"superseded_by" uuid,
	"source_document_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_psc_side" CHECK ("price_protocols"."side" IN ('owner_cost','client_revenue')),
	CONSTRAINT "ck_psc_status" CHECK ("price_protocols"."status" IN ('active','superseded'))
);
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "direction_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "direction_match_method" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_suggested_id_counterparties_id_fk" FOREIGN KEY ("client_suggested_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_station_origin_esr_stations_esr_code_fk" FOREIGN KEY ("station_origin_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_station_dest_esr_stations_esr_code_fk" FOREIGN KEY ("station_dest_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty_contracts" ADD CONSTRAINT "counterparty_contracts_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD CONSTRAINT "price_protocol_rates_protocol_id_price_protocols_id_fk" FOREIGN KEY ("protocol_id") REFERENCES "public"."price_protocols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD CONSTRAINT "price_protocol_rates_origin_esr_stations_esr_code_fk" FOREIGN KEY ("origin_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_protocol_rates" ADD CONSTRAINT "price_protocol_rates_dest_esr_stations_esr_code_fk" FOREIGN KEY ("dest_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_protocols" ADD CONSTRAINT "price_protocols_contract_id_counterparty_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."counterparty_contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_protocols" ADD CONSTRAINT "price_protocols_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_protocols" ADD CONSTRAINT "price_protocols_superseded_by_price_protocols_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."price_protocols"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_directions_order" ON "directions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_directions_status" ON "directions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_directions_route" ON "directions" USING btree ("station_origin_esr","station_dest_esr");--> statement-breakpoint
CREATE INDEX "idx_contracts_ref" ON "counterparty_contracts" USING btree ("contract_ref");--> statement-breakpoint
CREATE INDEX "idx_psc_rate_route" ON "price_protocol_rates" USING btree ("protocol_id","origin_raw","dest_raw","wagon_type");--> statement-breakpoint
CREATE INDEX "idx_psc_counterparty" ON "price_protocols" USING btree ("counterparty_id","side");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deals_direction" ON "deals" USING btree ("direction_id");--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "ck_deals_direction_match_method" CHECK ("deals"."direction_match_method" IS NULL OR "deals"."direction_match_method" IN ('email_scope','manual','historical_import'));