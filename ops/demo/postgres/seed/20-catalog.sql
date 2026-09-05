CREATE TABLE demo_runtime.subtype_copy (
  subtype_key text PRIMARY KEY,
  name_fr text NOT NULL,
  name_ar text NOT NULL
);

INSERT INTO demo_runtime.subtype_copy VALUES
  ('abrasives', 'Abrasifs', 'مواد كاشطة'),
  ('adhesives-sealants', 'Colles et mastics', 'مواد لاصقة وعزل'),
  ('clamps', 'Serre-joints', 'مشابك تثبيت'),
  ('drain-tools', 'Débouchage', 'أدوات تسليك'),
  ('drill-bits', 'Forets', 'رؤوس مثقاب'),
  ('drills', 'Perceuses', 'مثاقب'),
  ('electrical-supplies', 'Appareillage électrique', 'لوازم كهربائية'),
  ('electrical-testers', 'Testeurs électriques', 'أجهزة فحص كهربائي'),
  ('electrical-tools', 'Outils d’électricien', 'أدوات كهربائي'),
  ('eye-face-protection', 'Protection des yeux et du visage', 'حماية العين والوجه'),
  ('fasteners', 'Visserie et fixation', 'براغي ومثبتات'),
  ('faucets-showers', 'Robinets et douches', 'حنفيات ودش'),
  ('garden-hand-tools', 'Outils de jardin', 'أدوات حديقة يدوية'),
  ('garden-hoses', 'Tuyaux d’arrosage', 'خراطيم سقي'),
  ('garden-power-tools', 'Machines de jardin', 'آلات الحديقة'),
  ('general-hand-tools', 'Outillage à main', 'أدوات يدوية'),
  ('general-hardware', 'Quincaillerie', 'لوازم معدنية'),
  ('grinders', 'Meuleuses', 'جلاخات'),
  ('hammers', 'Marteaux', 'مطارق'),
  ('hand-cutting-tools', 'Outils de coupe manuels', 'أدوات قطع يدوية'),
  ('head-protection', 'Protection de la tête', 'حماية الرأس'),
  ('impact-tools', 'Outils à choc', 'أدوات طرق'),
  ('lighting', 'Éclairage', 'إضاءة'),
  ('measuring-layout', 'Mesure et traçage', 'قياس وتخطيط'),
  ('painting-applicators', 'Application de peinture', 'أدوات طلاء'),
  ('painting-supplies', 'Fournitures de peinture', 'لوازم طلاء'),
  ('painting-tools', 'Machines de peinture', 'آلات طلاء'),
  ('pipe-fittings', 'Raccords et vannes', 'وصلات وصمامات'),
  ('pliers', 'Pinces', 'كماشات'),
  ('plumbing-tools', 'Outillage de plomberie', 'أدوات سباكة'),
  ('power-saws', 'Scies électriques', 'مناشير كهربائية'),
  ('power-tool-accessories', 'Accessoires électroportatifs', 'ملحقات أدوات كهربائية'),
  ('power-tools', 'Outillage électroportatif', 'أدوات كهربائية'),
  ('pruning-tools', 'Outils de taille', 'أدوات تقليم'),
  ('routing-drilling-accessories', 'Accessoires de perçage et fraisage', 'ملحقات حفر وتفريز'),
  ('sanders-polishers', 'Ponceuses et polisseuses', 'آلات صنفرة وتلميع'),
  ('saw-blades', 'Lames de scie', 'شفرات منشار'),
  ('screwdrivers', 'Tournevis', 'مفكات'),
  ('sockets-ratchets', 'Douilles et cliquets', 'مقابس ومفاتيح راتشيت'),
  ('tool-bags', 'Sacs à outils', 'حقائب أدوات'),
  ('tool-boxes', 'Boîtes à outils', 'صناديق أدوات'),
  ('welding-consumables', 'Consommables de soudage', 'مواد لحام'),
  ('work-gloves', 'Gants de travail', 'قفازات عمل'),
  ('work-lights', 'Éclairage de chantier', 'إضاءة ورشات'),
  ('work-safety', 'Sécurité au travail', 'سلامة مهنية'),
  ('workshop-consumables', 'Consommables d’atelier', 'مواد استهلاكية للورشة'),
  ('workshop-equipment', 'Équipement d’atelier', 'معدات ورشة'),
  ('workshop-furniture', 'Mobilier d’atelier', 'أثاث ورشة'),
  ('workshop-machines', 'Machines d’atelier', 'آلات ورشة'),
  ('workshop-organizers', 'Rangement des outils', 'تنظيم الأدوات'),
  ('wrenches', 'Clés', 'مفاتيح ربط');

CREATE TABLE demo_runtime.family_copy (
  family_key text PRIMARY KEY,
  name_fr text NOT NULL,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  featured boolean NOT NULL
);

INSERT INTO demo_runtime.family_copy VALUES
  ('power-tools', 'Outillage électroportatif', 'Power tools', 'أدوات كهربائية', true),
  ('hand-tools', 'Outillage à main', 'Hand tools', 'أدوات يدوية', true),
  ('accessories', 'Accessoires', 'Accessories', 'ملحقات', true),
  ('safety', 'Protection et sécurité', 'Safety', 'حماية وسلامة', false),
  ('electrical', 'Électricité et éclairage', 'Electrical and lighting', 'كهرباء وإضاءة', true),
  ('plumbing', 'Plomberie', 'Plumbing', 'سباكة', true),
  ('garden', 'Jardin', 'Garden', 'حديقة', false),
  ('workshop-storage', 'Atelier et rangement', 'Workshop and storage', 'ورشة وتخزين', true),
  ('painting', 'Peinture', 'Painting', 'طلاء', false),
  ('consumables', 'Quincaillerie et consommables', 'Hardware and consumables', 'لوازم ومواد استهلاكية', true);

INSERT INTO categories (name, name_en, name_ar, slug, featured, properties, created_by, created_by_name)
SELECT name_fr, name_en, name_ar, family_key, featured, '[]',
  'demo-operator', 'Nadia Benali'
FROM demo_runtime.family_copy ORDER BY family_key;

INSERT INTO categories (
  name, name_en, name_ar, slug, parent_id, properties, created_by, created_by_name
)
SELECT copy.name_fr, initcap(replace(copy.subtype_key, '-', ' ')), copy.name_ar,
  copy.subtype_key, parent.id,
  '[{"name":"Marque","type":"text"},{"name":"Référence","type":"text"}]',
  'demo-operator', 'Nadia Benali'
FROM demo_runtime.subtype_copy copy
JOIN (SELECT DISTINCT family_key, subtype_key FROM demo_runtime.catalog_source) source
  USING (subtype_key)
JOIN categories parent ON parent.slug = source.family_key
ORDER BY copy.subtype_key;

INSERT INTO brands (name, slug, mongo_id, featured, created_by, created_by_name)
SELECT min(brand_name), 'brand-' || substr(md5(lower(brand_name)), 1, 12),
  'demo-brand:' || lower(brand_name), false, 'demo-operator', 'Nadia Benali'
FROM (
  SELECT CASE WHEN btrim(source_brand) = '' THEN 'Independent' ELSE btrim(source_brand) END brand_name
  FROM demo_runtime.catalog_source
) source
GROUP BY lower(brand_name) ORDER BY lower(brand_name);

WITH prepared AS (
  SELECT source.*,
    'catalog-' || source_dataset || '-' || lower(source_product_id) product_slug,
    source_dataset || '-' || source_product_id product_key,
    CASE WHEN btrim(source_brand) = '' THEN 'Independent' ELSE btrim(source_brand) END brand_name,
    hashtextextended(source_dataset || ':' || source_product_id, 0) & 2147483647 deterministic_hash
  FROM demo_runtime.catalog_source source
), priced AS (
  SELECT prepared.*,
    round((CASE family_key
      WHEN 'power-tools' THEN 8500 WHEN 'workshop-storage' THEN 6000
      WHEN 'electrical' THEN 1800 WHEN 'plumbing' THEN 2200
      WHEN 'garden' THEN 2500 WHEN 'safety' THEN 1200
      WHEN 'hand-tools' THEN 1500 WHEN 'painting' THEN 1000
      WHEN 'accessories' THEN 900 ELSE 350
    END + mod(deterministic_hash, CASE family_key
      WHEN 'power-tools' THEN 36000 WHEN 'workshop-storage' THEN 30000
      WHEN 'electrical' THEN 16000 WHEN 'plumbing' THEN 14000
      WHEN 'garden' THEN 19000 WHEN 'safety' THEN 9000
      WHEN 'hand-tools' THEN 11000 WHEN 'painting' THEN 8000
      WHEN 'accessories' THEN 9000 ELSE 6000 END)) / 50.0) * 50 price_value
  FROM prepared
)
INSERT INTO products (
  title, title_ar, slug, sku, barcode, description, description_ar, mongo_id,
  price, old_price, purchase_price, active, in_stock, availability_status,
  inventory_quantity, brand_id, category_id, images, archived_at, created_at, updated_at
)
SELECT
  left(copy.name_fr || ' ' || priced.brand_name || ' ' || upper(right(source_product_id, 5)), 180),
  left(copy.name_ar || ' ' || priced.brand_name || ' ' || upper(right(source_product_id, 5)), 180),
  product_slug, 'DEMO-' || upper(source_dataset) || '-' || source_product_id,
  '990' || lpad((row_number() OVER (ORDER BY source_dataset, source_product_id))::text, 10, '0'),
  'Sélection ' || lower(copy.name_fr) || '. Référence de démonstration ' || upper(source_product_id) ||
    CASE WHEN source_color <> '' THEN ', finition ' || left(source_color, 60) ELSE '' END || '.',
  'منتج تجريبي من فئة ' || copy.name_ar || '. المرجع ' || upper(source_product_id) || '.',
  source_dataset || ':' || source_product_id, price_value,
  CASE WHEN mod(deterministic_hash, 5) = 0 THEN price_value + 500 + mod(deterministic_hash, 8) * 250 ELSE NULL END,
  round(price_value * (0.52 + mod(deterministic_hash, 12) / 100.0), 2),
  mod(deterministic_hash, 100) >= 3,
  mod(deterministic_hash, 17) <> 0,
  CASE WHEN mod(deterministic_hash, 17) <> 0 THEN 'in_stock' ELSE 'out_of_stock' END,
  CASE WHEN mod(deterministic_hash, 17) <> 0 THEN 2 + mod(deterministic_hash, 79) ELSE 0 END,
  brand.id, category.id,
  ARRAY(
    SELECT :'asset_origin' || '/bricomaitre-demo/catalog/' || product_key || '/' || position || '.webp'
    FROM generate_series(1, jsonb_array_length(source_image_urls_json)) position
  ),
  CASE WHEN mod(deterministic_hash, 100) < 3 THEN '2025-12-15 09:00:00+00'::timestamptz ELSE NULL END,
  '2022-01-01 08:00:00+00'::timestamptz +
    (mod(deterministic_hash, 126144000)::text || ' seconds')::interval,
  '2025-12-31 20:00:00+00'
FROM priced
JOIN demo_runtime.subtype_copy copy USING (subtype_key)
JOIN brands brand ON lower(brand.name) = lower(priced.brand_name)
JOIN categories category ON category.slug = priced.subtype_key
ORDER BY source_dataset, source_product_id;

CREATE TABLE demo_runtime.merchandise_products (
  placement text NOT NULL,
  sort_order integer NOT NULL,
  product_key text NOT NULL,
  title_fr text NOT NULL,
  title_ar text NOT NULL,
  description_fr text NOT NULL,
  description_ar text NOT NULL,
  PRIMARY KEY (placement, sort_order),
  UNIQUE (product_key)
);

INSERT INTO demo_runtime.merchandise_products VALUES
  ('top', 1, 'esci:B00OJ72LHU',
    'Perceuse-visseuse BLACK+DECKER MATRIX, 20 V',
    'مثقاب ومفك BLACK+DECKER MATRIX بجهد 20 فولت',
    'Un kit compact avec batterie, chargeur et tête interchangeable pour percer et visser sans câble.',
    'طقم مدمج مع بطارية وشاحن ورأس قابل للتبديل للحفر والربط من دون سلك.'),
  ('top', 2, 'esci:B079NBC7JN',
    'Perceuse à percussion Milwaukee FUEL',
    'مثقاب طرقي Milwaukee FUEL',
    'Un moteur sans charbon, une poignée latérale et un mandrin métal pour les perçages soutenus.',
    'محرك من دون فحمات ومقبض جانبي وظرف معدني لأعمال الحفر المتواصلة.'),
  ('top', 3, 'esci:B07457BXJW',
    'Meuleuse sans fil DEWALT DCG413B, 20 V',
    'جلاخة لاسلكية DEWALT DCG413B بجهد 20 فولت',
    'Une meuleuse 20 V compacte avec frein électronique pour couper et ébarber sans câble.',
    'جلاخة مدمجة بجهد 20 فولت وفرامل إلكترونية للقطع والتجليخ من دون سلك.'),
  ('top', 4, 'esci:B078PSS7CT',
    'Projecteur hybride RYOBI ONE+, 18 V',
    'كشاف هجين RYOBI ONE+ بجهد 18 فولت',
    'Un éclairage orientable sur batterie ONE+ ou secteur pour l’atelier comme pour le chantier.',
    'إضاءة قابلة للتوجيه تعمل ببطارية ONE+ أو بالكهرباء للورشة وموقع العمل.'),
  ('workshop', 1, 'esci:B0010DHFTK',
    'Meuleuse Makita 4½ po avec coffret',
    'جلاخة Makita قياس 4.5 بوصة مع حقيبة',
    'Une meuleuse filaire livrée avec disques et coffret rigide pour couper, ébarber et ranger proprement.',
    'جلاخة سلكية مع أقراص وحقيبة صلبة للقطع والتجليخ ثم التخزين المرتب.'),
  ('workshop', 2, 'abo:B004X7I1FC',
    'Sac à outils Denali, 43 pièces',
    'حقيبة أدوات Denali، 43 قطعة',
    'Un assortiment d’outils à main rangé dans un sac ouvert, prêt à passer d’un chantier à l’autre.',
    'مجموعة أدوات يدوية مرتبة في حقيبة مفتوحة وجاهزة للتنقل بين الورشات.'),
  ('workshop', 3, 'esci:B0767NGBP8',
    'Coffret mécanique DEWALT, 205 pièces',
    'طقم ميكانيك DEWALT، 205 قطع',
    'Cliquets 72 dents, douilles et embouts réunis dans un coffret rigide pour intervenir sans multiplier les boîtes.',
    'مفاتيح سقاطة بـ72 سنًا ولقم ورؤوس في حقيبة صلبة للعمل من دون تشتيت الأدوات بين عدة علب.'),
  ('workshop', 4, 'esci:B07NRJBVHT',
    'Étagère d’atelier en acier, 4 niveaux',
    'رف ورشة فولاذي، 4 طبقات',
    'Quatre plateaux réglables et une structure ouverte pour garder les machines, bacs et consommables visibles.',
    'أربع طبقات قابلة للضبط وهيكل مفتوح لإبقاء الآلات والصناديق والمواد المستهلكة في المتناول.'),
  ('measurement', 1, 'esci:B0823HT5FP',
    'Laser vert Huepar 3D, trois plans à 360°',
    'ميزان ليزر أخضر Huepar ثلاثي الأبعاد، 360°',
    'Trois plans laser couvrent murs, sol et plafond pour aligner, mettre à niveau et contrôler les angles droits.',
    'ثلاثة مستويات ليزر تغطي الجدران والأرضية والسقف للمحاذاة والتسوية وضبط الزوايا القائمة.'),
  ('measurement', 2, 'esci:B00IG46NL2',
    'Pied à coulisse numérique Mitutoyo, 150 mm',
    'قدمة قياس رقمية Mitutoyo، 150 مم',
    'Lecture au centième de millimètre, mesure intérieure, extérieure et de profondeur dans un format d’atelier éprouvé.',
    'قراءة حتى جزء من مئة المليمتر لقياس الأبعاد الداخلية والخارجية والعمق بأداة ورشة موثوقة.'),
  ('measurement', 3, 'esci:B00275F5O2',
    'Détecteur d’humidité General Tools MMD4E',
    'كاشف رطوبة General Tools MMD4E',
    'Les pointes sondent bois, plâtre et maçonnerie; l’écran rétroéclairé aide à repérer une fuite avant de refermer.',
    'تختبر المسامير الخشب والجبس والبناء، وتساعد الشاشة المضاءة على كشف التسرب قبل إغلاق موضع العمل.'),
  ('measurement', 4, 'abo:B081RKD96X',
    'Mètre ruban UMI, 8 m',
    'شريط قياس UMI بطول 8 أمتار',
    'Ruban de 8 m, boîtier renforcé et clip métallique pour les mesures quotidiennes.',
    'شريط بطول 8 أمتار وعلبة مقواة ومشبك معدني للقياسات اليومية.'),
  ('safety', 1, 'esci:B008MCUZZS',
    'Masques antipoussière 3M 8210 N95, boîte de 20',
    'أقنعة غبار 3M 8210 N95، علبة 20',
    'Une boîte pour les travaux de ponçage, découpe et balayage qui chargent rapidement l’air en poussière.',
    'علبة لأعمال الصنفرة والقطع والتنظيف التي تملأ هواء الورشة بالغبار بسرعة.'),
  ('safety', 2, 'esci:B07LHDC74K',
    'Masque de soudage Optrel Crystal 2.0',
    'قناع لحام Optrel Crystal 2.0',
    'Filtre auto-obscurcissant et vision claire pour préparer, souder puis contrôler la pièce.',
    'مرشح تعتيم تلقائي ورؤية واضحة لتحضير القطعة ولحامها ثم فحصها.'),
  ('safety', 3, 'esci:B00LB46F5I',
    'Gants anti-impact Mechanix Wear M-Pact',
    'قفازات مقاومة للصدمات Mechanix Wear M-Pact',
    'Renforts sur les articulations, paume amortie et coupe ajustée pour manipuler sans perdre toute la précision.',
    'حماية لمفاصل الأصابع وبطانة ماصة للصدمات وقصة محكمة للعمل مع الحفاظ على الدقة.'),
  ('safety', 4, 'esci:B071RSM598',
    'Surlunettes de protection NoCry',
    'نظارات حماية فوق النظارات الطبية NoCry',
    'Des verres enveloppants transparents qui passent au-dessus de lunettes correctrices sans réduire le champ de vision.',
    'عدسات شفافة محيطة تُلبس فوق النظارات الطبية من دون تضييق مجال الرؤية.' );

UPDATE products SET
  title = merchandise.title_fr,
  title_ar = merchandise.title_ar,
  description = merchandise.description_fr,
  description_ar = merchandise.description_ar,
  active = true,
  in_stock = true,
  availability_status = 'in_stock',
  inventory_quantity = greatest(inventory_quantity, 12),
  archived_at = NULL
FROM (
  SELECT DISTINCT ON (product_key) product_key, title_fr, title_ar,
    description_fr, description_ar
  FROM demo_runtime.merchandise_products
  ORDER BY product_key, CASE WHEN placement = 'top' THEN 0 ELSE 1 END, sort_order
) merchandise
WHERE products.mongo_id = merchandise.product_key;

CREATE TABLE demo_runtime.merchandise_product_ids AS
SELECT merchandise.placement, merchandise.sort_order, products.id AS product_id
FROM demo_runtime.merchandise_products merchandise
JOIN products ON products.mongo_id = merchandise.product_key;

UPDATE brands SET
  featured = true,
  image = :'asset_origin' || '/bricomaitre-demo/merchandising/brands/' || marks.filename,
  updated_at = '2025-12-31 20:00:00+00'
FROM (VALUES
  ('3m', '3m.svg'),
  ('black+decker', 'black-decker.svg'),
  ('dewalt', 'dewalt.svg'),
  ('huepar', 'huepar.svg'),
  ('makita', 'makita.svg'),
  ('milwaukee', 'milwaukee.svg'),
  ('ryobi', 'ryobi.svg'),
  ('vessel', 'vessel.svg')
) marks(brand_name, filename)
WHERE lower(brands.name) = marks.brand_name;

UPDATE categories SET image = sample.image, updated_at = '2025-12-31 20:00:00+00'
FROM (
  SELECT DISTINCT ON (category_id) category_id, images[1] image
  FROM products WHERE category_id IS NOT NULL ORDER BY category_id, active DESC, id
) sample WHERE categories.id = sample.category_id;

UPDATE categories parent SET image = sample.image
FROM (
  SELECT DISTINCT ON (child.parent_id) child.parent_id, child.image
  FROM categories child WHERE child.parent_id IS NOT NULL AND child.image IS NOT NULL
  ORDER BY child.parent_id, child.id
) sample WHERE parent.id = sample.parent_id;

INSERT INTO product_cards (
  product_id, title_ar, title_fr, description_ar, description_fr,
  characteristics_ar, characteristics_fr, sort_order
)
SELECT products.id, cards.title_ar, cards.title_fr,
  cards.description_ar, cards.description_fr,
  cards.characteristics_ar, cards.characteristics_fr, cards.sort_order
FROM (VALUES
  (
    'abo:B07XCVXGPG',
    'طقم حفر وربط UMI، 55 قطعة',
    'Coffret de perçage UMI, 55 pièces',
    'علبة واحدة لحفر الخشب والمعدن والإسمنت، ثم الانتقال إلى الربط من دون البحث عن الرأس المناسب.',
    'Un seul coffret pour percer le bois, le métal et la maçonnerie, puis passer au vissage sans chercher le bon embout.',
    ARRAY['55 ريشة ورأس ربط', 'للخشب والمعدن والإسمنت', 'علبة تنظيم صلبة'],
    ARRAY['55 forets et embouts', 'Bois, métal et maçonnerie', 'Coffret de rangement'],
    1
  ),
  (
    'esci:B073VJPM4Z',
    'ميزان ليزر أخضر Huepar M-9011G',
    'Laser croix vert Huepar M-9011G',
    'خط أفقي وعمودي واضح للتركيب والتبليط، مع ضبط ذاتي سريع وقاعدة مغناطيسية قابلة للدوران.',
    'Une croix verte nette pour la pose et le carrelage, avec mise à niveau rapide et base magnétique pivotante.',
    ARRAY['مدى رؤية حتى 30 مترًا', 'ضبط ذاتي في أقل من 3 ثوانٍ', 'مقاومة للغبار والماء IP54'],
    ARRAY['Visible jusqu’à 30 m', 'Mise à niveau en moins de 3 s', 'Protection IP54'],
    2
  ),
  (
    'esci:B0001Q2VPU',
    'ضاغط هواء Makita MAC5200 بقوة 3 أحصنة',
    'Compresseur Makita MAC5200, 3 HP',
    'مضخة من الحديد المصبوب ومحرك قوي لاستعادة الضغط بسرعة مع تشغيل أبرد وتآكل أقل.',
    'Une pompe en fonte et un moteur de 3 HP pour retrouver la pression plus vite, avec une lubrification pensée pour limiter l’usure.',
    ARRAY['تدفق 6.5 CFM عند 90 PSI', 'مضخة مشحّمة بالزيت', 'مقبض قابل للطي للتخزين'],
    ARRAY['6,5 CFM à 90 PSI', 'Pompe lubrifiée à l’huile', 'Poignée repliable'],
    3
  ),
  (
    'abo:B00NUS5D4C',
    'رف ورشة من 5 طبقات',
    'Étagère d’atelier, 5 niveaux',
    'خمس طبقات مفتوحة لترتيب العلب والعدد والمواد المستهلكة، مع وصول مباشر إلى كل ما تخزنه.',
    'Cinq niveaux ouverts pour ranger les bacs, les outils et les consommables sans perdre de vue ce qui reste.',
    ARRAY['5 طبقات تخزين', 'هيكل أسود بسيط', 'مناسبة للورشة أو المرآب'],
    ARRAY['5 niveaux de rangement', 'Structure noire sobre', 'Pour l’atelier ou le garage'],
    4
  )
) cards(
  product_key, title_ar, title_fr, description_ar, description_fr,
  characteristics_ar, characteristics_fr, sort_order
)
JOIN products ON products.mongo_id = cards.product_key
WHERE products.active AND products.in_stock;

INSERT INTO product_promo_codes (product_id, code, normalized_code, promo_price, active)
SELECT id, 'ATELIER' || lpad(row_number() OVER (ORDER BY id)::text, 2, '0'),
  'atelier' || lpad(row_number() OVER (ORDER BY id)::text, 2, '0'),
  greatest(100, price - 500), true
FROM products WHERE active AND in_stock ORDER BY popularity_score DESC, id LIMIT 80;

INSERT INTO featured_product_groups (
  name, name_ar, cta, cta_ar, link, sort_order, show_at_top_of_products_page, active
)
VALUES
  ('Les essentiels de l’atelier', 'أساسيات الورشة', 'Voir l’équipement', 'عرض التجهيزات', '/fr/categories/workshop-storage', 1, false, true),
  ('Mesurer avant d’intervenir', 'القياس قبل التدخل', 'Voir les instruments', 'عرض أدوات القياس', '/fr/categories/electrical', 2, false, true),
  ('Se protéger sur chaque chantier', 'الحماية في كل ورشة', 'Voir les protections', 'عرض معدات الحماية', '/fr/categories/safety', 3, false, true);

INSERT INTO featured_product_group_products (group_id, product_id)
SELECT groups.id, products.id
FROM demo_runtime.merchandise_products merchandise
JOIN featured_product_groups groups ON groups.sort_order = CASE merchandise.placement
  WHEN 'workshop' THEN 1 WHEN 'measurement' THEN 2 WHEN 'safety' THEN 3 END
JOIN products ON products.mongo_id = merchandise.product_key
WHERE merchandise.placement IN ('workshop', 'measurement', 'safety')
ORDER BY groups.sort_order, merchandise.sort_order;

INSERT INTO asset_banners (
  title, title_ar, image_url, image_url_portrait, image_url_landscape,
  product_id, sort_order, active
)
VALUES
  (
    'Les bons outils. Le travail peut commencer.',
    'الأدوات المناسبة. لنبدأ العمل.',
    :'asset_origin' || '/bricomaitre-demo/merchandising/banners/workshop-wide-lettered.webp',
    :'asset_origin' || '/bricomaitre-demo/merchandising/banners/workshop-mobile-lettered.webp',
    :'asset_origin' || '/bricomaitre-demo/merchandising/banners/workshop-wide-lettered.webp',
    NULL, 1, true
  ),
  (
    'Tracez juste avant de fixer.',
    'حدّد بدقة قبل التثبيت.',
    :'asset_origin' || '/bricomaitre-demo/merchandising/banners/precision-wide-lettered.webp',
    :'asset_origin' || '/bricomaitre-demo/merchandising/banners/precision-mobile-lettered.webp',
    :'asset_origin' || '/bricomaitre-demo/merchandising/banners/precision-wide-lettered.webp',
    NULL, 2, true
  );

INSERT INTO product_attribute_definitions (
  key, name, name_ar, description, data_type, filterable
)
VALUES
  ('demo_source', 'Source catalogue', 'مصدر الكتالوج', 'Origine du jeu de données public.', 'text', false),
  ('catalog_reference', 'Référence catalogue', 'مرجع الكتالوج', 'Identifiant stable de la fiche source.', 'text', true),
  ('finish', 'Finition', 'اللمسة', 'Couleur ou finition déclarée.', 'text', true);

INSERT INTO product_attribute_values (
  product_id, definition_id, value, source, confidence, review_status,
  evidence_summary, created_by, reviewed_by, reviewed_at
)
SELECT products.id, definition.id,
  to_jsonb(CASE definition.key
    WHEN 'demo_source' THEN source.source_dataset
    WHEN 'catalog_reference' THEN source.source_product_id
    ELSE coalesce(nullif(source.source_color, ''), 'Non précisée') END),
  'algorithm', 1, 'verified', 'Generated from the pinned public catalog snapshot.',
  'demo-operator', 'demo-operator', '2025-12-31 20:00:00+00'
FROM products
JOIN demo_runtime.catalog_source source
  ON products.mongo_id = source.source_dataset || ':' || source.source_product_id
CROSS JOIN product_attribute_definitions definition;

INSERT INTO project_types (slug, name, name_ar, description)
SELECT family_key, name_fr, name_ar, 'Famille de projets liée au rayon ' || lower(name_fr) || '.'
FROM demo_runtime.family_copy;

INSERT INTO product_project_uses (
  product_id, project_type_id, suitability, source, confidence, review_status,
  evidence_summary, created_by, reviewed_by, reviewed_at
)
SELECT products.id, project_types.id, 'recommended', 'algorithm', 0.9, 'verified',
  'Assigned from the normalized catalog family.', 'demo-operator', 'demo-operator',
  '2025-12-31 20:00:00+00'
FROM products
JOIN demo_runtime.catalog_source source
  ON products.mongo_id = source.source_dataset || ':' || source.source_product_id
JOIN project_types ON project_types.slug = source.family_key;

WITH paired AS (
  SELECT products.id source_product_id,
    lead(products.id) OVER (PARTITION BY source.subtype_key ORDER BY products.id) target_product_id
  FROM products
  JOIN demo_runtime.catalog_source source
    ON products.mongo_id = source.source_dataset || ':' || source.source_product_id
)
INSERT INTO product_relations (
  source_product_id, target_product_id, relation_type, source,
  confidence, review_status, created_by, reviewed_by, reviewed_at
)
SELECT source_product_id, target_product_id, 'alternative_to', 'algorithm',
  0.82, 'verified', 'demo-operator', 'demo-operator', '2025-12-31 20:00:00+00'
FROM paired WHERE target_product_id IS NOT NULL;

INSERT INTO product_relation_evidence (
  relation_id, evidence_type, source_url, source_label, excerpt, metadata
)
SELECT id, 'other', NULL,
  'Normalized catalog classification', 'Products share the same normalized subtype.',
  '{"synthetic_relation":true}'
FROM product_relations;

INSERT INTO demo_runtime.dataset_metrics VALUES
  ('products', (SELECT count(*) FROM products), 'Qualified public-source catalog products'),
  ('catalog_images', (SELECT sum(cardinality(images)) FROM products), 'Locally served product images'),
  ('brands', (SELECT count(*) FROM brands), 'Distinct source brands'),
  ('categories', (SELECT count(*) FROM categories), 'Parent and subtype categories');
