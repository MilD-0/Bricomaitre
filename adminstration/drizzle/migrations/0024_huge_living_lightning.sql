UPDATE "orders"
SET "delivery" = CASE lower(coalesce("delivery"::text, ''))
  WHEN 'home' THEN '0'
  WHEN 'office' THEN '1'
  WHEN '' THEN '0'
  ELSE coalesce("delivery"::text, '0')
END;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivery" SET DATA TYPE integer USING "delivery"::integer;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivery" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "delivery" SET DEFAULT 0;
