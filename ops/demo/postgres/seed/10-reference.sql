CREATE TABLE demo_runtime.wilaya_source (
  code integer PRIMARY KEY,
  name text NOT NULL,
  name_ar text NOT NULL,
  name_ascii text NOT NULL,
  commune_count integer NOT NULL
);
CREATE TABLE demo_runtime.commune_source (
  commune_id integer PRIMARY KEY,
  wilaya_code integer NOT NULL,
  name text NOT NULL,
  name_ar text NOT NULL
);

\copy demo_runtime.wilaya_source FROM '/data/algeria-wilayas.csv' WITH (FORMAT csv, HEADER true)
\copy demo_runtime.commune_source FROM '/data/algeria-communes.csv' WITH (FORMAT csv, HEADER true)

INSERT INTO admin.ecotrack_wilayas (wilaya_id, name)
SELECT code, name FROM demo_runtime.wilaya_source ORDER BY code;

INSERT INTO admin.ecotrack_communes (commune_id, wilaya_id, name, postal_code, has_stop_desk)
SELECT commune_id, wilaya_code, name,
  lpad(wilaya_code::text, 2, '0') || lpad(row_number() OVER (
    PARTITION BY wilaya_code ORDER BY commune_id
  )::text, 3, '0'),
  row_number() OVER (PARTITION BY wilaya_code ORDER BY commune_id) = 1
    OR mod(commune_id, 11) = 0
FROM demo_runtime.commune_source;

INSERT INTO admin.ecotrack_service_fees (service_type, wilaya_id, home_fee, stop_desk_fee)
SELECT service_type, code,
  450 + ceil(code / 8.0) * 75,
  300 + ceil(code / 10.0) * 50
FROM demo_runtime.wilaya_source
CROSS JOIN unnest(ARRAY['livraison', 'pickup', 'echange', 'recouvrement', 'retours']) service_type;

INSERT INTO admin.ecotrack_weight_fees (
  service_type, home_surcharge, stop_desk_surcharge, per_additional_kg, starts_at_kg
)
SELECT service_type, 100, 75, 50, 5
FROM unnest(ARRAY['livraison', 'pickup', 'echange', 'recouvrement']) service_type;

INSERT INTO admin.ecotrack_sync_runs (
  trigger, status, request_count, wilaya_count, commune_count,
  service_fee_count, weight_fee_count, rate_limit_snapshot, started_at, finished_at
)
VALUES (
  'demo-template', 'succeeded', 7, 58, 1541, 290, 4,
  '{"remaining": 993, "source": "deterministic-mock"}',
  '2025-12-31 21:00:00+00', '2025-12-31 21:00:03+00'
);

INSERT INTO admin.role_definitions (name, slug, description, is_system)
VALUES
  ('Viewer', 'viewer', 'Read-only commerce access.', true),
  ('Customer operations', 'customer-operations', 'Order confirmation and fulfilment work.', false),
  ('Catalog manager', 'catalog-manager', 'Catalog, inventory, and storefront merchandising.', false),
  ('Developer', 'developer', 'Full access to the isolated public demonstration.', true);

INSERT INTO admin.role_definition_permissions (role_id, permission)
SELECT role.id, permission::admin.admin_role_permission
FROM admin.role_definitions role
CROSS JOIN unnest(ARRAY[
  'products_write', 'orders_write', 'assets_write', 'brands_categories_write',
  'bulletin_moderate', 'ops_view', 'analytics_manage', 'settings_manage'
]) permission
WHERE role.slug = 'developer';

INSERT INTO admin.role_definition_permissions (role_id, permission)
SELECT role.id, permission::admin.admin_role_permission
FROM admin.role_definitions role
CROSS JOIN unnest(ARRAY['orders_write', 'ops_view']) permission
WHERE role.slug = 'customer-operations';

INSERT INTO admin.role_definition_permissions (role_id, permission)
SELECT role.id, permission::admin.admin_role_permission
FROM admin.role_definitions role
CROSS JOIN unnest(ARRAY['products_write', 'assets_write', 'brands_categories_write']) permission
WHERE role.slug = 'catalog-manager';

INSERT INTO admin.users (id, name, email, email_verified_flag, role, role_definition_id, created_at)
SELECT account.id, account.name, account.email, true,
  account.role::admin.admin_user_role, definition.id, account.created_at
FROM (VALUES
  ('demo-operator', 'Nadia Benali', 'operator@demo.bricomaitre.invalid', 'developer', 'developer', '2022-01-02'::timestamptz),
  ('demo-amine', 'Amine Kaci', 'amine@demo.bricomaitre.invalid', 'employee', 'customer-operations', '2022-03-14'::timestamptz),
  ('demo-sarah', 'Sarah Meziane', 'sarah@demo.bricomaitre.invalid', 'employee', 'customer-operations', '2023-01-09'::timestamptz),
  ('demo-yacine', 'Yacine Saadi', 'yacine@demo.bricomaitre.invalid', 'employee', 'catalog-manager', '2023-06-21'::timestamptz),
  ('demo-lina', 'Lina Boudiaf', 'lina@demo.bricomaitre.invalid', 'employee', 'catalog-manager', '2024-02-12'::timestamptz),
  ('demo-viewer', 'Public Viewer', 'viewer@demo.bricomaitre.invalid', 'viewer', 'viewer', '2025-01-05'::timestamptz)
) account(id, name, email, role, role_slug, created_at)
JOIN admin.role_definitions definition ON definition.slug = account.role_slug;

INSERT INTO admin.user_access_grants (email, role, role_definition_id)
SELECT email, role, role_definition_id FROM admin.users;

INSERT INTO storefront_announcements (locale, message, active, created_by, updated_by)
VALUES
  ('fr', 'Livraison dans 58 wilayas. Confirmation téléphonique avant expédition.', true, 'demo-operator', 'demo-operator'),
  ('ar', 'التوصيل إلى 58 ولاية. يتم تأكيد الطلب هاتفيا قبل الإرسال.', true, 'demo-operator', 'demo-operator'),
  ('en', 'Delivery across 58 wilayas. Orders are confirmed by phone before dispatch.', false, 'demo-operator', 'demo-operator');

INSERT INTO storefront_settings (
  id, contact_phone, phone_enabled, contact_email, address, map_url,
  facebook_url, ai_assistant_enabled, ai_model
)
VALUES (
  1, '0550000000', true, 'contact@demo.bricomaitre.invalid',
  'Zone commerciale de démonstration, Algérie',
  'https://maps.example.invalid/demo', 'https://social.example.invalid/demo',
  false, 'local-demo-disabled'
);

INSERT INTO admin.profit_tracker_settings (id, fx_rate, default_return_rate, rest_from)
VALUES (1, 150, 13.5, NULL);

INSERT INTO admin.profit_tracker_operating_costs (name, amount_dzd, period, start_date)
VALUES
  ('Infrastructure', 2550, 'monthly', '2022-01-01'),
  ('Emballage et étiquettes', 18000, 'monthly', '2022-01-01'),
  ('Téléphone et confirmation', 6500, 'monthly', '2022-01-01'),
  ('Équipement de l’entrepôt', 135000, 'once', '2023-05-01');

INSERT INTO ai_pricing_policies (id, default_minimum_gross_margin, allow_request_override, updated_by)
VALUES (1, 0.18, true, 'operator@demo.bricomaitre.invalid');
