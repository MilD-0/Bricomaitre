ALTER TABLE "order_status_history" ADD COLUMN "no_answer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "no_answer_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "orders"
SET
  "no_answer_count" = CASE lower(coalesce("confirmed"::text, ''))
    WHEN 'no2' THEN 1
    WHEN 'no3' THEN 2
    WHEN 'no4' THEN 3
    ELSE 0
  END,
  "confirmed" = CASE lower(coalesce("confirmed"::text, ''))
    WHEN 'nocon' THEN '0'
    WHEN 'pending' THEN '0'
    WHEN 'no2' THEN '1'
    WHEN 'no3' THEN '1'
    WHEN 'no4' THEN '1'
    WHEN 'yes' THEN '2'
    WHEN 'confirmed' THEN '2'
    WHEN 'dispatched' THEN '3'
    WHEN 'delivered' THEN '4'
    WHEN 'complete' THEN '4'
    WHEN 'delayed' THEN '5'
    WHEN 'cancelled' THEN '6'
    WHEN '' THEN '0'
    ELSE coalesce("confirmed"::text, '0')
  END;--> statement-breakpoint
UPDATE "order_status_history"
SET
  "no_answer_count" = CASE lower(coalesce("status"::text, ''))
    WHEN 'no2' THEN 1
    WHEN 'no3' THEN 2
    WHEN 'no4' THEN 3
    ELSE 0
  END,
  "status" = CASE lower(coalesce("status"::text, ''))
    WHEN 'nocon' THEN '0'
    WHEN 'pending' THEN '0'
    WHEN 'no2' THEN '1'
    WHEN 'no3' THEN '1'
    WHEN 'no4' THEN '1'
    WHEN 'yes' THEN '2'
    WHEN 'confirmed' THEN '2'
    WHEN 'dispatched' THEN '3'
    WHEN 'delivered' THEN '4'
    WHEN 'complete' THEN '4'
    WHEN 'delayed' THEN '5'
    WHEN 'cancelled' THEN '6'
    WHEN '' THEN '0'
    ELSE coalesce("status"::text, '0')
  END;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "status" SET DATA TYPE integer USING "status"::integer;--> statement-breakpoint
ALTER TABLE "order_status_history" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "confirmed" SET DATA TYPE integer USING "confirmed"::integer;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "confirmed" SET NOT NULL;--> statement-breakpoint
