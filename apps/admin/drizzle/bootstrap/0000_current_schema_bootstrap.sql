CREATE SCHEMA "admin";
--> statement-breakpoint
CREATE TYPE "public"."ai_proposal_status" AS ENUM('proposed', 'approved', 'rejected', 'applied', 'expired', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ai_surface" AS ENUM('admin', 'storefront');--> statement-breakpoint
CREATE TYPE "public"."bundle_pricing_mode" AS ENUM('fixed', 'component_sum');--> statement-breakpoint
CREATE TYPE "public"."landing_page_locale" AS ENUM('fr', 'ar');--> statement-breakpoint
CREATE TYPE "public"."landing_page_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "admin"."admin_user_role" AS ENUM('viewer', 'employee', 'admin', 'developer');--> statement-breakpoint
CREATE TYPE "public"."product_attribute_data_type" AS ENUM('text', 'number', 'boolean', 'enum', 'multi_enum');--> statement-breakpoint
CREATE TYPE "public"."product_evidence_type" AS ENUM('manufacturer_document', 'manufacturer_page', 'admin_note', 'sales_data', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_knowledge_review_status" AS ENUM('proposed', 'verified', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."product_knowledge_source" AS ENUM('manufacturer', 'admin', 'algorithm', 'ai', 'customer_behavior');--> statement-breakpoint
CREATE TYPE "public"."product_project_suitability" AS ENUM('recommended', 'suitable', 'conditional', 'unsuitable');--> statement-breakpoint
CREATE TYPE "public"."product_relation_type" AS ENUM('compatible_with', 'requires', 'alternative_to', 'accessory_for', 'frequently_bought_with');--> statement-breakpoint
CREATE TYPE "admin"."admin_role_permission" AS ENUM('products_write', 'orders_write', 'assets_write', 'brands_categories_write', 'bulletin_moderate', 'ops_view', 'settings_manage', 'ai_use', 'ai_catalog_propose', 'ai_catalog_apply', 'ai_analytics_query', 'ai_pricing_analyze', 'ai_pricing_apply', 'ai_landing_publish');--> statement-breakpoint
CREATE TABLE "admin"."action_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"resource" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"entity_label" text NOT NULL,
	"operation" text NOT NULL,
	"before_state" jsonb,
	"after_state" jsonb,
	"created_by" text,
	"created_by_name" text,
	"is_reversible" boolean DEFAULT true NOT NULL,
	"is_undone" boolean DEFAULT false NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by" text,
	"redone_at" timestamp with time zone,
	"redone_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_conversations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"surface" "ai_surface" NOT NULL,
	"actor_id" text,
	"session_key" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" bigint NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"proposal_type" text NOT NULL,
	"status" "ai_proposal_status" DEFAULT 'proposed' NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"source_updated_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"reasoning" text,
	"requested_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conversation_id" bigint,
	"surface" "ai_surface" NOT NULL,
	"task" text NOT NULL,
	"status" "ai_run_status" DEFAULT 'running' NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"actor_id" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_tool_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" bigint NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_pricing_policies" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_minimum_gross_margin" numeric(5, 4) DEFAULT '0.1500' NOT NULL,
	"allow_request_override" boolean DEFAULT true NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_pricing_policies_margin_check" CHECK ("ai_pricing_policies"."default_minimum_gross_margin" >= 0 and "ai_pricing_policies"."default_minimum_gross_margin" < 1)
);
--> statement-breakpoint
CREATE TABLE "bundle_components" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bundle_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"unit_purchase_price_snapshot" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_components_quantity_check" CHECK ("bundle_components"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "bundle_listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"pricing_mode" "bundle_pricing_mode" DEFAULT 'fixed' NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_page_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"landing_page_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"document" jsonb NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"locale" "landing_page_locale" NOT NULL,
	"slug" text NOT NULL,
	"status" "landing_page_status" DEFAULT 'draft' NOT NULL,
	"draft_revision" integer DEFAULT 1 NOT NULL,
	"published_revision" integer,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "admin"."ad_costs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"platform" text DEFAULT 'facebook' NOT NULL,
	"campaign_name" text,
	"campaign_id" text,
	"spend" numeric(12, 2) DEFAULT '0' NOT NULL,
	"impressions" integer,
	"clicks" integer,
	"conversions" integer,
	"reach" integer,
	"notes" text,
	"import_batch_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ad_costs_date_platform_campaign" UNIQUE("date","platform","campaign_name")
);
--> statement-breakpoint
CREATE TABLE "admin"."ad_spend_import_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"file_name" text NOT NULL,
	"rate" numeric(12, 4) NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"imported_rows" integer DEFAULT 0 NOT NULL,
	"updated_rows" integer DEFAULT 0 NOT NULL,
	"uploaded_by_email" text,
	"uploaded_by_name" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_spend_import_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."reporting_snapshot_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"trigger" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"source_import_batch_id" text,
	"pending_refresh" boolean DEFAULT false NOT NULL,
	"pending_trigger" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."reporting_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"snapshot_key" text NOT NULL,
	"run_id" text NOT NULL,
	"trigger" text NOT NULL,
	"source_import_batch_id" text,
	"range" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"report_through_date" date,
	"payload" jsonb NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stale_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"dimension" text NOT NULL,
	"dimension_key" text DEFAULT '' NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"journeys" integer DEFAULT 0 NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"product_views" integer DEFAULT 0 NOT NULL,
	"add_to_carts" integer DEFAULT 0 NOT NULL,
	"checkout_starts" integer DEFAULT 0 NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"searches" integer DEFAULT 0 NOT NULL,
	"zero_result_searches" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_distinct_daily_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"dimension_key" text DEFAULT '' NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"visit_id" text,
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
CREATE TABLE "analytics_journeys" (
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
CREATE TABLE "analytics_paid_click_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"variant" text NOT NULL,
	"paid_source" text NOT NULL,
	"has_order" integer DEFAULT 0 NOT NULL,
	"landing_path" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"landed_only" integer DEFAULT 0 NOT NULL,
	"viewed_product" integer DEFAULT 0 NOT NULL,
	"added_to_cart" integer DEFAULT 0 NOT NULL,
	"began_checkout" integer DEFAULT 0 NOT NULL,
	"created_order" integer DEFAULT 0 NOT NULL,
	"purchased" integer DEFAULT 0 NOT NULL,
	"errored" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_paid_click_visits" (
	"visit_id" text PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"landing_url" text NOT NULL,
	"landing_path" text NOT NULL,
	"landing_query" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"landing_host" text,
	"referrer" text,
	"user_agent" text,
	"storefront_variant" text,
	"requested_variant" text,
	"experiment_mode" text,
	"experiment_source" text,
	"fbclid_raw" text,
	"fbc" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"paid_source" text NOT NULL,
	"journey_id" text,
	"session_id" text,
	"order_id" bigint,
	"entry_event_id" text,
	"last_event_name" text,
	"last_event_at" timestamp with time zone,
	"event_count" integer DEFAULT 0 NOT NULL,
	"purchase_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_banners" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_ar" text,
	"image_url" text NOT NULL,
	"image_url_portrait" text,
	"image_url_landscape" text,
	"product_id" bigint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "featured_product_group_brands" (
	"group_id" bigint NOT NULL,
	"brand_id" bigint NOT NULL,
	CONSTRAINT "featured_product_group_brands_group_id_brand_id_pk" PRIMARY KEY("group_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "featured_product_group_categories" (
	"group_id" bigint NOT NULL,
	"category_id" bigint NOT NULL,
	CONSTRAINT "featured_product_group_categories_group_id_category_id_pk" PRIMARY KEY("group_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "featured_product_group_products" (
	"group_id" bigint NOT NULL,
	"product_id" bigint NOT NULL,
	CONSTRAINT "featured_product_group_products_group_id_product_id_pk" PRIMARY KEY("group_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "featured_product_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"cta" text,
	"cta_ar" text,
	"link" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"show_at_top_of_products_page" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_cards" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"title_ar" text NOT NULL,
	"title_fr" text NOT NULL,
	"description_ar" text NOT NULL,
	"description_fr" text NOT NULL,
	"characteristics_ar" text[] DEFAULT '{}' NOT NULL,
	"characteristics_fr" text[] DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."accounts" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"provider" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"type" text,
	"expires_at" integer,
	"token_type" text,
	"session_state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."sessions" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"email_verified_flag" boolean DEFAULT true NOT NULL,
	"image" text,
	"role" "admin"."admin_user_role" DEFAULT 'viewer' NOT NULL,
	"role_definition_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."verification_tokens" (
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"mongo_id" text,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"updated_by" text,
	"updated_by_name" text,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"add_to_cart_count" bigint DEFAULT 0 NOT NULL,
	"checkout_count" bigint DEFAULT 0 NOT NULL,
	"purchase_count" bigint DEFAULT 0 NOT NULL,
	"popularity_score" numeric(14, 2) DEFAULT '0' NOT NULL,
	"conversion_rate" numeric(8, 4) DEFAULT '0' NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."bulletin_post_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."bulletin_post_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."bulletin_post_tags" (
	"post_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bulletin_post_tags_post_id_tag_id_pk" PRIMARY KEY("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."bulletin_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"author_email" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."bulletin_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"author_email" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."bulletin_reply_reactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"reply_id" integer NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."bulletin_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"mongo_id" text,
	"name_en" text,
	"name_ar" text,
	"image" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"parent_id" bigint,
	"properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"updated_by" text,
	"updated_by_name" text,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"add_to_cart_count" bigint DEFAULT 0 NOT NULL,
	"checkout_count" bigint DEFAULT 0 NOT NULL,
	"purchase_count" bigint DEFAULT 0 NOT NULL,
	"popularity_score" numeric(14, 2) DEFAULT '0' NOT NULL,
	"conversion_rate" numeric(8, 4) DEFAULT '0' NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_communes" (
	"commune_id" integer PRIMARY KEY NOT NULL,
	"wilaya_id" integer NOT NULL,
	"name" text NOT NULL,
	"postal_code" text,
	"has_stop_desk" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_order_maj_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"tracking_number" text NOT NULL,
	"remarque" text NOT NULL,
	"station" text,
	"livreur" text,
	"remote_created_at" timestamp with time zone NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_order_states" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"reference" text NOT NULL,
	"tracking_number" text NOT NULL,
	"provider" text DEFAULT 'delivro' NOT NULL,
	"current_status" text NOT NULL,
	"driver_phone" text,
	"estimated_fee" numeric(12, 2),
	"desk_phone" text,
	"desk_commune" text,
	"desk_map_link" text,
	"desk_address" text,
	"raw_status_payload" jsonb,
	"raw_create_payload" jsonb,
	"raw_last_tracking_payload" jsonb,
	"raw_last_maj_payload" jsonb,
	"last_status_synced_at" timestamp with time zone,
	"last_tracking_synced_at" timestamp with time zone,
	"last_maj_synced_at" timestamp with time zone,
	"last_action_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_order_tracking_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"tracking_number" text NOT NULL,
	"event_date" date NOT NULL,
	"event_time" text NOT NULL,
	"status" text NOT NULL,
	"scan_location" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_service_fees" (
	"service_type" text NOT NULL,
	"wilaya_id" integer NOT NULL,
	"home_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stop_desk_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ecotrack_service_fees_service_type_wilaya_id_pk" PRIMARY KEY("service_type","wilaya_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_sync_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"wilaya_count" integer DEFAULT 0 NOT NULL,
	"commune_count" integer DEFAULT 0 NOT NULL,
	"service_fee_count" integer DEFAULT 0 NOT NULL,
	"weight_fee_count" integer DEFAULT 0 NOT NULL,
	"rate_limit_snapshot" jsonb,
	"error_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_weight_fees" (
	"service_type" text PRIMARY KEY NOT NULL,
	"home_surcharge" numeric(10, 2) DEFAULT '0' NOT NULL,
	"stop_desk_surcharge" numeric(10, 2) DEFAULT '0' NOT NULL,
	"per_additional_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"starts_at_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."ecotrack_wilayas" (
	"wilaya_id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."import_batches" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"file_name" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_rows" integer DEFAULT 0 NOT NULL,
	"matched_orders" integer DEFAULT 0 NOT NULL,
	"unmatched_references" text[] DEFAULT '{}' NOT NULL,
	"unmatched_details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"date_range_start" date,
	"date_range_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_batch_id_unique" UNIQUE("batch_id")
);
--> statement-breakpoint
CREATE TABLE "admin"."migration_id_map" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"collection_name" text NOT NULL,
	"mongo_id" text NOT NULL,
	"new_id" bigint NOT NULL,
	"migrated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_mig_collection_mongo" UNIQUE("collection_name","mongo_id")
);
--> statement-breakpoint
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
	"duplicate_count" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE "meta_event_daily_rollups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"event_name" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"pixel_fired" integer DEFAULT 0 NOT NULL,
	"capi_sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"last_occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "order_status_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" bigint NOT NULL,
	"status" integer DEFAULT 0 NOT NULL,
	"no_answer_count" integer DEFAULT 0 NOT NULL,
	"changed_by" text,
	"changed_by_name" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"mongo_id" text,
	"first_name" text,
	"last_name" text,
	"state" integer,
	"city" text,
	"home_address" text,
	"email" text,
	"phone_number_1" text NOT NULL,
	"phone_number_2" text,
	"public_token" text,
	"cart_products" text[] DEFAULT '{}' NOT NULL,
	"visit_id" text,
	"journey_id" text,
	"session_id" text,
	"variant" text,
	"delivery" integer DEFAULT 0 NOT NULL,
	"del_pr" numeric(10, 2),
	"price" numeric(12, 2),
	"promo_code" text,
	"promo_product_id" bigint,
	"promo_original_subtotal" numeric(12, 2),
	"promo_discount_amount" numeric(12, 2),
	"promo_final_subtotal" numeric(12, 2),
	"note" text,
	"confirmed" integer DEFAULT 0 NOT NULL,
	"no_answer_count" integer DEFAULT 0 NOT NULL,
	"confirmed_by" text,
	"confirmed_by_name" text,
	"confirmed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"ecotrack_status" text,
	"ecotrack_status_last_update" timestamp with time zone,
	"ecotrack_status_data" jsonb,
	"ecotrack_reference" text,
	"ecotrack_tracking_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_order_idempotency" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"order_id" bigint,
	"meta_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."processed_order_products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"processed_order_id" bigint NOT NULL,
	"product_id" text,
	"title" text,
	"price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sku" text,
	"category_id" text,
	"category_name" text,
	"brand_id" text,
	"brand_name" text
);
--> statement-breakpoint
CREATE TABLE "admin"."processed_orders" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"tracking" text NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"wilaya" text DEFAULT '' NOT NULL,
	"commune" text DEFAULT '' NOT NULL,
	"delivery_type" text DEFAULT '' NOT NULL,
	"amount_collected" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_fees" numeric(12, 2) DEFAULT '0' NOT NULL,
	"net_revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"product_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"profit" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fee_livraison" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_poids" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_extra" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_sms" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_stockage" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fee_commission" numeric(10, 2) DEFAULT '0' NOT NULL,
	"delivered_at" timestamp with time zone,
	"order_created_at" timestamp with time zone,
	"encaissed_at" timestamp with time zone,
	"import_batch_id" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_orders_tracking_unique" UNIQUE("tracking")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"title_ar" text,
	"description" text,
	"description_ar" text,
	"mongo_id" text,
	"sku" text,
	"barcode" text,
	"price" numeric(12, 2) NOT NULL,
	"old_price" numeric(12, 2),
	"purchase_price" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"in_stock" boolean DEFAULT true NOT NULL,
	"availability_status" text DEFAULT 'in_stock' NOT NULL,
	"units_sold" bigint DEFAULT 0 NOT NULL,
	"inventory_quantity" bigint DEFAULT 0 NOT NULL,
	"view_count" bigint DEFAULT 0 NOT NULL,
	"add_to_cart_count" bigint DEFAULT 0 NOT NULL,
	"checkout_count" bigint DEFAULT 0 NOT NULL,
	"purchase_count" bigint DEFAULT 0 NOT NULL,
	"popularity_score" numeric(14, 2) DEFAULT '0' NOT NULL,
	"conversion_rate" numeric(8, 4) DEFAULT '0' NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"brand_id" bigint,
	"category_id" bigint,
	"images" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_promo_codes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"code" text NOT NULL,
	"normalized_code" text NOT NULL,
	"promo_price" numeric(12, 2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_attribute_definitions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"data_type" "product_attribute_data_type" NOT NULL,
	"unit" text,
	"allowed_values" jsonb,
	"category_id" bigint,
	"required" boolean DEFAULT false NOT NULL,
	"filterable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_attribute_values" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"definition_id" bigint NOT NULL,
	"value" jsonb NOT NULL,
	"source" "product_knowledge_source" DEFAULT 'admin' NOT NULL,
	"confidence" numeric(5, 4),
	"review_status" "product_knowledge_review_status" DEFAULT 'verified' NOT NULL,
	"evidence_summary" text,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_attribute_values_confidence_check" CHECK ("product_attribute_values"."confidence" is null or ("product_attribute_values"."confidence" >= 0 and "product_attribute_values"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "product_project_uses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" bigint NOT NULL,
	"project_type_id" bigint NOT NULL,
	"suitability" "product_project_suitability" DEFAULT 'suitable' NOT NULL,
	"source" "product_knowledge_source" DEFAULT 'admin' NOT NULL,
	"confidence" numeric(5, 4),
	"review_status" "product_knowledge_review_status" DEFAULT 'verified' NOT NULL,
	"evidence_summary" text,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_project_uses_confidence_check" CHECK ("product_project_uses"."confidence" is null or ("product_project_uses"."confidence" >= 0 and "product_project_uses"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "product_relation_evidence" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"relation_id" bigint NOT NULL,
	"evidence_type" "product_evidence_type" NOT NULL,
	"source_url" text,
	"source_label" text,
	"excerpt" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_relations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_product_id" bigint NOT NULL,
	"target_product_id" bigint NOT NULL,
	"relation_type" "product_relation_type" NOT NULL,
	"source" "product_knowledge_source" DEFAULT 'admin' NOT NULL,
	"confidence" numeric(5, 4),
	"review_status" "product_knowledge_review_status" DEFAULT 'verified' NOT NULL,
	"created_by" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_relations_distinct_products_check" CHECK ("product_relations"."source_product_id" <> "product_relations"."target_product_id"),
	CONSTRAINT "product_relations_confidence_check" CHECK ("product_relations"."confidence" is null or ("product_relations"."confidence" >= 0 and "product_relations"."confidence" <= 1))
);
--> statement-breakpoint
CREATE TABLE "project_types" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_ar" text,
	"description" text,
	"parent_id" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."role_definition_permissions" (
	"role_id" integer NOT NULL,
	"permission" "admin"."admin_role_permission" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_definition_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "admin"."role_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."shopping_list_drafts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scope_key" text NOT NULL,
	"source_mode" text NOT NULL,
	"order_ids" bigint[] DEFAULT '{}' NOT NULL,
	"title" text NOT NULL,
	"draft_items" jsonb NOT NULL,
	"generated_items" jsonb NOT NULL,
	"orders_snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_by_name" text,
	"updated_by" text,
	"updated_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storefront_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"contact_phone" text DEFAULT '0795342826' NOT NULL,
	"phone_enabled" boolean DEFAULT true NOT NULL,
	"ai_assistant_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin"."user_access_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" "admin"."admin_user_role" DEFAULT 'viewer' NOT NULL,
	"role_definition_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_proposals" ADD CONSTRAINT "ai_proposals_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_run_id_ai_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ai_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_bundle_id_bundle_listings_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundle_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_listings" ADD CONSTRAINT "bundle_listings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_page_revisions" ADD CONSTRAINT "landing_page_revisions_landing_page_id_landing_pages_id_fk" FOREIGN KEY ("landing_page_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ad_costs" ADD CONSTRAINT "ad_costs_import_batch_id_ad_spend_import_batches_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "admin"."ad_spend_import_batches"("batch_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_journey_id_analytics_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."analytics_journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_journeys" ADD CONSTRAINT "analytics_journeys_first_order_id_orders_id_fk" FOREIGN KEY ("first_order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_paid_click_visits" ADD CONSTRAINT "analytics_paid_click_visits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_banners" ADD CONSTRAINT "asset_banners_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_brands" ADD CONSTRAINT "featured_product_group_brands_group_id_featured_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."featured_product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_brands" ADD CONSTRAINT "featured_product_group_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_categories" ADD CONSTRAINT "featured_product_group_categories_group_id_featured_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."featured_product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_categories" ADD CONSTRAINT "featured_product_group_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_products" ADD CONSTRAINT "featured_product_group_products_group_id_featured_product_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."featured_product_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_product_group_products" ADD CONSTRAINT "featured_product_group_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_cards" ADD CONSTRAINT "product_cards_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."users" ADD CONSTRAINT "users_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "admin"."role_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_post_attachments" ADD CONSTRAINT "bulletin_post_attachments_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "admin"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_post_reactions" ADD CONSTRAINT "bulletin_post_reactions_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "admin"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_post_reactions" ADD CONSTRAINT "bulletin_post_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_post_tags" ADD CONSTRAINT "bulletin_post_tags_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "admin"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_post_tags" ADD CONSTRAINT "bulletin_post_tags_tag_id_bulletin_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "admin"."bulletin_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_posts" ADD CONSTRAINT "bulletin_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_replies" ADD CONSTRAINT "bulletin_replies_post_id_bulletin_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "admin"."bulletin_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_replies" ADD CONSTRAINT "bulletin_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_reply_reactions" ADD CONSTRAINT "bulletin_reply_reactions_reply_id_bulletin_replies_id_fk" FOREIGN KEY ("reply_id") REFERENCES "admin"."bulletin_replies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."bulletin_reply_reactions" ADD CONSTRAINT "bulletin_reply_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "admin"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_communes" ADD CONSTRAINT "ecotrack_communes_wilaya_id_ecotrack_wilayas_wilaya_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "admin"."ecotrack_wilayas"("wilaya_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_maj_entries" ADD CONSTRAINT "ecotrack_order_maj_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD CONSTRAINT "ecotrack_order_states_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_tracking_events" ADD CONSTRAINT "ecotrack_order_tracking_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_service_fees" ADD CONSTRAINT "ecotrack_service_fees_wilaya_id_ecotrack_wilayas_wilaya_id_fk" FOREIGN KEY ("wilaya_id") REFERENCES "admin"."ecotrack_wilayas"("wilaya_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_event_outbox" ADD CONSTRAINT "marketing_event_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_event_outbox" ADD CONSTRAINT "marketing_event_outbox_order_status_history_id_order_status_history_id_fk" FOREIGN KEY ("order_status_history_id") REFERENCES "public"."order_status_history"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_event_outbox" ADD CONSTRAINT "meta_event_outbox_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_event_outbox" ADD CONSTRAINT "meta_event_outbox_order_status_history_id_order_status_history_id_fk" FOREIGN KEY ("order_status_history_id") REFERENCES "public"."order_status_history"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_event_outbox" ADD CONSTRAINT "meta_event_outbox_analytics_event_id_analytics_events_id_fk" FOREIGN KEY ("analytics_event_id") REFERENCES "public"."analytics_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_marketing_attribution" ADD CONSTRAINT "order_marketing_attribution_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_meta_attribution" ADD CONSTRAINT "order_meta_attribution_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_product_id_products_id_fk" FOREIGN KEY ("promo_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storefront_order_idempotency" ADD CONSTRAINT "storefront_order_idempotency_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."processed_order_products" ADD CONSTRAINT "processed_order_products_processed_order_id_processed_orders_id_fk" FOREIGN KEY ("processed_order_id") REFERENCES "admin"."processed_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_promo_codes" ADD CONSTRAINT "product_promo_codes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_definitions" ADD CONSTRAINT "product_attribute_definitions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_values" ADD CONSTRAINT "product_attribute_values_definition_id_product_attribute_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."product_attribute_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_project_uses" ADD CONSTRAINT "product_project_uses_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_project_uses" ADD CONSTRAINT "product_project_uses_project_type_id_project_types_id_fk" FOREIGN KEY ("project_type_id") REFERENCES "public"."project_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relation_evidence" ADD CONSTRAINT "product_relation_evidence_relation_id_product_relations_id_fk" FOREIGN KEY ("relation_id") REFERENCES "public"."product_relations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_relations" ADD CONSTRAINT "product_relations_target_product_id_products_id_fk" FOREIGN KEY ("target_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_types" ADD CONSTRAINT "project_types_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."project_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."role_definition_permissions" ADD CONSTRAINT "role_definition_permissions_role_id_role_definitions_id_fk" FOREIGN KEY ("role_id") REFERENCES "admin"."role_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin"."user_access_grants" ADD CONSTRAINT "user_access_grants_role_definition_id_role_definitions_id_fk" FOREIGN KEY ("role_definition_id") REFERENCES "admin"."role_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_action_logs_created_at" ON "admin"."action_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_action_logs_entity" ON "admin"."action_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_action_logs_resource" ON "admin"."action_logs" USING btree ("resource","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_actor_updated" ON "ai_conversations" USING btree ("actor_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_session" ON "ai_conversations" USING btree ("session_key");--> statement-breakpoint
CREATE INDEX "idx_ai_conversations_expires" ON "ai_conversations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_ai_messages_conversation_created" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_proposals_entity_status" ON "ai_proposals" USING btree ("entity_type","entity_id","status");--> statement-breakpoint
CREATE INDEX "idx_ai_proposals_requested_created" ON "ai_proposals" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_proposals_expires" ON "ai_proposals" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_actor_started" ON "ai_runs" USING btree ("actor_id","started_at");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_status_started" ON "ai_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "idx_ai_runs_conversation" ON "ai_runs" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_ai_tool_calls_run" ON "ai_tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_ai_tool_calls_tool_started" ON "ai_tool_calls" USING btree ("tool_name","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_components_bundle_product_unique" ON "bundle_components" USING btree ("bundle_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_bundle_components_product" ON "bundle_components" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_listings_product_unique" ON "bundle_listings" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_bundle_listings_active" ON "bundle_listings" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_landing_page_revisions_page_revision" ON "landing_page_revisions" USING btree ("landing_page_id","revision");--> statement-breakpoint
CREATE INDEX "idx_landing_page_revisions_page_created" ON "landing_page_revisions" USING btree ("landing_page_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_landing_pages_locale_slug" ON "landing_pages" USING btree ("locale","slug");--> statement-breakpoint
CREATE INDEX "idx_landing_pages_product" ON "landing_pages" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_landing_pages_publication" ON "landing_pages" USING btree ("locale","status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_ad_costs_date" ON "admin"."ad_costs" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_snapshot_runs_run_id_unique" ON "admin"."reporting_snapshot_runs" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshot_runs_status" ON "admin"."reporting_snapshot_runs" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshot_runs_completed" ON "admin"."reporting_snapshot_runs" USING btree ("completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_snapshots_key_run_unique" ON "admin"."reporting_snapshots" USING btree ("snapshot_key","run_id");--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshots_key_generated" ON "admin"."reporting_snapshots" USING btree ("snapshot_key","generated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_reporting_snapshots_stale" ON "admin"."reporting_snapshots" USING btree ("stale_at");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_rollups_day_dimension_key_unique" ON "analytics_daily_rollups" USING btree ("day","dimension","dimension_key");--> statement-breakpoint
CREATE INDEX "idx_analytics_daily_rollups_dimension_day" ON "analytics_daily_rollups" USING btree ("dimension","day");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_distinct_members_day_metric_key_member_unique" ON "analytics_distinct_daily_members" USING btree ("day","metric","dimension_key","member_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_distinct_members_metric_day_key" ON "analytics_distinct_daily_members" USING btree ("metric","day","dimension_key");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_event_id_unique" ON "analytics_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_events_occurred_at" ON "analytics_events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_event_name" ON "analytics_events" USING btree ("event_name","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_visit" ON "analytics_events" USING btree ("visit_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_journey" ON "analytics_events" USING btree ("journey_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_session" ON "analytics_events" USING btree ("session_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_product" ON "analytics_events" USING btree ("product_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_order" ON "analytics_events" USING btree ("order_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_journeys_first_seen" ON "analytics_journeys" USING btree ("first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_journeys_last_seen" ON "analytics_journeys" USING btree ("last_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_paid_click_rollups_dimensions_unique" ON "analytics_paid_click_daily_rollups" USING btree ("day","variant","paid_source","has_order","landing_path");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_rollups_day" ON "analytics_paid_click_daily_rollups" USING btree ("day");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_first_seen" ON "analytics_paid_click_visits" USING btree ("first_seen_at" DESC NULLS LAST,"visit_id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_variant_first_seen" ON "analytics_paid_click_visits" USING btree ("storefront_variant","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_source_first_seen" ON "analytics_paid_click_visits" USING btree ("paid_source","first_seen_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_journey" ON "analytics_paid_click_visits" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_session" ON "analytics_paid_click_visits" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_order" ON "analytics_paid_click_visits" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_analytics_paid_click_expires" ON "analytics_paid_click_visits" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_asset_banners_product" ON "asset_banners" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_asset_banners_sort_order" ON "asset_banners" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_featured_group_brands_brand" ON "featured_product_group_brands" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_featured_group_categories_category" ON "featured_product_group_categories" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_featured_group_products_product" ON "featured_product_group_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_cards_product" ON "product_cards" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_product_cards_sort_order" ON "product_cards" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_id_unique" ON "admin"."accounts" USING btree ("id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "admin"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_id_unique" ON "admin"."sessions" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "admin"."sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "admin"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_definition_id_idx" ON "admin"."users" USING btree ("role_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_id_unique" ON "admin"."verification_tokens" USING btree ("id");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_token_unique" ON "admin"."verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_unique" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_brands_mongo_id" ON "brands" USING btree ("mongo_id");--> statement-breakpoint
CREATE INDEX "idx_brands_popularity" ON "brands" USING btree ("popularity_score");--> statement-breakpoint
CREATE INDEX "idx_brands_last_viewed_at" ON "brands" USING btree ("last_viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "bulletin_post_attachments_post_id_idx" ON "admin"."bulletin_post_attachments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "bulletin_post_reactions_post_id_idx" ON "admin"."bulletin_post_reactions" USING btree ("post_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_post_reactions_unique" ON "admin"."bulletin_post_reactions" USING btree ("post_id","user_email","emoji");--> statement-breakpoint
CREATE INDEX "bulletin_post_tags_post_id_idx" ON "admin"."bulletin_post_tags" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "bulletin_post_tags_tag_id_idx" ON "admin"."bulletin_post_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "bulletin_posts_author_id_idx" ON "admin"."bulletin_posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "bulletin_posts_pinned_idx" ON "admin"."bulletin_posts" USING btree ("pinned");--> statement-breakpoint
CREATE INDEX "bulletin_posts_updated_at_idx" ON "admin"."bulletin_posts" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "bulletin_replies_post_id_idx" ON "admin"."bulletin_replies" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "bulletin_replies_author_id_idx" ON "admin"."bulletin_replies" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "bulletin_replies_created_at_idx" ON "admin"."bulletin_replies" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "bulletin_reply_reactions_reply_id_idx" ON "admin"."bulletin_reply_reactions" USING btree ("reply_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_reply_reactions_unique" ON "admin"."bulletin_reply_reactions" USING btree ("reply_id","user_email","emoji");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_tags_name_unique" ON "admin"."bulletin_tags" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "bulletin_tags_slug_unique" ON "admin"."bulletin_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_categories_parent" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_categories_mongo_id" ON "categories" USING btree ("mongo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_unique" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_categories_popularity" ON "categories" USING btree ("popularity_score");--> statement-breakpoint
CREATE INDEX "idx_categories_last_viewed_at" ON "categories" USING btree ("last_viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_communes_wilaya" ON "admin"."ecotrack_communes" USING btree ("wilaya_id");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_communes_name" ON "admin"."ecotrack_communes" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_maj_entries_unique" ON "admin"."ecotrack_order_maj_entries" USING btree ("order_id","remarque","remote_created_at");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_maj_entries_order_created" ON "admin"."ecotrack_order_maj_entries" USING btree ("order_id","remote_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_maj_entries_tracking_created" ON "admin"."ecotrack_order_maj_entries" USING btree ("tracking_number","remote_created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_states_order_id_unique" ON "admin"."ecotrack_order_states" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_states_tracking_unique" ON "admin"."ecotrack_order_states" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_states_provider" ON "admin"."ecotrack_order_states" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_states_current_status" ON "admin"."ecotrack_order_states" USING btree ("current_status");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_states_deleted_status_updated" ON "admin"."ecotrack_order_states" USING btree ("deleted_at","current_status","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "ecotrack_order_tracking_events_unique" ON "admin"."ecotrack_order_tracking_events" USING btree ("order_id","event_date","event_time","status",coalesce("scan_location", ''));--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_tracking_events_order_date_time" ON "admin"."ecotrack_order_tracking_events" USING btree ("order_id","event_date" DESC NULLS LAST,"event_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_tracking_events_tracking_date_time" ON "admin"."ecotrack_order_tracking_events" USING btree ("tracking_number","event_date" DESC NULLS LAST,"event_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_ecotrack_order_tracking_events_status" ON "admin"."ecotrack_order_tracking_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_service_fees_wilaya" ON "admin"."ecotrack_service_fees" USING btree ("wilaya_id");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_sync_runs_started_at" ON "admin"."ecotrack_sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_sync_runs_status" ON "admin"."ecotrack_sync_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ecotrack_wilayas_name" ON "admin"."ecotrack_wilayas" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_mig_lookup" ON "admin"."migration_id_map" USING btree ("collection_name","new_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketing_event_outbox_destination_name_id_unique" ON "marketing_event_outbox" USING btree ("destination","event_name","event_id");--> statement-breakpoint
CREATE INDEX "idx_marketing_event_outbox_delivery" ON "marketing_event_outbox" USING btree ("destination","status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_marketing_event_outbox_order" ON "marketing_event_outbox" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_marketing_event_outbox_lease" ON "marketing_event_outbox" USING btree ("processing_lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_event_daily_rollups_day_event_unique" ON "meta_event_daily_rollups" USING btree ("day","event_name");--> statement-breakpoint
CREATE INDEX "idx_meta_event_daily_rollups_event_day" ON "meta_event_daily_rollups" USING btree ("event_name","day");--> statement-breakpoint
CREATE UNIQUE INDEX "meta_event_outbox_name_id_unique" ON "meta_event_outbox" USING btree ("event_name","event_id");--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_delivery" ON "meta_event_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_order" ON "meta_event_outbox" USING btree ("order_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_event" ON "meta_event_outbox" USING btree ("event_name","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_event_time" ON "meta_event_outbox" USING btree ("event_time" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_meta_event_outbox_lease" ON "meta_event_outbox" USING btree ("processing_lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_line_items_order_content_unique" ON "order_line_items" USING btree ("order_id","content_id");--> statement-breakpoint
CREATE INDEX "idx_order_line_items_order" ON "order_line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_line_items_product" ON "order_line_items" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_marketing_attribution_event_unique" ON "order_marketing_attribution" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "idx_order_marketing_attribution_semantics" ON "order_marketing_attribution" USING btree ("semantics_version","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_marketing_attribution_expires" ON "order_marketing_attribution" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_meta_attribution_lead_event_unique" ON "order_meta_attribution" USING btree ("lead_event_id");--> statement-breakpoint
CREATE INDEX "idx_order_meta_attribution_semantics" ON "order_meta_attribution" USING btree ("semantics_version","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_order_meta_attribution_expires" ON "order_meta_attribution" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_osh_order" ON "order_status_history" USING btree ("order_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_orders_mongo_id" ON "orders" USING btree ("mongo_id");--> statement-breakpoint
CREATE INDEX "idx_orders_confirmed" ON "orders" USING btree ("confirmed");--> statement-breakpoint
CREATE INDEX "idx_orders_created" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_orders_visit" ON "orders" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "idx_orders_journey" ON "orders" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "idx_orders_session" ON "orders" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_orders_archived_at" ON "orders" USING btree ("archived_at");--> statement-breakpoint
CREATE INDEX "idx_orders_cart_products_gin" ON "orders" USING gin ("cart_products");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_public_token_unique" ON "orders" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "idx_orders_active_created_at" ON "orders" USING btree ("created_at" DESC NULLS LAST) WHERE "orders"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "idx_orders_active_confirmed_created_at" ON "orders" USING btree ("confirmed","created_at" DESC NULLS LAST) WHERE "orders"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "idx_storefront_order_idempotency_order" ON "storefront_order_idempotency" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_storefront_order_idempotency_expires" ON "storefront_order_idempotency" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_pop_parent" ON "admin"."processed_order_products" USING btree ("processed_order_id");--> statement-breakpoint
CREATE INDEX "idx_po_encaissed" ON "admin"."processed_orders" USING btree ("encaissed_at");--> statement-breakpoint
CREATE INDEX "idx_po_delivered" ON "admin"."processed_orders" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "idx_po_created" ON "admin"."processed_orders" USING btree ("order_created_at");--> statement-breakpoint
CREATE INDEX "idx_po_wilaya" ON "admin"."processed_orders" USING btree ("wilaya");--> statement-breakpoint
CREATE INDEX "idx_po_batch" ON "admin"."processed_orders" USING btree ("import_batch_id");--> statement-breakpoint
CREATE INDEX "idx_po_stats_date" ON "admin"."processed_orders" USING btree (coalesce("encaissed_at", "delivered_at", "order_created_at"));--> statement-breakpoint
CREATE INDEX "idx_po_wilaya_stats_date" ON "admin"."processed_orders" USING btree ("wilaya",coalesce("encaissed_at", "delivered_at", "order_created_at"));--> statement-breakpoint
CREATE INDEX "idx_po_delivery_stats_date" ON "admin"."processed_orders" USING btree ("delivery_type",coalesce("encaissed_at", "delivered_at", "order_created_at"));--> statement-breakpoint
CREATE INDEX "idx_products_category" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_products_brand" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_products_mongo_id" ON "products" USING btree ("mongo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_unique" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_products_sku" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "idx_products_barcode" ON "products" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "idx_products_updated_at" ON "products" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_brand_updated_at" ON "products" USING btree ("brand_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_category_updated_at" ON "products" USING btree ("category_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_popularity" ON "products" USING btree ("popularity_score");--> statement-breakpoint
CREATE INDEX "idx_products_last_viewed_at" ON "products" USING btree ("last_viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_products_title_trgm" ON "products" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_products_sku_trgm" ON "products" USING gin ("sku" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_products_barcode_trgm" ON "products" USING gin ("barcode" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "product_promo_codes_product_code_unique" ON "product_promo_codes" USING btree ("product_id","normalized_code");--> statement-breakpoint
CREATE INDEX "idx_product_promo_codes_code_active" ON "product_promo_codes" USING btree ("normalized_code","active");--> statement-breakpoint
CREATE INDEX "idx_product_promo_codes_product_active" ON "product_promo_codes" USING btree ("product_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "product_attribute_definitions_key_category_unique" ON "product_attribute_definitions" USING btree ("key",coalesce("category_id", 0));--> statement-breakpoint
CREATE INDEX "idx_product_attribute_definitions_category" ON "product_attribute_definitions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_product_attribute_definitions_active" ON "product_attribute_definitions" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "product_attribute_values_product_definition_unique" ON "product_attribute_values" USING btree ("product_id","definition_id");--> statement-breakpoint
CREATE INDEX "idx_product_attribute_values_definition" ON "product_attribute_values" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "idx_product_attribute_values_review" ON "product_attribute_values" USING btree ("review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_project_uses_product_project_unique" ON "product_project_uses" USING btree ("product_id","project_type_id");--> statement-breakpoint
CREATE INDEX "idx_product_project_uses_project" ON "product_project_uses" USING btree ("project_type_id");--> statement-breakpoint
CREATE INDEX "idx_product_project_uses_review" ON "product_project_uses" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "idx_product_relation_evidence_relation" ON "product_relation_evidence" USING btree ("relation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_relations_source_target_type_unique" ON "product_relations" USING btree ("source_product_id","target_product_id","relation_type");--> statement-breakpoint
CREATE INDEX "idx_product_relations_target" ON "product_relations" USING btree ("target_product_id");--> statement-breakpoint
CREATE INDEX "idx_product_relations_type_review" ON "product_relations" USING btree ("relation_type","review_status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_types_slug_unique" ON "project_types" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_project_types_parent" ON "project_types" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_project_types_active" ON "project_types" USING btree ("active");--> statement-breakpoint
CREATE INDEX "role_definition_permissions_role_id_idx" ON "admin"."role_definition_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_name_unique" ON "admin"."role_definitions" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_slug_unique" ON "admin"."role_definitions" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_list_drafts_scope_key_unique" ON "admin"."shopping_list_drafts" USING btree ("scope_key");--> statement-breakpoint
CREATE INDEX "shopping_list_drafts_source_updated_idx" ON "admin"."shopping_list_drafts" USING btree ("source_mode","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_access_grants_email_unique" ON "admin"."user_access_grants" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_access_grants_role_definition_id_idx" ON "admin"."user_access_grants" USING btree ("role_definition_id");