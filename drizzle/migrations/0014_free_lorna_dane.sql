CREATE TABLE "ingested_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file_id" uuid NOT NULL,
	"kind" text DEFAULT 'attachment' NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ingested_attachments_kind" CHECK ("ingested_attachments"."kind" IN ('attachment','body'))
);
--> statement-breakpoint
ALTER TABLE "ingested_attachments" ADD CONSTRAINT "ingested_attachments_source_file_id_ingested_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."ingested_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ingested_attachments_file" ON "ingested_attachments" USING btree ("source_file_id");