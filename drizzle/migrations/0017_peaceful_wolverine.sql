ALTER TABLE "orders" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deal_type" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'inbound' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "request_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "report_month" char(7);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_converted_order_id_orders_id_fk" FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_orders_request" ON "orders" USING btree ("request_id") WHERE "orders"."request_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "ck_orders_channel" CHECK ("orders"."channel" IN ('inbound','proactive'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "ck_orders_deal_type" CHECK ("orders"."deal_type" IS NULL OR "orders"."deal_type" IN ('stone_only','wagons_only','stone_with_transport'));