CREATE TABLE "marketing_event_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"destination" text NOT NULL,
	"event_name" text NOT NULL,
	"event_id" text NOT NULL,
	"source" text NOT NULL,
	"order_id" bigint,
	"order_status_history_id" bigint,
	"event_time" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"processing_lease_expires_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"last_http_status" integer,
	"provider_request_id" text,
	"error_code" text,
	"error_message" text,
	"response_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_marketing_attribution" (
	"order_id" bigint PRIMARY KEY NOT NULL,
	"semantics_version" text NOT NULL,
	"event_id" text NOT NULL,
	"event_source_url" text NOT NULL,
	"google_client_id" text,
	"google_session_id" text,
	"gclid" text,
	"gbraid" text,
	"wbraid" text,
	"tiktok_click_id" text,
	"tiktok_cookie_id" text,
	"client_ip_address" text,
	"client_user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "marketing_event_outbox" ADD CONSTRAINT "marketing_event_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_event_outbox" ADD CONSTRAINT "marketing_event_outbox_order_status_history_id_order_status_history_id_fk" FOREIGN KEY ("order_status_history_id") REFERENCES "public"."order_status_history"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_marketing_attribution" ADD CONSTRAINT "order_marketing_attribution_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_event_outbox_destination_name_id_unique" ON "marketing_event_outbox" USING btree ("destination","event_name","event_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_event_outbox_delivery" ON "marketing_event_outbox" USING btree ("destination","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_marketing_event_outbox_order" ON "marketing_event_outbox" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_marketing_event_outbox_lease" ON "marketing_event_outbox" USING btree ("processing_lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_marketing_attribution_event_unique" ON "order_marketing_attribution" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_order_marketing_attribution_semantics" ON "order_marketing_attribution" USING btree ("semantics_version","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_marketing_attribution_expires" ON "order_marketing_attribution" USING btree ("expires_at");