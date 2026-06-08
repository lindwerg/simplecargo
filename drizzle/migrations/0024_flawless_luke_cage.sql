CREATE TABLE "quarry_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quarry_counterparty_id" uuid,
	"quarry_raw" text,
	"material_name" text DEFAULT 'щебень' NOT NULL,
	"fraction" text,
	"gost" text,
	"strength_grade" text,
	"flakiness" text,
	"frost_resistance" text,
	"radioactivity_class" text,
	"abrasion" text,
	"bulk_density" numeric(10, 2),
	"passport_fields" jsonb,
	"price_per_ton" numeric(14, 2),
	"currency" char(3) DEFAULT 'RUB' NOT NULL,
	"price_valid_from" timestamp with time zone,
	"location_esr" char(6),
	"location_raw" text,
	"passport_document_id" uuid,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quarry_materials" ADD CONSTRAINT "quarry_materials_quarry_counterparty_id_counterparties_id_fk" FOREIGN KEY ("quarry_counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarry_materials" ADD CONSTRAINT "quarry_materials_location_esr_stations_esr_code_fk" FOREIGN KEY ("location_esr") REFERENCES "public"."stations"("esr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarry_materials" ADD CONSTRAINT "quarry_materials_passport_document_id_counterparty_documents_id_fk" FOREIGN KEY ("passport_document_id") REFERENCES "public"."counterparty_documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quarry_materials" ADD CONSTRAINT "quarry_materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_quarry_materials_quarry" ON "quarry_materials" USING btree ("quarry_counterparty_id");--> statement-breakpoint
CREATE INDEX "idx_quarry_materials_fraction" ON "quarry_materials" USING btree ("fraction");--> statement-breakpoint
CREATE INDEX "idx_quarry_materials_material" ON "quarry_materials" USING btree ("material_name");