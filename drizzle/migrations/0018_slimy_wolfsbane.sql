CREATE TABLE "order_stone_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"quarry_supplier_id" uuid,
	"quarry_raw" text,
	"location_esr" char(6),
	"location_raw" text,
	"fraction" text,
	"cargo_name" text DEFAULT 'щебень' NOT NULL,
	"tonnage" numeric(12, 3),
	"tonnage_actual" numeric(12, 3),
	"price_purchase" numeric(14, 2),
	"price_sale" numeric(14, 2),
	"margin_per_ton" numeric(14, 2) GENERATED ALWAYS AS (price_sale - price_purchase) STORED,
	"currency" text DEFAULT 'RUB' NOT NULL,
	"report_month" char(7),
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_stone_lines_status" CHECK ("order_stone_lines"."status" IN ('draft','active','completed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "order_stone_lines" ADD CONSTRAINT "order_stone_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stone_lines" ADD CONSTRAINT "order_stone_lines_quarry_supplier_id_counterparties_id_fk" FOREIGN KEY ("quarry_supplier_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_stone_lines" ADD CONSTRAINT "order_stone_lines_location_esr_stations_esr_code_fk" FOREIGN KEY ("location_esr") REFERENCES "public"."stations"("esr_code") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stone_lines_order" ON "order_stone_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_stone_lines_quarry" ON "order_stone_lines" USING btree ("quarry_supplier_id");--> statement-breakpoint
CREATE INDEX "idx_stone_lines_month" ON "order_stone_lines" USING btree ("report_month");