CREATE OR REPLACE TEMP MACRO classify_subtype(title_search) AS CASE
  WHEN regexp_matches(title_search, '\b(drill bits?|saw blades?|jigsaw blades?|grinding wheels?|flap discs?|sanding discs?|router bits?|cutting discs?|power tool batter(y|ies)|hole saw|impact sockets?|driver bits?|wrench bits?|bit sets?|drill driver accessory|sanding belts?|cut.?off wheels?|wire wheels?|polishing pads?)\b') THEN CASE
    WHEN regexp_matches(title_search, '\bdrill bits?\b') THEN 'drill-bits'
    WHEN regexp_matches(title_search, '\bsaw blades?\b') THEN 'saw-blades'
    WHEN regexp_matches(title_search, '\b(router bits?|hole saw)\b') THEN 'routing-drilling-accessories'
    WHEN regexp_matches(title_search, '\b(power tool batter(y|ies)|impact sockets?|driver bits?|wrench bits?|bit sets?|drill driver accessory)\b') THEN 'power-tool-accessories'
    ELSE 'abrasives'
  END
  WHEN regexp_matches(title_search, '\b(multimeter|clamp meter|wire stripper|electrical tape|extension cords?|circuit breaker|junction box|electrical box|electrical conduit|wire connector|voltage tester|crimping tool|crimper|cable cutter|fish tape|soldering iron|electrical tester|outlet tester|power strip|surge protector|electrical outlet|wall outlet|wall switch|light switch|doorbell|thermostat|motion sensor|work light|shop light|garage light|ceiling light|light fixture|recessed light|outdoor light|led light bulbs?|light bulbs?|flashlights?|headlamps?|smoke alarms?)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(multimeter|clamp meter|voltage tester|electrical tester|outlet tester)\b') THEN 'electrical-testers'
    WHEN regexp_matches(title_search, '\b(wire stripper|wire connector|crimping tool|crimper|cable cutter|fish tape|soldering iron)\b') THEN 'electrical-tools'
    WHEN regexp_matches(title_search, '\b(work light|shop light|garage light|flashlights?|headlamps?)\b') THEN 'work-lights'
    WHEN regexp_matches(title_search, '\b(light bulbs?|led light bulbs?)\b') THEN 'lighting'
    ELSE 'electrical-supplies'
  END
  WHEN regexp_matches(title_search, '\b(pipe wrench|pvc fittings?|faucets?|water valve|shut.?off valve|ball valve|gate valve|check valve|angle valve|toilet valve|pipe cutter|drain auger|hose clamps?|plumbing tool|basin wrench|pex|plungers?|shower heads?|sink drain|drain stopper)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(faucets?|shower heads?)\b') THEN 'faucets-showers'
    WHEN regexp_matches(title_search, '\b(valve|fittings?|pex|hose clamps?)\b') THEN 'pipe-fittings'
    WHEN regexp_matches(title_search, '\b(drain|plungers?)\b') THEN 'drain-tools'
    ELSE 'plumbing-tools'
  END
  WHEN regexp_matches(title_search, '\b(impact driver|impact wrench|angle grinder|bench grinder|circular saw|reciprocating saw|table saw|miter saw|jig saw|jigsaw|rotary hammer|orbital sander|belt sander|power router|electric planer|nail gun|heat gun|electric polisher|air compressor|pressure washer|shop vac|wet dry vacuum|power tool combo|cordless drill|electric drill|power drill|hammer drill|drill driver|drill press|brushless drill)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(impact driver|impact wrench)\b') THEN 'impact-tools'
    WHEN regexp_matches(title_search, '\bgrinder\b') THEN 'grinders'
    WHEN regexp_matches(title_search, '\b(circular saw|reciprocating saw|table saw|miter saw|jig saw|jigsaw)\b') THEN 'power-saws'
    WHEN regexp_matches(title_search, '\b(orbital sander|belt sander|electric polisher)\b') THEN 'sanders-polishers'
    WHEN regexp_matches(title_search, '\b(air compressor|pressure washer|shop vac|wet dry vacuum)\b') THEN 'workshop-machines'
    WHEN regexp_matches(title_search, '\b(cordless drill|electric drill|power drill|hammer drill|drill driver|drill press|brushless drill)\b') THEN 'drills'
    ELSE 'power-tools'
  END
  WHEN regexp_matches(title_search, '\b(safety glasses|safety goggles|protective eyewear|work gloves?|hearing protection|ear muffs|respirator|dust masks?|hard hats?|welding helmets?|work knee pads?|safety vest|safety harness|face shield|work boots?|safety shoes?|protective coveralls?)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(safety glasses|safety goggles|face shield)\b') THEN 'eye-face-protection'
    WHEN regexp_matches(title_search, '\bwork gloves?\b') THEN 'work-gloves'
    WHEN regexp_matches(title_search, '\b(welding helmets?|hard hats?)\b') THEN 'head-protection'
    ELSE 'work-safety'
  END
  WHEN regexp_matches(title_search, '\b(wrenches?|pliers?|screwdrivers?|claw hammer|ball peen hammer|sledge hammer|dead blow hammer|chisels?|socket set|ratchet wrench|ratcheting wrench|bar clamp|c-clamp|woodworking clamp|spring clamp|tape measure|measuring tape|spirit level|laser level|stud finder|digital caliper|moisture meter|utility knife|hex keys?|allen wrench|hand saw|hacksaw|bolt cutter|wire cutter|punch set|mechanics tool set|mechanic tool set|pry bar|file set|tin snips)\b') THEN CASE
    WHEN regexp_matches(title_search, '\bwrenche?s?\b') THEN 'wrenches'
    WHEN regexp_matches(title_search, '\bpliers?\b') THEN 'pliers'
    WHEN regexp_matches(title_search, '\bscrewdrivers?\b') THEN 'screwdrivers'
    WHEN regexp_matches(title_search, '\bhammer\b') THEN 'hammers'
    WHEN regexp_matches(title_search, '\b(socket set|ratchet wrench|ratcheting wrench)\b') THEN 'sockets-ratchets'
    WHEN regexp_matches(title_search, '\b(clamp|c-clamp)\b') THEN 'clamps'
    WHEN regexp_matches(title_search, '\b(tape measure|measuring tape|spirit level|laser level|stud finder|digital caliper|moisture meter)\b') THEN 'measuring-layout'
    WHEN regexp_matches(title_search, '\b(hand saw|hacksaw|bolt cutter|wire cutter|utility knife|tin snips)\b') THEN 'hand-cutting-tools'
    ELSE 'general-hand-tools'
  END
  WHEN regexp_matches(title_search, '\b(pruning|pruners?|hedge trimmer|lawn mower|garden hose|hose nozzle|watering can|garden cart|garden shovel|garden rake|wheelbarrow|garden sprayer|lawn sprinkler|irrigation kit|string trimmer|weed trimmer|lawn edger|garden cultivator|chainsaw|pole saw|leaf blower|garden tool)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(pruning|pruners?)\b') THEN 'pruning-tools'
    WHEN regexp_matches(title_search, '\b(hedge trimmer|string trimmer|chainsaw|pole saw|leaf blower|lawn mower)\b') THEN 'garden-power-tools'
    WHEN regexp_matches(title_search, '\bgarden hose\b') THEN 'garden-hoses'
    ELSE 'garden-hand-tools'
  END
  WHEN regexp_matches(title_search, '\b(tool box|toolbox|tool chest|parts organizer|workbench|tool bag|tool cabinet|garage cabinet|garage shelving|garage storage|storage bins?|storage cabinet|storage racks?|storage shelves?|shelving unit|utility shelf|wall mounted rack|pegboard|socket organizer|wrench organizer|bench vise|mechanics creeper|jack stands?|hydraulic jack|step ladder|extension ladder)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(tool box|toolbox|tool chest|tool cabinet)\b') THEN 'tool-boxes'
    WHEN regexp_matches(title_search, '\btool bag\b') THEN 'tool-bags'
    WHEN regexp_matches(title_search, '\b(pegboard|organizer)\b') THEN 'workshop-organizers'
    WHEN regexp_matches(title_search, '\b(bench vise|mechanics creeper|jack stands?|hydraulic jack|step ladder|extension ladder)\b') THEN 'workshop-equipment'
    ELSE 'workshop-furniture'
  END
  WHEN regexp_matches(title_search, '\b(paint brushes?|paint rollers?|paint trays?|paint sprayers?|drop cloth|caulk guns?|putty knives?|wall scrapers?|painter.?s tape|masking tape|spray paint|wall paint|wood stain|paint thinner|paint remover)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(paint sprayers?|caulk guns?)\b') THEN 'painting-tools'
    WHEN regexp_matches(title_search, '\b(paint brushes?|paint rollers?|paint trays?|putty knives?|wall scrapers?)\b') THEN 'painting-applicators'
    ELSE 'painting-supplies'
  END
  WHEN regexp_matches(title_search, '\b(wood screws?|machine screws?|self[- ]tapping screws?|drywall screws?|deck screws?|concrete screws?|hex bolts?|carriage bolts?|lag bolts?|screw assortment|bolt assortment|finish nails?|brad nails?|framing nails?|wall anchors?|drywall anchors?|concrete anchors?|sandpaper|wood glue|construction adhesive|epoxy adhesive|silicone sealant|caulk|threadlocker|penetrating oil|industrial lubricant|welding rods?|welding wire|zip ties|duct tape|metal brackets?|shelf brackets?|corner braces?|shelf supports?|door hinges?|cabinet hinges?|drawer slides?|drawer pulls?|cabinet handles?|door knobs?|door stops?|gate latches?|hasps?|utility hooks?|caster wheels?|padlocks?|deadbolts?|door locks?|door handles?|weather stripping|door sweeps?|bungee cords?|tarps?|utility rope)\b') THEN CASE
    WHEN regexp_matches(title_search, '\b(screws?|bolts?|finish nails?|brad nails?|wall anchors?|drywall anchors?|concrete anchors?)\b') THEN 'fasteners'
    WHEN regexp_matches(title_search, '\b(sandpaper|duct tape|masking tape)\b') THEN 'workshop-consumables'
    WHEN regexp_matches(title_search, '\b(adhesive|wood glue|sealant|caulk|threadlocker)\b') THEN 'adhesives-sealants'
    WHEN regexp_matches(title_search, '\b(welding rods?|welding wire)\b') THEN 'welding-consumables'
    ELSE 'general-hardware'
  END
END;

CREATE OR REPLACE TEMP MACRO classify_family(subtype_key) AS CASE
  WHEN subtype_key IN ('drill-bits', 'saw-blades', 'routing-drilling-accessories', 'abrasives', 'power-tool-accessories') THEN 'accessories'
  WHEN subtype_key IN ('electrical-testers', 'electrical-tools', 'work-lights', 'lighting', 'electrical-supplies') THEN 'electrical'
  WHEN subtype_key IN ('faucets-showers', 'pipe-fittings', 'drain-tools', 'plumbing-tools') THEN 'plumbing'
  WHEN subtype_key IN ('impact-tools', 'grinders', 'power-saws', 'sanders-polishers', 'workshop-machines', 'power-tools', 'drills') THEN 'power-tools'
  WHEN subtype_key IN ('eye-face-protection', 'work-gloves', 'head-protection', 'work-safety') THEN 'safety'
  WHEN subtype_key IN ('wrenches', 'pliers', 'screwdrivers', 'hammers', 'sockets-ratchets', 'clamps', 'measuring-layout', 'hand-cutting-tools', 'general-hand-tools') THEN 'hand-tools'
  WHEN subtype_key IN ('pruning-tools', 'garden-power-tools', 'garden-hoses', 'garden-hand-tools') THEN 'garden'
  WHEN subtype_key IN ('tool-boxes', 'tool-bags', 'workshop-organizers', 'workshop-equipment', 'workshop-furniture') THEN 'workshop-storage'
  WHEN subtype_key IN ('painting-tools', 'painting-applicators', 'painting-supplies') THEN 'painting'
  WHEN subtype_key IN ('fasteners', 'workshop-consumables', 'adhesives-sealants', 'welding-consumables', 'general-hardware') THEN 'consumables'
END;

CREATE OR REPLACE TEMP TABLE source_products AS
WITH sqid_images AS (
  SELECT product_id, image_url FROM read_parquet('/sources/sqid-images.parquet')
  UNION ALL
  SELECT product_id, image_url FROM read_parquet('/sources/sqid-supplemental-images.parquet')
), query_evidence AS (
  SELECT product_id,
    count(*) FILTER (WHERE esci_label IN ('E', 'S', 'C')) AS useful_judgments,
    string_agg(DISTINCT query, ' | ' ORDER BY query) FILTER (WHERE esci_label IN ('E', 'S', 'C')) AS useful_queries
  FROM read_parquet('/sources/esci-examples.parquet')
  WHERE product_locale = 'us'
  GROUP BY product_id
), esci AS (
  SELECT 'esci' source_dataset, products.product_id source_product_id,
    products.product_title source_title,
    left(coalesce(products.product_description, ''), 800) source_description,
    left(coalesce(products.product_bullet_point, ''), 800) source_bullet_points,
    coalesce(products.product_brand, '') source_brand,
    coalesce(products.product_color, '') source_color,
    [sqid_images.image_url] source_image_urls,
    coalesce(query_evidence.useful_judgments, 0) useful_judgments,
    left(coalesce(query_evidence.useful_queries, ''), 600) useful_queries
  FROM read_parquet('/sources/esci-products.parquet') products
  JOIN sqid_images USING (product_id)
  LEFT JOIN query_evidence USING (product_id)
  WHERE products.product_locale = 'us' AND sqid_images.image_url IS NOT NULL
    AND products.product_id NOT IN ('B001F7BIMG', 'B002AKKJBS')
), abo_listings AS (
  SELECT * EXCLUDE (source_rank) FROM (
    SELECT *, row_number() OVER (
      PARTITION BY item_id ORDER BY (country = 'US')::int DESC,
      (domain_name = 'amazon.com')::int DESC, length(coalesce(title, '')) DESC
    ) source_rank
    FROM read_parquet('/sources/abo-listings-*.parquet')
  ) WHERE source_rank = 1
), abo_image_ids AS (
  SELECT listing.item_id, image.image_id, image_position
  FROM abo_listings listing,
  UNNEST(list_prepend(listing.main_image_id,
    coalesce(json_extract(listing.raw_listing_json, '$.other_image_id')::varchar[], [])))
    WITH ORDINALITY image(image_id, image_position)
  WHERE image.image_id IS NOT NULL
), abo_image_urls AS (
  SELECT image_ids.item_id,
    list(images.original_image_url ORDER BY image_ids.image_position) image_urls
  FROM abo_image_ids image_ids
  JOIN read_parquet('/sources/abo-images.parquet') images USING (image_id)
  WHERE images.original_image_url IS NOT NULL
    AND try_cast(images.width AS integer) >= 300
    AND try_cast(images.height AS integer) >= 300
  GROUP BY image_ids.item_id
), abo AS (
  SELECT 'abo' source_dataset, listing.item_id source_product_id,
    listing.title source_title,
    left(coalesce(json_extract_string(listing.raw_listing_json, '$.product_description[0].value'), ''), 800) source_description,
    left(coalesce(json_extract_string(listing.raw_listing_json, '$.bullet_point[0].value'), ''), 800) source_bullet_points,
    coalesce(listing.brand, '') source_brand, coalesce(listing.color, '') source_color,
    images.image_urls source_image_urls, 0::bigint useful_judgments,
    coalesce(listing.product_type_readable, '') || ' | ' || coalesce(listing.hierarchy_path, '') useful_queries
  FROM abo_listings listing JOIN abo_image_urls images USING (item_id)
  WHERE len(images.image_urls) >= 2
), cleaned AS (
  SELECT *, lower(source_title) title_search FROM (
    SELECT * FROM esci UNION ALL BY NAME SELECT * FROM abo
  )
  WHERE length(trim(source_title)) BETWEEN 12 AND 300
    AND regexp_matches(source_title, '[A-Za-z]')
    AND NOT regexp_matches(lower(source_title),
      '\b(costumes?|t-shirts?|shirts?|dresses?|earrings?|necklaces?|bracelets?|wrist watches?|makeup|eyelashes?|manicure|pedicure|fingernails?|acrylic nails?|press on nails?|nail polish|nail art|nail strengthener|bandages?|wound dressing|fertility|personal lubricant|dogs?|cats?|pets?|toys?|scooters?|bicycles?|bikes?|motorcycles?|puzzles?|phone cases?|laptops?|backpacks?|wallets?|holsters?|guns?|rifles?|airsoft|video games?|posters?|stickers?|decals?|barbells?|table tennis|camera mounts?|light stands?|jewelry|cosmetic|slippers?|sandals?|shoes?|sneakers?|covers?|pillows?|curtains?|bedsheets?|duvets?|blankets?|towels?|detergent|crayons?|coloring books?|highlighters?|chalk markers?|banana plugs?|trash bags?|vases?|balaclavas?|bandanas?|scarves?|furry|wardrobes?|kitchens?|classrooms?|dinner trays?|microwave carts?|media consoles?|buffet tables?|sideboards?|farmhouse|decorative shelving|dresser|underwear|bras?|socks?|ties?)\b')
), typed AS (
  SELECT *, classify_subtype(title_search) subtype_key FROM cleaned
)
SELECT * EXCLUDE (title_search), classify_family(subtype_key) family_key
FROM typed WHERE subtype_key IS NOT NULL;

CREATE OR REPLACE TEMP TABLE selected_abo AS
SELECT * FROM source_products WHERE source_dataset = 'abo' AND family_key IS NOT NULL;

CREATE OR REPLACE TEMP TABLE selected_esci AS
WITH target AS (SELECT ceil(count(*) * 1.5)::bigint product_count FROM selected_abo),
weights AS (
  SELECT * FROM (VALUES ('accessories', 0.06), ('electrical', 0.18),
    ('garden', 0.08), ('hand-tools', 0.12), ('painting', 0.05),
    ('plumbing', 0.12), ('power-tools', 0.12), ('safety', 0.08),
    ('workshop-storage', 0.09), ('consumables', 0.10)) w(family_key, share)
), ranked AS (
  SELECT source_products.*, row_number() OVER (PARTITION BY family_key ORDER BY
    (source_brand <> '')::int DESC, (source_description <> '')::int DESC,
    (source_bullet_points <> '')::int DESC, useful_judgments DESC,
    hash(source_product_id)) source_rank
  FROM source_products
  WHERE source_dataset = 'esci' AND family_key IS NOT NULL
    AND source_product_id NOT IN (SELECT source_product_id FROM selected_abo)
)
SELECT ranked.* EXCLUDE (source_rank) FROM ranked
JOIN weights USING (family_key) CROSS JOIN target
WHERE source_rank <= greatest(20, ceil(target.product_count * weights.share));

COPY (
  WITH catalog AS (
    SELECT * FROM selected_abo UNION ALL BY NAME SELECT * FROM selected_esci
  ), gallery_ranked AS (
    SELECT *, row_number() OVER (PARTITION BY source_dataset ORDER BY
      len(source_image_urls) DESC, (source_description <> '')::int DESC,
      hash(source_product_id)) dataset_rank,
      count(*) FILTER (WHERE source_dataset = 'abo') OVER () abo_count
    FROM catalog
  )
  SELECT source_dataset, source_product_id, family_key, subtype_key, source_title,
    source_description, source_bullet_points, source_brand, source_color,
    to_json(CASE
      WHEN source_dataset = 'abo' AND dataset_rank <= ceil(abo_count / 8.0)
        THEN source_image_urls[1:least(len(source_image_urls), 8)]
      WHEN source_dataset = 'abo'
        THEN source_image_urls[1:least(len(source_image_urls), 4)]
      ELSE source_image_urls END)::varchar source_image_urls_json,
    useful_judgments, useful_queries
  FROM gallery_ranked ORDER BY family_key, source_dataset, dataset_rank
) TO '/output/catalog-source.csv' (HEADER, DELIMITER ',', QUOTE '"', ESCAPE '"');

COPY (
  SELECT source_dataset || '-' || source_product_id product_key,
    image_position, image_url
  FROM read_csv_auto('/output/catalog-source.csv'),
  UNNEST(json_extract(source_image_urls_json, '$')::varchar[])
    WITH ORDINALITY image(image_url, image_position)
  ORDER BY product_key, image_position
) TO '/output/image-manifest.tsv' (HEADER false, DELIMITER '\t', QUOTE '', ESCAPE '');

COPY (
  SELECT family_key, count(*) product_count,
    count(*) FILTER (WHERE source_dataset = 'abo') multi_image_products,
    round(avg(json_array_length(source_image_urls_json)), 2) average_images
  FROM read_csv_auto('/output/catalog-source.csv') GROUP BY family_key ORDER BY family_key
) TO '/output/catalog-stats.csv' (HEADER, DELIMITER ',');

COPY (
  SELECT code, name, nameAr name_ar, nameAscii name_ascii, communeCount commune_count
  FROM read_json_auto('/sources/algeria-wilayas.json') ORDER BY code
) TO '/output/algeria-wilayas.csv' (HEADER, DELIMITER ',', QUOTE '"', ESCAPE '"');

COPY (
  SELECT row_number() OVER (ORDER BY wilayaCode, name) commune_id,
    wilayaCode wilaya_code, name, nameAr name_ar
  FROM read_json_auto('/sources/algeria-communes.json') ORDER BY wilayaCode, name
) TO '/output/algeria-communes.csv' (HEADER, DELIMITER ',', QUOTE '"', ESCAPE '"');
