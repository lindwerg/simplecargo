ALTER TABLE "requests" DROP CONSTRAINT "ck_requests_channel";--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "intake_source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "ck_requests_intake_source" CHECK ("requests"."intake_source" IN ('manual','ai_email'));--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "ck_requests_channel" CHECK ("requests"."channel" IN ('upload','voice','paste','manual','email'));