\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA demo_runtime;
\ir /seed/seed/10-reference.sql

-- Expose the UI for deterministic stream tests; AI_ENABLED stays false in task processes.
UPDATE storefront_settings SET ai_assistant_enabled=true WHERE id=1;

INSERT INTO categories (name, name_en, name_ar, slug, featured)
VALUES ('Outillage de vérification', 'Verification tools', 'أدوات التحقق', 'qa-tools', true);
INSERT INTO brands (name, slug) VALUES ('Bric QA', 'bric-qa');
INSERT INTO products (title, title_ar, slug, sku, price, purchase_price, in_stock, availability_status, inventory_quantity, active, category_id, brand_id)
SELECT fixture.title, fixture.title_ar, fixture.slug, fixture.sku, fixture.price, CASE WHEN fixture.slug='qa-hammer' THEN 800 ELSE 3000 END, stock, CASE WHEN stock THEN 'in_stock' ELSE 'out_of_stock' END, CASE WHEN fixture.slug='qa-hammer' THEN 5 WHEN stock THEN 250 ELSE 0 END, fixture.active, category.id, brand.id
FROM (VALUES
 ('Perceuse de vérification', 'مثقاب للتحقق', 'qa-drill', 'QA-DRILL', 4500, true, true),
 ('Marteau de vérification', 'مطرقة للتحقق', 'qa-hammer', 'QA-HAMMER', 1200, true, true),
 ('Perceuse épuisée', 'مثقاب غير متوفر', 'qa-unavailable', 'QA-UNAVAILABLE', 5000, false, true),
 ('Perceuse masquée', 'مثقاب مخفي', 'qa-hidden', 'QA-HIDDEN', 5500, true, false)
) fixture(title,title_ar,slug,sku,price,stock,active)
CROSS JOIN categories category CROSS JOIN brands brand
WHERE category.slug='qa-tools' AND brand.slug='bric-qa';
INSERT INTO landing_pages (product_id, locale, slug, status, draft_revision, published_revision, created_by, updated_by, published_at)
SELECT product.id, locale::landing_page_locale, 'qa-drill', 'published', 1, 1, 'demo-operator', 'demo-operator', now()
FROM products product CROSS JOIN unnest(ARRAY['fr','ar']) locale WHERE product.slug='qa-drill';
INSERT INTO landing_page_revisions (landing_page_id, revision, schema_version, document, source, created_by)
SELECT page.id, 1, 2, jsonb_build_object(
 'schemaVersion', 2,
 'theme', jsonb_build_object('accent','orange','density','comfortable','shell','campaign'),
 'seo', jsonb_build_object('title',CASE WHEN locale='ar' THEN 'مثقاب للتحقق' ELSE 'Perceuse de vérification' END,'description','QA campaign fixture','indexable',false),
 'blocks', jsonb_build_array(jsonb_build_object('id','hero','type','product-hero','variant','media-left',
  'heading',CASE WHEN locale='ar' THEN 'مثقاب للتحقق' ELSE 'Perceuse de vérification' END,
  'subheading','QA campaign fixture','imageUrl',NULL,'imageAlt','QA drill',
  'primaryCtaLabel',CASE WHEN locale='ar' THEN 'اطلب الآن' ELSE 'Commander maintenant' END,'showAddToCart',true),
  jsonb_build_object('id','final-cta','type','final-cta',
   'heading',CASE WHEN locale='ar' THEN 'اطلب مثقابك' ELSE 'Commandez votre perceuse' END,
   'primaryCtaLabel',CASE WHEN locale='ar' THEN 'اطلب الآن' ELSE 'Commander maintenant' END))
), 'admin', 'demo-operator'
FROM landing_pages page WHERE slug='qa-drill';
CREATE TABLE demo_runtime.dev_seed (version integer PRIMARY KEY, fingerprint text NOT NULL, seeded_at timestamptz NOT NULL DEFAULT now());
INSERT INTO demo_runtime.dev_seed(version, fingerprint) VALUES (1, :'seed_fingerprint');
COMMIT;
ANALYZE;
