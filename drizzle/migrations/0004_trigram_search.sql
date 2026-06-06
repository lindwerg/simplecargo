-- RFQ upgrade · fuzzy resolution foundation (Goal 1 stations, Goal 2 clients).
-- pg_trgm powers similarity()/word_similarity() so voice/typo-distorted names
-- ("Азбест" → "Асбест") resolve to the canonical station/counterparty. The GIN
-- trigram indexes keep candidate scans fast as the dictionaries fill (~21.5k
-- stations RF+CIS). Hand-authored: gin_trgm_ops + CREATE EXTENSION are not
-- expressible via the drizzle schema DSL. All statements are idempotent.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stations_name_trgm" ON "stations" USING gin ("name_normalized" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_alias_norm_trgm" ON "station_aliases" USING gin ("alias_normalized" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_counterparty_name_trgm" ON "counterparties" USING gin ("name_canonical" gin_trgm_ops);
