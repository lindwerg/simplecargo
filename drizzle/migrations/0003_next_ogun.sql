CREATE TABLE "request_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"origin_raw" text NOT NULL,
	"origin_road_raw" text,
	"dest_raw" text NOT NULL,
	"dest_road_raw" text,
	"origin_esr" char(6),
	"dest_esr" char(6),
	"cargo_name" text,
	"etsng_code" varchar(8),
	"wagons_requested" integer NOT NULL,
	"tonnage_per_wagon" numeric(10, 3),
	"target_rate_per_wagon" numeric(14, 2),
	"target_rate_raw" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_number" text,
	"client_suggested_id" uuid,
	"client_raw" text,
	"status" text DEFAULT 'new' NOT NULL,
	"channel" text DEFAULT 'manual' NOT NULL,
	"wagon_type" text DEFAULT 'ПВ' NOT NULL,
	"cargo_name" text,
	"period_from" timestamp with time zone,
	"period_to" timestamp with time zone,
	"received_at" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"source_ref" text,
	"notes" text,
	"assigned_to" uuid,
	"converted_order_id" uuid,
	"cloned_from_request_id" uuid,
	"loss_reason" text,
	"competitor_price" numeric(14, 2),
	"lost_to" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_requests_status" CHECK ("requests"."status" IN ('new','sourcing','quoted','won','lost','no_bid','expired','cancelled')),
	CONSTRAINT "ck_requests_channel" CHECK ("requests"."channel" IN ('upload','voice','paste','manual')),
	CONSTRAINT "ck_requests_loss_reason" CHECK ("requests"."loss_reason" IS NULL OR "requests"."loss_reason" IN ('price','no_capacity','client_cancelled','timing','competitor','other'))
);
--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_origin_esr_stations_esr_code_fk" FOREIGN KEY ("origin_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "request_lines_dest_esr_stations_esr_code_fk" FOREIGN KEY ("dest_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_client_suggested_id_counterparties_id_fk" FOREIGN KEY ("client_suggested_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_request_lines_request" ON "request_lines" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_request_lines_origin_road" ON "request_lines" USING btree ("origin_road_raw");--> statement-breakpoint
CREATE INDEX "idx_request_lines_origin_station" ON "request_lines" USING btree ("origin_raw");--> statement-breakpoint
CREATE INDEX "idx_request_lines_stations_esr" ON "request_lines" USING btree ("origin_esr","dest_esr");--> statement-breakpoint
CREATE INDEX "idx_requests_status" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_requests_client" ON "requests" USING btree ("client_suggested_id");--> statement-breakpoint
CREATE INDEX "idx_requests_open" ON "requests" USING btree ("status","created_at");