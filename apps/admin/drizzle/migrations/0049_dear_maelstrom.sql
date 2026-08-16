CREATE TABLE "meta_event_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"source" text NOT NULL,
	"order_id" bigint,
	"order_status_history_id" bigint,
	"analytics_event_id" bigint,
	"event_time" timestamp with time zone NOT NULL,
	"event_source_url" text NOT NULL,
	"user_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"match_key_summary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processing_lease_expires_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_http_status" integer,
	"meta_error_code" integer,
	"meta_error_subcode" integer,
	"meta_error_message" text,
	"fbtrace_id" text,
	"events_received" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_worker_heartbeat" (
	"worker_key" text PRIMARY KEY NOT NULL,
	"release" text,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_successful_drain_at" timestamp with time zone,
	"last_reconciliation_at" timestamp with time zone,
	"last_reconciliation_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_line_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"product_id" bigint,
	"content_id" text NOT NULL,
	"raw_value" text NOT NULL,
	"title_snapshot" text NOT NULL,
	"original_unit_price" numeric(12, 2) NOT NULL,
	"effective_unit_price" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"discount_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"thumbnail_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_meta_attribution" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"semantics_version" text NOT NULL,
	"lead_event_id" text NOT NULL,
	"event_source_url" text NOT NULL,
	"fbc" text,
	"fbp" text,
	"external_id_source" text,
	"client_ip_address" text,
	"client_user_agent" text,
	"lead_outbox_id" bigint,
	"purchase_outbox_id" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meta_event_outbox" ADD CONSTRAINT "meta_event_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_event_outbox" ADD CONSTRAINT "meta_event_outbox_order_status_history_id_order_status_history_id_fk" FOREIGN KEY ("order_status_history_id") REFERENCES "public"."order_status_history"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_event_outbox" ADD CONSTRAINT "meta_event_outbox_analytics_event_id_analytics_events_id_fk" FOREIGN KEY ("analytics_event_id") REFERENCES "public"."analytics_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_meta_attribution" ADD CONSTRAINT "order_meta_attribution_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meta_event_outbox_name_id_unique" ON "meta_event_outbox" USING btree ("event_name","event_id");--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_delivery" ON "meta_event_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_order" ON "meta_event_outbox" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_event" ON "meta_event_outbox" USING btree ("event_name","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_lease" ON "meta_event_outbox" USING btree ("processing_lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_line_items_order_content_unique" ON "order_line_items" USING btree ("order_id","content_id");--> statement-breakpoint
CREATE INDEX "idx_order_line_items_order" ON "order_line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_line_items_product" ON "order_line_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_meta_attribution_lead_event_unique" ON "order_meta_attribution" USING btree ("lead_event_id");--> statement-breakpoint
CREATE INDEX "idx_order_meta_attribution_semantics" ON "order_meta_attribution" USING btree ("semantics_version","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_meta_attribution_expires" ON "order_meta_attribution" USING btree ("expires_at");