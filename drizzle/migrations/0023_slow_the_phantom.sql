ALTER TABLE "orders" ADD COLUMN "quote_status" text DEFAULT 'quoting' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quoted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gu_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "ck_orders_quote_status" CHECK ("orders"."quote_status" IN ('quoting','quoted','won'));