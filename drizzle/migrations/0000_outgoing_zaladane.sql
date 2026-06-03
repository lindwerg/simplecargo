CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"name" text,
	"image" text,
	"role" text DEFAULT 'operator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "ck_users_role" CHECK ("users"."role" IN ('admin','operator','viewer'))
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roads" (
	"rzd_code" integer PRIMARY KEY NOT NULL,
	"short_code" text NOT NULL,
	"full_name_ru" text NOT NULL,
	"full_name_translit" text
);
--> statement-breakpoint
CREATE TABLE "station_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"esr_code" char(6) NOT NULL,
	"alias" text NOT NULL,
	"alias_normalized" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"confidence" numeric(4, 3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_aliases_alias_normalized_unique" UNIQUE("alias_normalized"),
	CONSTRAINT "ck_alias_source" CHECK ("station_aliases"."source" IN ('report','manual','fuzzy_confirmed'))
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"esr_code" char(6) PRIMARY KEY NOT NULL,
	"name_etran" text NOT NULL,
	"name_normalized" text NOT NULL,
	"road_code" integer,
	"region" text,
	"lat" numeric(9, 6),
	"lon" numeric(9, 6),
	"is_quarantined" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_canonical" text NOT NULL,
	"name_raw_variants" text[],
	"roles" text[] DEFAULT '{}' NOT NULL,
	"inn" varchar(12),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counterparties_name_canonical_unique" UNIQUE("name_canonical")
);
--> statement-breakpoint
CREATE TABLE "wagons" (
	"wagon_number" char(8) PRIMARY KEY NOT NULL,
	"wagon_type" varchar(20),
	"wagon_subtype_raw" text,
	"model" varchar(20),
	"volume_m3" numeric(8, 2),
	"capacity_tonnes" numeric(8, 2),
	"owner_administration" text,
	"build_date" date,
	"next_planned_repair_date" date,
	"current_mileage_km" integer,
	"checksum_valid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_wagons_checksum" CHECK ("wagons"."checksum_valid" IN ('ok','fail','unknown'))
);
--> statement-breakpoint
CREATE TABLE "ingested_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_sha256" char(64) NOT NULL,
	"filename" text NOT NULL,
	"source_type" char(1) NOT NULL,
	"sender_email" text,
	"gmail_message_id" text,
	"storage_key" text,
	"header_row" integer,
	"column_shift" integer DEFAULT 0,
	"row_count" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"quarantined" boolean DEFAULT false NOT NULL,
	"error_detail" jsonb,
	"agent_run_id" text,
	"received_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingested_files_content_sha256_unique" UNIQUE("content_sha256"),
	CONSTRAINT "ck_files_status" CHECK ("ingested_files"."status" IN ('pending','processing','normalized','quarantined','committed'))
);
--> statement-breakpoint
CREATE TABLE "wagon_movements" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fingerprint" char(64) NOT NULL,
	"event_key" char(64) NOT NULL,
	"source_file_id" uuid,
	"source_type" char(1) NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"superseded_by" bigint,
	"needs_review" boolean DEFAULT false NOT NULL,
	"wagon_number" char(8) NOT NULL,
	"waybill_number" text,
	"shipment_id" text,
	"operation_code" varchar(16),
	"operation_name" text,
	"operation_ts" timestamp with time zone,
	"load_state" text,
	"trip_start_ts" timestamp with time zone,
	"depart_ts" timestamp with time zone,
	"arrive_ts" timestamp with time zone,
	"est_arrival_ts" timestamp with time zone,
	"delivery_deadline_ts" timestamp with time zone,
	"station_depart_esr" char(6),
	"station_depart_raw" text,
	"road_depart_raw" text,
	"station_current_esr" char(6),
	"station_current_raw" text,
	"road_current_raw" text,
	"station_dest_esr" char(6),
	"station_dest_raw" text,
	"road_dest_raw" text,
	"cargo_name" text,
	"cargo_code_etsng" varchar(16),
	"cargo_weight_kg" numeric(12, 2),
	"shipper_raw" text,
	"consignee_raw" text,
	"idle_days_station" numeric(6, 2),
	"idle_days_operation" numeric(6, 2),
	"days_no_operation" integer,
	"days_no_movement" integer,
	"dist_remaining_km" integer,
	"dist_traveled_km" integer,
	"dist_total_km" integer,
	"train_index" text,
	"park_type_raw" text,
	"raw_json" jsonb,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_wm_load_state" CHECK ("wagon_movements"."load_state" IN ('ГРУЖ','ПОР','UNKNOWN'))
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wagon_number" char(8) NOT NULL,
	"waybill_number" text,
	"report_month" char(7) NOT NULL,
	"client_id" uuid,
	"owner_id" uuid,
	"carrier_raw" text,
	"company_raw" text DEFAULT 'Приоритет Логистика',
	"station_origin_esr" char(6),
	"station_dest_esr" char(6),
	"cargo_name" text,
	"wagon_type" varchar(20) DEFAULT 'ПВ',
	"revenue_ua" numeric(14, 2),
	"cost_owner" numeric(14, 2),
	"margin" numeric(14, 2) GENERATED ALWAYS AS (revenue_ua - cost_owner) STORED,
	"revenue_source" text,
	"cost_source" text,
	"date_trip_end_ts" timestamp with time zone,
	"date_arrived_loading_ts" timestamp with time zone,
	"date_dispatched_ts" timestamp with time zone,
	"turnover_days" integer,
	"turnover_provisional" boolean DEFAULT false NOT NULL,
	"invoice_number" text,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"source_movement_ids" bigint[],
	"conflict_flags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_deals_status" CHECK ("deals"."status" IN ('OPEN','ACTIVE','COMPLETE','CONFLICT','ABANDONED')),
	CONSTRAINT "ck_deals_revenue_source" CHECK ("deals"."revenue_source" IN ('manual','contract')),
	CONSTRAINT "ck_deals_cost_source" CHECK ("deals"."cost_source" IN ('manual','contract'))
);
--> statement-breakpoint
CREATE TABLE "contract_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"counterparty_type" text NOT NULL,
	"wagon_type" text,
	"route_origin_esr" char(6),
	"route_dest_esr" char(6),
	"rate_rub" numeric(14, 2) NOT NULL,
	"rate_basis" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_contract_cp_type" CHECK ("contract_prices"."counterparty_type" IN ('CLIENT','OWNER')),
	CONSTRAINT "ck_contract_rate_basis" CHECK ("contract_prices"."rate_basis" IN ('PER_TRIP','PER_TON','PER_DAY'))
);
--> statement-breakpoint
CREATE TABLE "report_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"deal_id" uuid NOT NULL,
	"report_month" char(7) NOT NULL,
	"client" text,
	"origin" text,
	"destination" text,
	"revenue_ua" numeric(14, 2),
	"date_trip_end" date,
	"date_arrived_loading" date,
	"turnover_days" integer,
	"cost_owner" numeric(14, 2),
	"margin" numeric(14, 2),
	"date_dispatched" date,
	"wagon_type" text,
	"wagon_number" char(8),
	"waybill_number" text,
	"cargo_name" text,
	"invoice_number" text,
	"carrier" text,
	"company" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarantine_rows" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_file_id" uuid,
	"row_index" integer,
	"tier" text NOT NULL,
	"severity" text NOT NULL,
	"rule_id" text NOT NULL,
	"reason_code" text NOT NULL,
	"field_name" text,
	"raw_value" text,
	"raw_row_json" jsonb,
	"agent_reason" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_esr" text,
	"review_action" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_quarantine_tier" CHECK ("quarantine_rows"."tier" IN ('fatal','recoverable','row_warning')),
	CONSTRAINT "ck_quarantine_severity" CHECK ("quarantine_rows"."severity" IN ('CRITICAL','ERROR','WARNING','INFO')),
	CONSTRAINT "ck_quarantine_review_action" CHECK ("quarantine_rows"."review_action" IN ('approved','rejected','reprocessed'))
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_aliases" ADD CONSTRAINT "station_aliases_esr_code_stations_esr_code_fk" FOREIGN KEY ("esr_code") REFERENCES "public"."stations"("esr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_road_code_roads_rzd_code_fk" FOREIGN KEY ("road_code") REFERENCES "public"."roads"("rzd_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagon_movements" ADD CONSTRAINT "wagon_movements_source_file_id_ingested_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."ingested_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagon_movements" ADD CONSTRAINT "wagon_movements_superseded_by_wagon_movements_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."wagon_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagon_movements" ADD CONSTRAINT "wagon_movements_wagon_number_wagons_wagon_number_fk" FOREIGN KEY ("wagon_number") REFERENCES "public"."wagons"("wagon_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_wagon_number_wagons_wagon_number_fk" FOREIGN KEY ("wagon_number") REFERENCES "public"."wagons"("wagon_number") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_client_id_counterparties_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_counterparties_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_prices" ADD CONSTRAINT "contract_prices_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_rows" ADD CONSTRAINT "report_rows_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarantine_rows" ADD CONSTRAINT "quarantine_rows_source_file_id_ingested_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."ingested_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_accounts_user" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_sessions_expires" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_roads_short" ON "roads" USING btree ("short_code");--> statement-breakpoint
CREATE INDEX "idx_alias_esr" ON "station_aliases" USING btree ("esr_code");--> statement-breakpoint
CREATE INDEX "idx_stations_name_norm" ON "stations" USING btree ("name_normalized");--> statement-breakpoint
CREATE INDEX "idx_stations_road" ON "stations" USING btree ("road_code");--> statement-breakpoint
CREATE INDEX "idx_counterparty_inn" ON "counterparties" USING btree ("inn");--> statement-breakpoint
CREATE INDEX "idx_files_status" ON "ingested_files" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_files_source" ON "ingested_files" USING btree ("source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_wm_fingerprint" ON "wagon_movements" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "idx_wm_wagon" ON "wagon_movements" USING btree ("wagon_number");--> statement-breakpoint
CREATE INDEX "idx_wm_waybill" ON "wagon_movements" USING btree ("waybill_number");--> statement-breakpoint
CREATE INDEX "idx_wm_event" ON "wagon_movements" USING btree ("event_key");--> statement-breakpoint
CREATE INDEX "idx_wm_wagon_ts" ON "wagon_movements" USING btree ("wagon_number","operation_ts");--> statement-breakpoint
CREATE INDEX "idx_wm_load_event" ON "wagon_movements" USING btree ("wagon_number","operation_ts") WHERE "wagon_movements"."load_state" = 'ГРУЖ';--> statement-breakpoint
CREATE INDEX "idx_wm_match" ON "wagon_movements" USING btree ("wagon_number","waybill_number","operation_ts");--> statement-breakpoint
CREATE INDEX "idx_wm_review" ON "wagon_movements" USING btree ("needs_review") WHERE "wagon_movements"."needs_review" = TRUE;--> statement-breakpoint
CREATE INDEX "idx_deals_wagon" ON "deals" USING btree ("wagon_number");--> statement-breakpoint
CREATE INDEX "idx_deals_waybill" ON "deals" USING btree ("waybill_number");--> statement-breakpoint
CREATE INDEX "idx_deals_month" ON "deals" USING btree ("report_month");--> statement-breakpoint
CREATE INDEX "idx_deals_status" ON "deals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_deals_client" ON "deals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_deals_month_end" ON "deals" USING btree ("report_month","date_trip_end_ts");--> statement-breakpoint
CREATE INDEX "idx_deals_match" ON "deals" USING btree ("wagon_number","date_dispatched_ts");--> statement-breakpoint
CREATE INDEX "idx_deals_pending" ON "deals" USING btree ("report_month") WHERE "deals"."status" = 'COMPLETE' AND ("deals"."revenue_ua" IS NULL OR "deals"."cost_owner" IS NULL);--> statement-breakpoint
CREATE INDEX "idx_contract_lookup" ON "contract_prices" USING btree ("counterparty_type","wagon_type","route_origin_esr","route_dest_esr","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "idx_contract_cp" ON "contract_prices" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "idx_report_month_gen" ON "report_rows" USING btree ("report_month","generation_id","date_trip_end");--> statement-breakpoint
CREATE INDEX "idx_report_deal" ON "report_rows" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "idx_report_gen" ON "report_rows" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "idx_quarantine_unresolved" ON "quarantine_rows" USING btree ("resolved") WHERE "quarantine_rows"."resolved" = FALSE;--> statement-breakpoint
CREATE INDEX "idx_quarantine_file" ON "quarantine_rows" USING btree ("source_file_id");--> statement-breakpoint
CREATE INDEX "idx_quarantine_reason" ON "quarantine_rows" USING btree ("reason_code");