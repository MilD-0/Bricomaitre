INSERT INTO admin.import_batches (
  batch_id, file_name, imported_at, total_rows, matched_orders,
  unmatched_references, unmatched_details, date_range_start, date_range_end
)
SELECT 'history-' || to_char(month_start, 'YYYY-MM'),
  'carrier-settlement-' || to_char(month_start, 'YYYY-MM') || '.xlsx',
  month_start + interval '1 month 2 days',
  count(processed.id), count(processed.id), '{}', '[]', month_start,
  (month_start + interval '1 month - 1 day')::date
FROM demo_runtime.timeline timeline
CROSS JOIN LATERAL generate_series(
  date_trunc('month', timeline.history_start)::date,
  date_trunc('month', timeline.history_end)::date,
  interval '1 month'
) month_start
LEFT JOIN admin.processed_orders processed
  ON date_trunc('month', processed.order_created_at) = month_start
GROUP BY month_start;

INSERT INTO admin.ad_spend_import_batches (
  batch_id, file_name, rate, total_rows, imported_rows, updated_rows,
  uploaded_by_email, uploaded_by_name, imported_at
)
SELECT 'ads-' || to_char(month_start, 'YYYY-MM'),
  'campaign-spend-' || to_char(month_start, 'YYYY-MM') || '.csv',
  150, count(insight.id), count(insight.id), 0,
  'operator@demo.bricomaitre.invalid', 'Nadia Benali',
  month_start + interval '1 month 1 day'
FROM demo_runtime.timeline timeline
CROSS JOIN LATERAL generate_series(
  date_trunc('month', timeline.history_start)::date,
  date_trunc('month', timeline.history_end)::date,
  interval '1 month'
) month_start
LEFT JOIN meta_ads_daily_insights insight
  ON date_trunc('month', insight.day::timestamp) = month_start
GROUP BY month_start;

INSERT INTO admin.ad_costs (
  date, platform, campaign_name, campaign_id, spend, impressions, clicks,
  conversions, reach, notes, import_batch_id, created_at, updated_at
)
SELECT day, 'facebook', campaign_name, campaign_id, spend,
  impressions::integer, clicks::integer, purchases::integer, reach::integer,
  'Imported from the deterministic provider dataset.',
  'ads-' || to_char(day, 'YYYY-MM'), synced_at, synced_at
FROM meta_ads_daily_insights;

INSERT INTO admin.action_logs (
  resource, entity_type, entity_id, entity_label, operation,
  before_state, after_state, created_by, created_by_name,
  is_reversible, created_at, updated_at
)
SELECT CASE event_number % 5
    WHEN 0 THEN 'orders' WHEN 1 THEN 'products' WHEN 2 THEN 'inventory'
    WHEN 3 THEN 'assets' ELSE 'categories' END,
  CASE event_number % 5
    WHEN 0 THEN 'order' WHEN 1 THEN 'product' WHEN 2 THEN 'product'
    WHEN 3 THEN 'featured_group' ELSE 'category' END,
  CASE WHEN event_number % 5 = 0 THEN 1 + mod(event_number * 191, 249000)
    ELSE 1 + mod(event_number * 97, 3884) END,
  CASE event_number % 5
    WHEN 0 THEN 'Commande DEMO-' || lpad(event_number::text, 6, '0')
    WHEN 1 THEN 'Fiche produit ' || event_number
    WHEN 2 THEN 'Stock produit ' || event_number
    WHEN 3 THEN 'Sélection atelier' ELSE 'Rayon catalogue' END,
  CASE event_number % 6
    WHEN 0 THEN 'update' WHEN 1 THEN 'status_change' WHEN 2 THEN 'inventory_adjustment'
    WHEN 3 THEN 'create' WHEN 4 THEN 'archive' ELSE 'restore' END,
  jsonb_build_object('state', 'before', 'synthetic', true),
  jsonb_build_object('state', 'after', 'synthetic', true, 'sequence', event_number),
  (ARRAY['operator@demo.bricomaitre.invalid','amine@demo.bricomaitre.invalid',
    'sarah@demo.bricomaitre.invalid','yacine@demo.bricomaitre.invalid'])[1 + mod(event_number, 4)],
  (ARRAY['Nadia Benali','Amine Kaci','Sarah Meziane','Yacine Saadi'])[1 + mod(event_number, 4)],
  event_number % 7 <> 0,
  timeline.history_start::timestamptz
    + (mod(event_number * 104729, 145152000)::text || ' seconds')::interval,
  timeline.history_start::timestamptz
    + (mod(event_number * 104729, 145152000)::text || ' seconds')::interval
FROM generate_series(1, 3200) event_number
CROSS JOIN demo_runtime.timeline timeline;

INSERT INTO admin.bulletin_tags (name, slug, created_at, updated_at)
VALUES
  ('Opérations', 'operations', current_date - 1709, now()),
  ('Catalogue', 'catalogue', current_date - 1709, now()),
  ('Livraison', 'livraison', current_date - 1709, now()),
  ('Suivi', 'suivi', current_date - 1709, now());

INSERT INTO admin.bulletin_posts (
  author_id, author_name, author_email, title, body, pinned, created_at, updated_at
)
SELECT account.id, account.name, account.email,
  (ARRAY[
    'Priorités de confirmation pour la semaine',
    'Contrôle des étiquettes avant départ',
    'Réassort des consommables atelier',
    'Retour sur les commandes sans réponse',
    'Préparation de la campagne de fin de mois',
    'Vérification des tarifs de livraison'
  ])[1 + mod(post_number, 6)],
  (ARRAY[
    'La file est répartie par ancienneté. Commencer par les commandes du matin et consigner chaque appel.',
    'Vérifier le nom, la commune, le montant et le mode de livraison avant de joindre les étiquettes au lot.',
    'Le stock de disques, forets et gants doit être rapproché de la liste d’achat avant la prochaine réception.',
    'Deux tentatives espacées sont attendues. L’historique doit expliquer clairement la décision suivante.',
    'Les produits mis en avant ont été contrôlés côté stock, galerie et marge.',
    'Les grilles de 58 wilayas ont été synchronisées. Signaler toute différence avant de poster un lot.'
  ])[1 + mod(post_number, 6)],
  post_number IN (1, 2),
  current_date::timestamptz - interval '80 days' + (post_number * interval '4 days'),
  current_date::timestamptz - interval '80 days' + (post_number * interval '4 days 2 hours')
FROM generate_series(1, 18) post_number
JOIN LATERAL (
  SELECT id, name, email FROM admin.users
  WHERE email <> 'viewer@demo.bricomaitre.invalid'
  ORDER BY id OFFSET mod(post_number, 5) LIMIT 1
) account ON true;

INSERT INTO admin.bulletin_post_tags (post_id, tag_id)
SELECT post.id, 1 + mod(post.id, 4) FROM admin.bulletin_posts post;

INSERT INTO admin.bulletin_replies (
  post_id, author_id, author_name, author_email, body, created_at, updated_at
)
SELECT post.id, account.id, account.name, account.email,
  CASE reply_number WHEN 1 THEN 'Pris en compte pour le prochain passage.'
    ELSE 'Contrôle terminé, aucune anomalie sur le lot de démonstration.' END,
  post.created_at + (reply_number * interval '3 hours'),
  post.created_at + (reply_number * interval '3 hours')
FROM admin.bulletin_posts post CROSS JOIN generate_series(1, 2) reply_number
JOIN LATERAL (
  SELECT id, name, email FROM admin.users
  WHERE email <> post.author_email AND email <> 'viewer@demo.bricomaitre.invalid'
  ORDER BY id OFFSET mod(post.id + reply_number, 4) LIMIT 1
) account ON true;

INSERT INTO admin.bulletin_post_reactions (
  post_id, user_id, user_name, user_email, emoji, created_at, updated_at
)
SELECT post.id, account.id, account.name, account.email,
  CASE WHEN mod(post.id, 2) = 0 THEN '👍' ELSE '✅' END,
  post.created_at + interval '1 hour', post.created_at + interval '1 hour'
FROM admin.bulletin_posts post
JOIN LATERAL (
  SELECT id, name, email FROM admin.users
  WHERE email <> post.author_email ORDER BY id LIMIT 1
) account ON true;

WITH order_sample AS (
  SELECT array_agg(id ORDER BY created_at DESC) order_ids
  FROM (
    SELECT id, created_at FROM orders
    WHERE confirmed IN (4, 10)
    ORDER BY created_at DESC LIMIT 12
  ) picked
), product_sample AS (
  SELECT jsonb_agg(jsonb_build_object(
    'draftId', 'product:' || id,
    'productId', id,
    'brandId', brand_id,
    'brandName', coalesce((SELECT name FROM brands WHERE brands.id = products.brand_id), 'Independent'),
    'title', title,
    'quantity', 3 + mod(id, 7),
    'unitPrice', price,
    'purchasePrice', purchase_price,
    'thumbnailUrl', images[1],
    'inventoryQuantity', inventory_quantity,
    'inventoryDecreaseQuantity', least(inventory_quantity, 3 + mod(id, 7)),
    'inventoryShortageQuantity', greatest(0, 3 + mod(id, 7) - inventory_quantity),
    'inventoryAppliedQuantity', 0,
    'inventoryActionEligible', inventory_quantity > 0,
    'notes', jsonb_build_array('Prévu pour le prochain réassort.'),
    'checked', mod(id, 3) = 0,
    'isCustom', false,
    'generatedAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ) ORDER BY popularity_score DESC, id) items
  FROM (SELECT * FROM products WHERE active ORDER BY popularity_score DESC, id LIMIT 18) products
)
INSERT INTO admin.shopping_list_drafts (
  scope_key, source_mode, order_ids, title, draft_items, generated_items,
  orders_snapshot, revision, created_by, created_by_name, updated_by,
  updated_by_name, created_at, updated_at
)
SELECT 'status:confirmed', 'confirmed', order_sample.order_ids,
  'Réassort des commandes confirmées', product_sample.items, product_sample.items,
  '[]', 3, 'operator@demo.bricomaitre.invalid', 'Nadia Benali',
  'operator@demo.bricomaitre.invalid', 'Nadia Benali',
  now() - interval '2 days', now() - interval '2 days' + interval '30 minutes'
FROM order_sample CROSS JOIN product_sample;

CREATE TABLE demo_runtime.landing_page_products (
  product_key text PRIMARY KEY,
  sort_order integer NOT NULL UNIQUE,
  title_fr text NOT NULL,
  title_ar text NOT NULL,
  description_fr text NOT NULL,
  description_ar text NOT NULL
);

INSERT INTO demo_runtime.landing_page_products VALUES
  (
    'abo:B07XCVXGPG', 1,
    'Coffret de forets et embouts UMI, 55 pièces',
    'طقم ريش ورؤوس UMI، 55 قطعة',
    'Un coffret compact pour passer du perçage au vissage sans éparpiller les accessoires dans l’atelier.',
    'طقم مدمج يجمع لوازم الحفر والربط ويحافظ على ترتيبها في الورشة.'
  ),
  (
    'abo:B081RKD96X', 2,
    'Mètre ruban UMI, 8 m',
    'شريط قياس UMI بطول 8 أمتار',
    'Une portée confortable et un boîtier robuste pour les prises de mesure quotidiennes sur chantier.',
    'مدى عملي وعلبة متينة لقياسات الورشة وموقع العمل اليومية.'
  ),
  (
    'abo:B000NDOEMY', 3,
    'Jeu de tournevis Denali pour l’atelier',
    'طقم مفكات Denali للورشة',
    'Les profils essentiels réunis dans un même jeu pour le montage, le réglage et l’entretien courant.',
    'المقاسات الأساسية في طقم واحد للتركيب والضبط والصيانة اليومية.'
  ),
  (
    'abo:B000NLWQ8A', 4,
    'Visseuse à chocs Denali',
    'مفك صدمات Denali',
    'Un outil compact destiné aux assemblages répétés et aux fixations qui demandent davantage de couple.',
    'أداة مدمجة لأعمال التجميع المتكررة والربط الذي يحتاج إلى عزم أعلى.'
  ),
  (
    'abo:B000NLYRIM', 5,
    'Scie circulaire Denali',
    'منشار دائري Denali',
    'Une scie d’atelier directe et maniable pour préparer des coupes régulières dans les travaux courants.',
    'منشار عملي وسهل التوجيه للقصات المنتظمة في أعمال الورشة المعتادة.'
  ),
  (
    'abo:B000VDI8UK', 6,
    'Projecteur de chantier Denali',
    'مصباح موقع Denali',
    'Un éclairage de travail stable pour garder la zone de coupe, de montage ou de contrôle bien lisible.',
    'إضاءة عمل ثابتة تُبقي منطقة القص أو التركيب أو الفحص واضحة.'
  );

UPDATE products SET
  title = campaign.title_fr,
  title_ar = campaign.title_ar,
  description = campaign.description_fr,
  description_ar = campaign.description_ar
FROM demo_runtime.landing_page_products campaign
WHERE products.mongo_id = campaign.product_key;

INSERT INTO landing_pages (
  product_id, locale, slug, status, draft_revision, published_revision,
  created_by, updated_by, created_at, updated_at, published_at
)
SELECT product.id, locale::landing_page_locale,
  CASE WHEN locale = 'fr' THEN product.slug ELSE product.slug || '-ar' END,
  CASE WHEN page_number <= 4 THEN 'published' ELSE 'draft' END::landing_page_status,
  1, CASE WHEN page_number <= 4 THEN 1 END,
  'operator@demo.bricomaitre.invalid', 'operator@demo.bricomaitre.invalid',
  current_date::timestamptz - interval '70 days' + (campaign.sort_order * interval '1 day'),
  current_date::timestamptz - interval '40 days' + (campaign.sort_order * interval '1 day'),
  CASE WHEN campaign.sort_order <= 4 THEN current_date::timestamptz - interval '40 days'
    + (campaign.sort_order * interval '1 day') END
FROM demo_runtime.landing_page_products campaign
JOIN products product ON product.mongo_id = campaign.product_key
CROSS JOIN unnest(ARRAY['fr','ar']) locale
CROSS JOIN LATERAL (SELECT campaign.sort_order AS page_number) numbered;

INSERT INTO landing_page_revisions (
  landing_page_id, revision, schema_version, document, source, created_by, created_at
)
SELECT page.id, 1, 2,
  jsonb_build_object(
    'schemaVersion', 2,
    'theme', jsonb_build_object('accent', CASE WHEN page.locale = 'ar' THEN 'teal' ELSE 'orange' END,
      'density', 'comfortable', 'shell', 'campaign'),
    'seo', jsonb_build_object('title', left(product.title, 70),
      'description', left(CASE WHEN page.locale = 'ar'
        THEN 'صفحة عرض تجريبية لأداة عملية مع الدفع عند الاستلام.'
        ELSE 'Une sélection pratique pour l’atelier, avec paiement à la livraison.' END, 170),
      'indexable', false),
    'blocks', jsonb_build_array(
      jsonb_build_object('id','hero','type','product-hero','variant','product-stage',
        'heading', CASE WHEN page.locale = 'ar' THEN product.title_ar ELSE product.title END,
        'subheading', CASE WHEN page.locale = 'ar' THEN product.description_ar ELSE product.description END,
        'imageUrl', product.images[1], 'imageAlt', product.title,
        'primaryCtaLabel', CASE WHEN page.locale = 'ar' THEN 'اطلب الآن' ELSE 'Commander maintenant' END,
        'showAddToCart', true),
      jsonb_build_object('id','benefits','type','benefit-grid','variant','compact',
        'heading', CASE WHEN page.locale = 'ar' THEN 'لماذا هذا الاختيار؟' ELSE 'Pourquoi ce choix ?' END,
        'items', jsonb_build_array(
          jsonb_build_object('title',CASE WHEN page.locale = 'ar' THEN 'جاهز للعمل' ELSE 'Prêt à travailler' END,
            'description',CASE WHEN page.locale = 'ar' THEN 'مخزون وسعر واضحان.' ELSE 'Stock et prix clairement indiqués.' END,'icon','tool'),
          jsonb_build_object('title',CASE WHEN page.locale = 'ar' THEN 'تأكيد هاتفي' ELSE 'Confirmation téléphonique' END,
            'description',CASE WHEN page.locale = 'ar' THEN 'نتحقق من الطلب قبل الإرسال.' ELSE 'La commande est vérifiée avant expédition.' END,'icon','phone'))),
      jsonb_build_object('id','final','type','final-cta','variant','solid',
        'heading', CASE WHEN page.locale = 'ar' THEN 'اطلبها الآن' ELSE 'Équipez votre atelier' END,
        'body', CASE WHEN page.locale = 'ar' THEN 'الدفع عند الاستلام.' ELSE 'Paiement à la livraison.' END,
        'primaryCtaLabel', CASE WHEN page.locale = 'ar' THEN 'اطلب الآن' ELSE 'Commander' END,
        'imageUrl', product.images[2], 'imageAlt', product.title)
    )
  ), 'admin', 'operator@demo.bricomaitre.invalid', page.created_at
FROM landing_pages page JOIN products product ON product.id = page.product_id;

INSERT INTO product_slug_history (product_id, slug, replaced_at)
SELECT id, slug || '-ancienne-reference', '2025-06-01 09:00:00+00'
FROM products WHERE mod(id, 137) = 0;

INSERT INTO ai_conversations (
  surface, actor_id, session_key, title, created_at, updated_at
)
SELECT CASE WHEN mod(conversation_number, 5) < 3 THEN 'admin' ELSE 'storefront' END::ai_surface,
  CASE WHEN mod(conversation_number, 5) < 3 THEN 'operator@demo.bricomaitre.invalid' END,
  'historical-conversation-' || conversation_number,
  (ARRAY[
    'Préparer le lot de commandes à poster',
    'Repérer les produits à réapprovisionner',
    'Comparer la marge par catégorie',
    'Trouver une perceuse pour un atelier mobile',
    'Analyser les recherches sans résultat',
    'Améliorer une fiche produit'
  ])[1 + mod(conversation_number, 6)],
  current_date::timestamptz - interval '730 days'
    + power(conversation_number / 600.0, 0.82) * interval '729 days'
    + (mod(conversation_number * 7919, 21600)::text || ' seconds')::interval,
  current_date::timestamptz - interval '730 days'
    + power(conversation_number / 600.0, 0.82) * interval '729 days'
    + (mod(conversation_number * 7919, 21600)::text || ' seconds')::interval
    + interval '8 minutes'
FROM generate_series(1, 600) conversation_number;

INSERT INTO ai_messages (conversation_id, role, content, created_at)
SELECT conversation.id, CASE WHEN message_number IN (1, 3) THEN 'user' ELSE 'assistant' END,
  CASE message_number
    WHEN 1 THEN jsonb_build_object('text', conversation.title)
    WHEN 2 THEN jsonb_build_object('text', 'J’ai vérifié les données concernées et préparé une synthèse liée aux enregistrements de démonstration.',
      'toolResults', jsonb_build_array(jsonb_build_object('toolName','query_analytics','status','completed','output',jsonb_build_object('rows',12))))
    WHEN 3 THEN jsonb_build_object('text', 'Montre-moi les éléments les plus importants et les actions possibles.')
    ELSE jsonb_build_object('text', 'Les priorités sont classées par impact. Je peux préparer une proposition réversible pour les éléments sélectionnés.',
      'feedback', CASE WHEN mod(conversation.id, 9) = 0 THEN 'not_helpful' ELSE 'helpful' END)
  END,
  conversation.created_at + (message_number * interval '2 minutes')
FROM ai_conversations conversation CROSS JOIN generate_series(1, 4) message_number;

INSERT INTO ai_runs (
  conversation_id, surface, task, status, model, prompt_version, actor_id,
  input_tokens, output_tokens, total_tokens, error_code, started_at, completed_at
)
SELECT conversation.id, conversation.surface,
  CASE WHEN conversation.surface = 'admin' THEN 'admin_chat' ELSE 'shopping_assistant' END,
  CASE
    WHEN mod(conversation.id * 13 + run_number * 17, 47) < 2 THEN 'failed'
    WHEN mod(conversation.id * 19 + run_number * 11, 113) = 6 THEN 'cancelled'
    ELSE 'completed'
  END::ai_run_status,
  'openai/gpt-5.6-luna',
  'demo-v1', conversation.actor_id,
  520 + mod(conversation.id * run_number, 900), 120 + mod(conversation.id * run_number, 480),
  640 + mod(conversation.id * run_number, 1380),
  CASE WHEN mod(conversation.id * 13 + run_number * 17, 47) < 2 THEN 'provider_timeout' END,
  conversation.created_at + (run_number * interval '2 minutes'),
  conversation.created_at + (run_number * interval '2 minutes')
    + ((1050 + mod(conversation.id * 37 + run_number * 211, 2350))::text || ' milliseconds')::interval
FROM ai_conversations conversation CROSS JOIN generate_series(1, 4) run_number;

INSERT INTO ai_tool_calls (
  run_id, tool_name, status, input, output, error_code, started_at, completed_at
)
SELECT run.id,
  CASE mod(run.id, 6) WHEN 0 THEN 'query_analytics' WHEN 1 THEN 'inspect_orders'
    WHEN 2 THEN 'inspect_products' WHEN 3 THEN 'inspect_inventory'
    WHEN 4 THEN 'search_catalog' ELSE 'inspect_landing_pages' END,
  CASE run.status
    WHEN 'failed' THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'completed'
  END,
  jsonb_build_object('scope','deterministic-demo'),
  CASE WHEN run.status = 'completed' THEN jsonb_build_object('matched', 12, 'synthetic', true) END,
  run.error_code, run.started_at + interval '200 milliseconds', run.completed_at
FROM ai_runs run WHERE mod(run.id, 5) <> 0;

INSERT INTO ai_proposals (
  run_id, proposal_type, status, entity_type, entity_id, source_updated_at,
  payload, reasoning, evidence, confidence, requested_by, reviewed_by,
  reviewed_at, applied_at, expires_at, created_at, updated_at
)
SELECT run.id,
  (ARRAY['product_content','product_relation','product_category'])[1 + mod(run.id, 3)],
  CASE WHEN mod(run.id, 7) = 0 THEN 'applied' ELSE 'proposed' END::ai_proposal_status,
  'products', product.id, product.updated_at,
  jsonb_build_object('before', jsonb_build_object('title', product.title),
    'changes', jsonb_build_object('description', 'Proposition concise fondée sur les attributs vérifiés du catalogue.')),
  'The catalog evidence supports this bounded, reviewable change.',
  jsonb_build_array(jsonb_build_object('label','Verified catalog attributes','excerpt','Source, subtype, price, and stock were inspected.')),
  0.72 + mod(run.id, 25) / 100.0,
  'operator@demo.bricomaitre.invalid',
  CASE WHEN mod(run.id, 7) = 0 THEN 'operator@demo.bricomaitre.invalid' END,
  CASE WHEN mod(run.id, 7) = 0 THEN run.completed_at + interval '2 minutes' END,
  CASE WHEN mod(run.id, 7) = 0 THEN run.completed_at + interval '3 minutes' END,
  '2030-01-01', run.completed_at, run.completed_at
FROM (SELECT * FROM ai_runs WHERE surface = 'admin' AND status = 'completed' ORDER BY id LIMIT 360) run
JOIN products product ON product.id = 1 + mod(run.id * 97, 3884);

INSERT INTO meta_ads_sync_runs (
  trigger, status, api_version, account_id, account_currency, account_timezone,
  since_day, until_day, pages_fetched, rows_fetched, rows_upserted, usage,
  error_code, error_message, started_at, completed_at
)
SELECT 'scheduled', CASE WHEN mod(run_number, 17) = 0 THEN 'failed' ELSE 'succeeded' END,
  'v25.0', 'demo-account', 'EUR', 'Africa/Algiers', month_start::date,
  (month_start + interval '1 month - 1 day')::date, 3, 90, 90,
  jsonb_build_object('call_count', 3, 'deterministic', true),
  CASE WHEN mod(run_number, 17) = 0 THEN 'provider_timeout' END,
  CASE WHEN mod(run_number, 17) = 0 THEN 'Deterministic mock timeout.' END,
  month_start + interval '1 month 1 hour', month_start + interval '1 month 1 hour 5 seconds'
FROM (
  SELECT month_start, row_number() OVER (ORDER BY month_start) run_number
  FROM generate_series('2022-01-01'::date, '2025-12-01'::date, interval '1 month') month_start
) runs;

INSERT INTO search_console_sync_runs (
  trigger, status, site_url, since_day, until_day, totals_fetched,
  detail_rows_fetched, appearances_fetched, urls_inspected,
  error_code, error_message, started_at, completed_at
)
SELECT 'scheduled', CASE WHEN mod(run_number, 19) = 0 THEN 'failed' ELSE 'succeeded' END,
  'sc-domain:demo.bricomaitre.invalid', month_start::date,
  (month_start + interval '1 month - 1 day')::date,
  30, 120, 60, 4,
  CASE WHEN mod(run_number, 19) = 0 THEN 'provider_timeout' END,
  CASE WHEN mod(run_number, 19) = 0 THEN 'Deterministic mock timeout.' END,
  month_start + interval '1 month 2 hours', month_start + interval '1 month 2 hours 8 seconds'
FROM (
  SELECT month_start, row_number() OVER (ORDER BY month_start) run_number
  FROM generate_series('2023-01-01'::date, '2025-12-01'::date, interval '1 month') month_start
) runs;

INSERT INTO meta_event_daily_rollups (
  day, event_name, total, pixel_fired, capi_sent, delivered, failed,
  skipped, last_occurred_at, created_at, updated_at
)
SELECT overall.day, event_name,
  CASE event_name WHEN 'PageView' THEN overall.page_views
    WHEN 'ViewContent' THEN overall.product_views WHEN 'AddToCart' THEN overall.add_to_carts
    WHEN 'InitiateCheckout' THEN overall.checkout_starts ELSE overall.purchases END,
  CASE event_name WHEN 'PageView' THEN overall.page_views
    WHEN 'ViewContent' THEN overall.product_views WHEN 'AddToCart' THEN overall.add_to_carts
    WHEN 'InitiateCheckout' THEN overall.checkout_starts ELSE overall.purchases END,
  CASE WHEN event_name IN ('Lead','Purchase') THEN overall.purchases ELSE 0 END,
  CASE WHEN event_name IN ('Lead','Purchase') THEN greatest(0, overall.purchases - 1) ELSE 0 END,
  CASE WHEN event_name IN ('Lead','Purchase') AND mod(extract(doy FROM overall.day)::integer, 41) = 0 THEN 1 ELSE 0 END,
  0, overall.day::timestamptz + interval '22 hours',
  overall.day::timestamptz + interval '1 day', overall.day::timestamptz + interval '1 day'
FROM analytics_daily_rollups overall
CROSS JOIN unnest(ARRAY['PageView','ViewContent','AddToCart','InitiateCheckout','Lead','Purchase']) event_name
WHERE overall.dimension = 'overall';

INSERT INTO admin.reporting_snapshot_runs (
  run_id, trigger, status, pending_refresh, started_at, completed_at,
  created_at, updated_at
)
SELECT 'historical-report-' || to_char(month_start, 'YYYY-MM'), 'scheduled',
  'completed', false, month_start + interval '1 month 3 hours',
  month_start + interval '1 month 3 hours 40 seconds',
  month_start + interval '1 month 3 hours', month_start + interval '1 month 3 hours 40 seconds'
FROM generate_series('2022-01-01'::date, '2025-12-01'::date, interval '1 month') month_start;

INSERT INTO demo_runtime.dataset_metrics VALUES
  ('action_logs', (SELECT count(*) FROM admin.action_logs), 'Synthetic operational audit history'),
  ('ai_runs', (SELECT count(*) FROM ai_runs), 'Seeded assistant runs across both surfaces'),
  ('landing_pages', (SELECT count(*) FROM landing_pages), 'French and Arabic campaign pages'),
  ('bulletin_posts', (SELECT count(*) FROM admin.bulletin_posts), 'Internal coordination history');
