CREATE TABLE "hub_fixed_distance" (
	"hub_name" text NOT NULL,
	"from_line" text NOT NULL,
	"to_line" text NOT NULL,
	"km" integer NOT NULL,
	CONSTRAINT "hub_fixed_distance_hub_name_from_line_to_line_pk" PRIMARY KEY("hub_name","from_line","to_line"),
	CONSTRAINT "ck_hub_fixed_distance_km" CHECK ("hub_fixed_distance"."km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "special_distance" (
	"a_esr" char(6) NOT NULL,
	"b_esr" char(6) NOT NULL,
	"km" integer NOT NULL,
	CONSTRAINT "special_distance_a_esr_b_esr_pk" PRIMARY KEY("a_esr","b_esr"),
	CONSTRAINT "ck_special_distance_km" CHECK ("special_distance"."km" >= 0),
	CONSTRAINT "ck_special_distance_order" CHECK ("special_distance"."a_esr" < "special_distance"."b_esr")
);
--> statement-breakpoint
CREATE TABLE "tariff_edges" (
	"from_esr" char(6) NOT NULL,
	"to_esr" char(6) NOT NULL,
	"km" integer NOT NULL,
	"layer" text NOT NULL,
	CONSTRAINT "tariff_edges_from_esr_to_esr_layer_pk" PRIMARY KEY("from_esr","to_esr","layer"),
	CONSTRAINT "ck_tariff_edges_km" CHECK ("tariff_edges"."km" >= 0),
	CONSTRAINT "ck_tariff_edges_layer" CHECK ("tariff_edges"."layer" IN ('spur','backbone'))
);
--> statement-breakpoint
CREATE TABLE "tp_node" (
	"esr_code" char(6) PRIMARY KEY NOT NULL,
	"name" text,
	"road_code" text,
	"is_border" boolean DEFAULT false NOT NULL,
	"country" text
);
--> statement-breakpoint
CREATE TABLE "etsng" (
	"code" varchar(6) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tariff_class" integer NOT NULL,
	"mvn_raw" text,
	"mvn_by_wagon" jsonb,
	"group_code" varchar(2),
	"source_url" text,
	"fetched_at" timestamp with time zone,
	CONSTRAINT "ck_etsng_class" CHECK ("etsng"."tariff_class" IN (1,2,3))
);
--> statement-breakpoint
CREATE TABLE "class_coeff" (
	"freight_class" smallint NOT NULL,
	"dist_from_km" integer NOT NULL,
	"dist_to_km" integer NOT NULL,
	"k1" numeric(6, 4) NOT NULL,
	"etsng_group" text DEFAULT '' NOT NULL,
	CONSTRAINT "class_coeff_freight_class_dist_from_km_etsng_group_pk" PRIMARY KEY("freight_class","dist_from_km","etsng_group"),
	CONSTRAINT "ck_class_coeff_class" CHECK ("class_coeff"."freight_class" IN (1,2,3)),
	CONSTRAINT "ck_class_coeff_range" CHECK ("class_coeff"."dist_to_km" >= "class_coeff"."dist_from_km")
);
--> statement-breakpoint
CREATE TABLE "distance_corr" (
	"dist_from_km" integer PRIMARY KEY NOT NULL,
	"dist_to_km" integer NOT NULL,
	"k_table5" numeric(6, 4) NOT NULL,
	CONSTRAINT "ck_distance_corr_range" CHECK ("distance_corr"."dist_to_km" >= "distance_corr"."dist_from_km")
);
--> statement-breakpoint
CREATE TABLE "empty_run_scheme" (
	"axles" smallint NOT NULL,
	"dist_from_km" integer NOT NULL,
	"dist_to_km" integer NOT NULL,
	"rate_rub" numeric(14, 2) NOT NULL,
	CONSTRAINT "empty_run_scheme_axles_dist_from_km_pk" PRIMARY KEY("axles","dist_from_km"),
	CONSTRAINT "ck_empty_run_range" CHECK ("empty_run_scheme"."dist_to_km" >= "empty_run_scheme"."dist_from_km"),
	CONSTRAINT "ck_empty_run_rate" CHECK ("empty_run_scheme"."rate_rub" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tariff_coefficients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"multiplier" numeric(8, 4) NOT NULL,
	"applies_to" text NOT NULL,
	"applies_to_class" smallint,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	CONSTRAINT "ck_tariff_coeff_kind" CHECK ("tariff_coefficients"."kind" IN ('index','coef')),
	CONSTRAINT "ck_tariff_coeff_applies_to" CHECK ("tariff_coefficients"."applies_to" IN ('all','porozhny','container','minstroy','class')),
	CONSTRAINT "ck_tariff_coeff_class" CHECK ("tariff_coefficients"."applies_to_class" IS NULL OR "tariff_coefficients"."applies_to_class" IN (1,2,3))
);
--> statement-breakpoint
CREATE TABLE "tariff_rate_belt" (
	"scheme_code" text NOT NULL,
	"dist_from_km" integer NOT NULL,
	"dist_to_km" integer NOT NULL,
	"weight_t" smallint DEFAULT -1 NOT NULL,
	"rate_rub" numeric(14, 2) NOT NULL,
	CONSTRAINT "tariff_rate_belt_scheme_code_dist_from_km_weight_t_pk" PRIMARY KEY("scheme_code","dist_from_km","weight_t"),
	CONSTRAINT "ck_tariff_rate_belt_range" CHECK ("tariff_rate_belt"."dist_to_km" >= "tariff_rate_belt"."dist_from_km"),
	CONSTRAINT "ck_tariff_rate_belt_rate" CHECK ("tariff_rate_belt"."rate_rub" >= 0),
	CONSTRAINT "ck_tariff_rate_belt_weight" CHECK ("tariff_rate_belt"."weight_t" = -1 OR "tariff_rate_belt"."weight_t" > 0)
);
--> statement-breakpoint
CREATE TABLE "tariff_scheme" (
	"scheme_code" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"class_dependent" boolean DEFAULT false NOT NULL,
	"description" text,
	CONSTRAINT "ck_tariff_scheme_kind" CHECK ("tariff_scheme"."kind" IN ('I','V'))
);
--> statement-breakpoint
CREATE TABLE "wagon_scheme_map" (
	"wagon_type" text NOT NULL,
	"ownership" text NOT NULL,
	"shipment_type" text NOT NULL,
	"i_scheme_code" text,
	"v_scheme_code" text,
	CONSTRAINT "wagon_scheme_map_wagon_type_ownership_shipment_type_pk" PRIMARY KEY("wagon_type","ownership","shipment_type"),
	CONSTRAINT "ck_wagon_scheme_ownership" CHECK ("wagon_scheme_map"."ownership" IN ('rzd','own')),
	CONSTRAINT "ck_wagon_scheme_shipment" CHECK ("wagon_scheme_map"."shipment_type" IN ('wagon','group','route'))
);
--> statement-breakpoint
ALTER TABLE "special_distance" ADD CONSTRAINT "special_distance_a_esr_stations_esr_code_fk" FOREIGN KEY ("a_esr") REFERENCES "public"."stations"("esr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "special_distance" ADD CONSTRAINT "special_distance_b_esr_stations_esr_code_fk" FOREIGN KEY ("b_esr") REFERENCES "public"."stations"("esr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_edges" ADD CONSTRAINT "tariff_edges_from_esr_stations_esr_code_fk" FOREIGN KEY ("from_esr") REFERENCES "public"."stations"("esr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_edges" ADD CONSTRAINT "tariff_edges_to_esr_stations_esr_code_fk" FOREIGN KEY ("to_esr") REFERENCES "public"."stations"("esr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tp_node" ADD CONSTRAINT "tp_node_esr_code_stations_esr_code_fk" FOREIGN KEY ("esr_code") REFERENCES "public"."stations"("esr_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_rate_belt" ADD CONSTRAINT "tariff_rate_belt_scheme_code_tariff_scheme_scheme_code_fk" FOREIGN KEY ("scheme_code") REFERENCES "public"."tariff_scheme"("scheme_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagon_scheme_map" ADD CONSTRAINT "wagon_scheme_map_i_scheme_code_tariff_scheme_scheme_code_fk" FOREIGN KEY ("i_scheme_code") REFERENCES "public"."tariff_scheme"("scheme_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wagon_scheme_map" ADD CONSTRAINT "wagon_scheme_map_v_scheme_code_tariff_scheme_scheme_code_fk" FOREIGN KEY ("v_scheme_code") REFERENCES "public"."tariff_scheme"("scheme_code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tariff_edges_from" ON "tariff_edges" USING btree ("from_esr");--> statement-breakpoint
CREATE INDEX "idx_etsng_class" ON "etsng" USING btree ("tariff_class");--> statement-breakpoint
CREATE INDEX "idx_etsng_name" ON "etsng" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_tariff_coeff_effective" ON "tariff_coefficients" USING btree ("effective_from");