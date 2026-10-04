ALTER TABLE "brands" ADD COLUMN "search_document" text GENERATED ALWAYS AS (translate(replace(replace(lower(regexp_replace(
    coalesce("name", ''), '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'),
    'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789')) STORED;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "search_document" text GENERATED ALWAYS AS (translate(replace(replace(lower(regexp_replace(
    coalesce("name", '') || ' ' || coalesce("name_ar", ''), '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'),
    'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789')) STORED;--> statement-breakpoint
ALTER TABLE "admin"."ecotrack_order_states" ADD COLUMN "status_conflict" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_document" text GENERATED ALWAYS AS (translate(replace(replace(lower(regexp_replace(
    coalesce("title", '') || ' ' || coalesce("title_ar", '') || ' ' || coalesce("description", '') || ' ' || coalesce("description_ar", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("barcode", '') || ' ' || coalesce("slug", '') || ' ' || coalesce("mongo_id", ''), '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'),
    'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789')) STORED;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "search_title" text GENERATED ALWAYS AS (translate(replace(replace(lower(regexp_replace(
    coalesce("title", '') || ' ' || coalesce("title_ar", ''), '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'),
    'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789')) STORED;