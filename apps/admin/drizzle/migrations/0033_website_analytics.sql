ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "view_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "add_to_cart_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "checkout_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "purchase_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "popularity_score" numeric(14, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "conversion_rate" numeric(8, 4) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "last_viewed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_products_popularity" ON "products" ("popularity_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_products_last_viewed_at" ON "products" ("last_viewed_at" DESC);
--> statement-breakpoint

ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "view_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "add_to_cart_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "checkout_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "purchase_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "popularity_score" numeric(14, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "conversion_rate" numeric(8, 4) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "last_viewed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brands_popularity" ON "brands" ("popularity_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_brands_last_viewed_at" ON "brands" ("last_viewed_at" DESC);
--> statement-breakpoint

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "view_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "add_to_cart_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "checkout_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "purchase_count" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "popularity_score" numeric(14, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "conversion_rate" numeric(8, 4) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "last_viewed_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_categories_popularity" ON "categories" ("popularity_score");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_categories_last_viewed_at" ON "categories" ("last_viewed_at" DESC);
--> statement-breakpoint

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "journey_id" text;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "session_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_journey" ON "orders" ("journey_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_session" ON "orders" ("session_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "analytics_journeys" (
  "id" text PRIMARY KEY NOT NULL,
  "first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "first_path" text,
  "last_path" text,
  "locale" text,
  "referrer" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_term" text,
  "utm_content" text,
  "order_count" integer DEFAULT 0 NOT NULL,
  "purchase_count" integer DEFAULT 0 NOT NULL,
  "first_order_id" bigint
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'analytics_journeys_first_order_id_orders_id_fk'
  ) THEN
    ALTER TABLE "analytics_journeys"
      ADD CONSTRAINT "analytics_journeys_first_order_id_orders_id_fk"
      FOREIGN KEY ("first_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_journeys_first_seen" ON "analytics_journeys" ("first_seen_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_journeys_last_seen" ON "analytics_journeys" ("last_seen_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "journey_id" text NOT NULL,
  "session_id" text NOT NULL,
  "event_name" text NOT NULL,
  "ga_event_name" text,
  "page_path" text,
  "page_type" text,
  "locale" text,
  "referrer" text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "utm_term" text,
  "utm_content" text,
  "product_id" bigint,
  "product_slug" text,
  "category_id" bigint,
  "category_slug" text,
  "brand_id" bigint,
  "brand_slug" text,
  "order_id" bigint,
  "search_term" text,
  "quantity" integer,
  "value" numeric(12, 2),
  "currency" text DEFAULT 'DZD' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'analytics_events_journey_id_analytics_journeys_id_fk'
  ) THEN
    ALTER TABLE "analytics_events"
      ADD CONSTRAINT "analytics_events_journey_id_analytics_journeys_id_fk"
      FOREIGN KEY ("journey_id") REFERENCES "public"."analytics_journeys"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'analytics_events_product_id_products_id_fk'
  ) THEN
    ALTER TABLE "analytics_events"
      ADD CONSTRAINT "analytics_events_product_id_products_id_fk"
      FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'analytics_events_category_id_categories_id_fk'
  ) THEN
    ALTER TABLE "analytics_events"
      ADD CONSTRAINT "analytics_events_category_id_categories_id_fk"
      FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'analytics_events_brand_id_brands_id_fk'
  ) THEN
    ALTER TABLE "analytics_events"
      ADD CONSTRAINT "analytics_events_brand_id_brands_id_fk"
      FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'analytics_events_order_id_orders_id_fk'
  ) THEN
    ALTER TABLE "analytics_events"
      ADD CONSTRAINT "analytics_events_order_id_orders_id_fk"
      FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "analytics_events_event_id_unique" ON "analytics_events" ("event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_events_occurred_at" ON "analytics_events" ("occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_events_event_name" ON "analytics_events" ("event_name", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_events_journey" ON "analytics_events" ("journey_id", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_events_session" ON "analytics_events" ("session_id", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_events_product" ON "analytics_events" ("product_id", "occurred_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_events_order" ON "analytics_events" ("order_id", "occurred_at" DESC);
