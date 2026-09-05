\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA demo_runtime;
\ir /seed/seed/10-reference.sql

INSERT INTO categories (name, name_en, name_ar, slug, featured)
VALUES ('Outillage de vérification', 'Verification tools', 'أدوات التحقق', 'qa-tools', true);
INSERT INTO brands (name, slug) VALUES ('Bric QA', 'bric-qa');
INSERT INTO products (title, title_ar, slug, sku, price, purchase_price, in_stock, availability_status, inventory_quantity, active, category_id, brand_id)
SELECT fixture.title, fixture.title_ar, fixture.slug, fixture.sku, fixture.price, 3000, stock, CASE WHEN stock THEN 'in_stock' ELSE 'out_of_stock' END, CASE WHEN stock THEN 20 ELSE 0 END, fixture.active, category.id, brand.id
FROM (VALUES
 ('Perceuse de vérification', 'مثقاب للتحقق', 'qa-drill', 'QA-DRILL', 4500, true, true),
 ('Perceuse épuisée', 'مثقاب غير متوفر', 'qa-unavailable', 'QA-UNAVAILABLE', 5000, false, true),
 ('Perceuse masquée', 'مثقاب مخفي', 'qa-hidden', 'QA-HIDDEN', 5500, true, false)
) fixture(title,title_ar,slug,sku,price,stock,active)
CROSS JOIN categories category CROSS JOIN brands brand
WHERE category.slug='qa-tools' AND brand.slug='bric-qa';
CREATE TABLE demo_runtime.dev_seed (version integer PRIMARY KEY, fingerprint text NOT NULL, seeded_at timestamptz NOT NULL DEFAULT now());
INSERT INTO demo_runtime.dev_seed(version, fingerprint) VALUES (1, :'seed_fingerprint');
COMMIT;
ANALYZE;
