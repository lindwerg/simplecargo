ALTER TABLE "inbound_invoices" DROP CONSTRAINT "ck_inbound_invoices_status";--> statement-breakpoint
ALTER TABLE "payment_drafts" ADD COLUMN "redirect_url" text;--> statement-breakpoint
ALTER TABLE "payment_drafts" ADD COLUMN "inbound_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "vat_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "vat_included" boolean;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "service_description" text;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "supplier_kpp" varchar(9);--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "supplier_account" text;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "supplier_bank_bic" varchar(9);--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "supplier_corr_account" text;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "supplier_bank_name" text;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "contract_number" text;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "contract_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD COLUMN "source" text DEFAULT 'mail' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_payment_drafts_invoice" ON "payment_drafts" USING btree ("inbound_invoice_id");--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "ck_inbound_invoices_source" CHECK ("inbound_invoices"."source" IN ('mail','upload'));--> statement-breakpoint
ALTER TABLE "inbound_invoices" ADD CONSTRAINT "ck_inbound_invoices_status" CHECK ("inbound_invoices"."status" IN ('pending','partial','matched','paid','review'));