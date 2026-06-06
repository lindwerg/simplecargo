CREATE TABLE "counterparty_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"full_name" text,
	"position" text,
	"phone" text,
	"email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counterparty_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"doc_ref" text,
	"doc_date" timestamp with time zone,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_cp_doc_kind" CHECK ("counterparty_documents"."kind" IN ('contract','request','other'))
);
--> statement-breakpoint
ALTER TABLE "counterparties" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "counterparty_contacts" ADD CONSTRAINT "counterparty_contacts_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty_documents" ADD CONSTRAINT "counterparty_documents_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparty_documents" ADD CONSTRAINT "counterparty_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cp_contact_counterparty" ON "counterparty_contacts" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "idx_cp_contact_email_lower" ON "counterparty_contacts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "idx_cp_doc_counterparty" ON "counterparty_documents" USING btree ("counterparty_id","kind");