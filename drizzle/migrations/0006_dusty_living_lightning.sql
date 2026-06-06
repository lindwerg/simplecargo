ALTER TABLE "request_lines" ADD COLUMN "status" text DEFAULT 'new' NOT NULL;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "loss_reason" text;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "won_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "request_lines" ADD COLUMN "kp_issued_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_request_lines_status" ON "request_lines" USING btree ("request_id","status");--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "ck_request_lines_status" CHECK ("request_lines"."status" IN ('new','sourcing','quoted','won','lost','no_bid','expired','cancelled'));--> statement-breakpoint
ALTER TABLE "request_lines" ADD CONSTRAINT "ck_request_lines_loss_reason" CHECK ("request_lines"."loss_reason" IS NULL OR "request_lines"."loss_reason" IN ('price','no_capacity','client_cancelled','timing','competitor','other'));--> statement-breakpoint
-- Backfill: each existing direction inherits its parent request's lifecycle so the
-- derived request rollup reproduces the current board exactly (no archived request
-- resurfaces as active, no active one drops out). Terminal timestamps + loss reason
-- copied for per-leg coherence. Idempotent: safe to re-run.
UPDATE "request_lines" AS rl SET
	"status" = r."status",
	"loss_reason" = r."loss_reason",
	"won_at" = r."won_at",
	"lost_at" = r."lost_at",
	"expired_at" = r."expired_at",
	"cancelled_at" = r."cancelled_at",
	"closed_at" = r."closed_at"
FROM "requests" AS r
WHERE rl."request_id" = r."id";