CREATE TABLE "inbound_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction" text DEFAULT 'incoming' NOT NULL,
	"counterparty_id" uuid,
	"counterparty_inn" varchar(12),
	"counterparty_name_raw" text,
	"invoice_number" text,
	"invoice_date" timestamp with time zone,
	"due_date" timestamp with time zone,
	"amount_total" numeric(14, 2),
	"vat_amount" numeric(14, 2),
	"currency" varchar(3) DEFAULT 'RUB' NOT NULL,
	"purpose_raw" text,
	"deal_id" uuid,
	"direction_id" uuid,
	"paid_tx_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"source_file_id" uuid,
	"extracted_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_inbound_invoices_direction" CHECK ("inbound_invoices"."direction" IN ('incoming','outgoing')),
	CONSTRAINT "ck_inbound_invoices_status" CHECK ("inbound_invoices"."status" IN ('pending','matched','paid','review'))
);
--> statement-breakpoint
CREATE TABLE "request_owner_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_line_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" text DEFAULT 'polled' NOT NULL,
	"polled_via" text DEFAULT 'email' NOT NULL,
	"polled_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"cost_per_wagon" numeric(14, 2),
	"wagons_offered" integer,
	"source_message_id" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_owner_quotes_status" CHECK ("request_owner_quotes"."status" IN ('polled','responded','declined','accepted','expired')),
	CONSTRAINT "ck_owner_quotes_polled_via" CHECK ("request_owner_quotes"."polled_via" IN ('manual','email','phone','telegram'))
);
--> statement-breakpoint
CREATE TABLE "mail_cursor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder" text NOT NULL,
	"last_seen_uid" bigint DEFAULT 0 NOT NULL,
	"uid_validity" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mail_cursor_folder_unique" UNIQUE("folder")
);
--> statement-breakpoint
CREATE TABLE "known_email_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_lower" text NOT NULL,
	"display_name_last" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_incoming" integer DEFAULT 0 NOT NULL,
	"seen_outgoing" integer DEFAULT 0 NOT NULL,
	"last_subject" text,
	"counterparty_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "known_email_contacts_email_lower_unique" UNIQUE("email_lower")
);
--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "inbound_invoices_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "inbound_invoices_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "inbound_invoices_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "inbound_invoices_paid_tx_id_bank_transactions_id_fk" FOREIGN KEY ("paid_tx_id") REFERENCES "public"."bank_transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "inbound_invoices_source_file_id_ingested_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."ingested_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_owner_quotes" ADD CONSTRAINT "request_owner_quotes_request_line_id_request_lines_id_fk" FOREIGN KEY ("request_line_id") REFERENCES "public"."request_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_owner_quotes" ADD CONSTRAINT "request_owner_quotes_owner_id_counterparties_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."counterparties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "known_email_contacts" ADD CONSTRAINT "known_email_contacts_counterparty_id_counterparties_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inbound_invoices_inn" ON "inbound_invoices" USING btree ("counterparty_inn");--> statement-breakpoint
CREATE INDEX "idx_inbound_invoices_number" ON "inbound_invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "idx_inbound_invoices_status" ON "inbound_invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_owner_quotes_line" ON "request_owner_quotes" USING btree ("request_line_id");--> statement-breakpoint
CREATE INDEX "idx_owner_quotes_owner" ON "request_owner_quotes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_owner_quotes_status" ON "request_owner_quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_mail_cursor_folder" ON "mail_cursor" USING btree ("folder");--> statement-breakpoint
CREATE INDEX "idx_known_email_prefix" ON "known_email_contacts" USING btree (lower("email_lower"));--> statement-breakpoint
CREATE INDEX "idx_known_email_counterparty" ON "known_email_contacts" USING btree ("counterparty_id");--> statement-breakpoint
CREATE INDEX "idx_known_email_last_seen" ON "known_email_contacts" USING btree ("last_seen_at");