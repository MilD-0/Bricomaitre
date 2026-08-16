CREATE TABLE "storefront_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"contact_phone" text DEFAULT '0795342826' NOT NULL,
	"phone_enabled" boolean DEFAULT true NOT NULL,
	"whatsapp_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
