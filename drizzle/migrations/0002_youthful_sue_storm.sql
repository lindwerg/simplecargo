CREATE TABLE "direction_client_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"forward_to_email" text NOT NULL,
	"forward_cc_emails" text[],
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_dir_client_bind_status" CHECK ("direction_client_bindings"."status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE TABLE "direction_owner_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"direction_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"inbound_mailbox" text NOT NULL,
	"expected_wagon_ids" text[],
	"wagon_count_allocated" integer,
	"owner_rate_override" numeric(14, 2),
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_dir_owner_bind_status" CHECK ("direction_owner_bindings"."status" IN ('active','inactive'))
);
--> statement-breakpoint
ALTER TABLE "directions" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "directions" ADD COLUMN "status_changed_by" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "directions" ADD COLUMN "client_counterparty_id" uuid;--> statement-breakpoint
ALTER TABLE "directions" ADD COLUMN "owner_counterparty_id" uuid;--> statement-breakpoint
ALTER TABLE "direction_client_bindings" ADD CONSTRAINT "direction_client_bindings_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_client_bindings" ADD CONSTRAINT "direction_client_bindings_client_id_counterparties_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."counterparties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_owner_bindings" ADD CONSTRAINT "direction_owner_bindings_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_owner_bindings" ADD CONSTRAINT "direction_owner_bindings_owner_id_counterparties_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."counterparties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dir_client_bind_direction" ON "direction_client_bindings" USING btree ("direction_id");--> statement-breakpoint
CREATE INDEX "idx_dir_client_bind_forward" ON "direction_client_bindings" USING btree ("forward_to_email");--> statement-breakpoint
CREATE INDEX "idx_dir_owner_bind_direction" ON "direction_owner_bindings" USING btree ("direction_id");--> statement-breakpoint
CREATE INDEX "idx_dir_owner_bind_mailbox" ON "direction_owner_bindings" USING btree ("inbound_mailbox");--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_status_changed_by_users_id_fk" FOREIGN KEY ("status_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_client_counterparty_id_counterparties_id_fk" FOREIGN KEY ("client_counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directions" ADD CONSTRAINT "directions_owner_counterparty_id_counterparties_id_fk" FOREIGN KEY ("owner_counterparty_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_directions_client" ON "directions" USING btree ("client_counterparty_id");--> statement-breakpoint
-- One active mailbox → one active owner binding (M1). Per-wagon fan-out for shared
-- mailboxes is post-MVP (PRODUCT_DIRECTIONS §3.2); the app layer also blocks activation
-- when a mailbox is already live on another open/active direction.
CREATE UNIQUE INDEX "uq_owner_mailbox_live" ON "direction_owner_bindings" ("inbound_mailbox") WHERE "status" = 'active';