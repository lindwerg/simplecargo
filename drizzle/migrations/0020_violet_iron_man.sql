ALTER TABLE "ingested_files" ADD COLUMN "html_storage_key" text;--> statement-breakpoint
ALTER TABLE "ingested_files" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "ingested_files" ADD COLUMN "kind_confidence" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "ingested_files" ADD COLUMN "classified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ingested_files" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ingested_files" ADD COLUMN "deal_id" uuid;--> statement-breakpoint
ALTER TABLE "ingested_files" ADD COLUMN "direction_id" uuid;--> statement-breakpoint
ALTER TABLE "ingested_attachments" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "ingested_attachments" ADD COLUMN "is_inline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingested_attachments" ADD COLUMN "content_id" text;--> statement-breakpoint
ALTER TABLE "ingested_files" ADD CONSTRAINT "ingested_files_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingested_files" ADD CONSTRAINT "ingested_files_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_files_kind_received" ON "ingested_files" USING btree ("kind","received_at");--> statement-breakpoint
CREATE INDEX "idx_files_deal" ON "ingested_files" USING btree ("deal_id");