export type AdminAiToolLabelKey =
  | 'catalog'
  | 'productCreated'
  | 'catalogUpdated'
  | 'productsArchived'
  | 'taxonomy'
  | 'taxonomyUpdated'
  | 'orders'
  | 'ordersUpdated'
  | 'inventory'
  | 'inventoryUpdated'
  | 'assets'
  | 'assetsUpdated'
  | 'landingPages'
  | 'landingPageCreated'
  | 'landingPageUpdated'
  | 'proposals'
  | 'proposalsReviewed'
  | 'bulletin'
  | 'bulletinUpdated'
  | 'administration'
  | 'administrationUpdated'
  | 'storefront'
  | 'storefrontUpdated'
  | 'background'
  | 'content'
  | 'categorization'
  | 'result';

export type AdminAiToolDestinationKey =
  | 'products'
  | 'taxonomy'
  | 'orders'
  | 'inventory'
  | 'assets'
  | 'landingPages'
  | 'proposals'
  | 'bulletin'
  | 'administration'
  | 'storefront';

export type AdminAiToolPresentation = {
  labelKey: AdminAiToolLabelKey;
  destinationKey?: AdminAiToolDestinationKey;
  href?: string;
};

export type AdminAiToolActivityKey =
  | 'products'
  | 'taxonomy'
  | 'orders'
  | 'inventory'
  | 'assets'
  | 'proposals'
  | 'bulletin'
  | 'administration'
  | 'storefront'
  | 'background'
  | 'analytics'
  | 'result';

const labelKeys: Record<string, AdminAiToolLabelKey> = {
  find_products: 'catalog',
  inspect_products: 'catalog',
  create_product: 'productCreated',
  update_products: 'catalogUpdated',
  archive_products: 'productsArchived',
  find_brands: 'taxonomy',
  find_categories: 'taxonomy',
  manage_taxonomy: 'taxonomyUpdated',
  inspect_orders: 'orders',
  update_order_status: 'ordersUpdated',
  update_order_details: 'ordersUpdated',
  inspect_inventory: 'inventory',
  adjust_inventory: 'inventoryUpdated',
  inspect_assets: 'assets',
  update_asset_state: 'assetsUpdated',
  reorder_assets: 'assetsUpdated',
  manage_assets: 'assetsUpdated',
  inspect_landing_pages: 'landingPages',
  create_landing_page: 'landingPageCreated',
  edit_landing_page: 'landingPageUpdated',
  inspect_ai_proposals: 'proposals',
  review_ai_proposals: 'proposalsReviewed',
  inspect_bulletin: 'bulletin',
  create_bulletin_post: 'bulletinUpdated',
  reply_bulletin_post: 'bulletinUpdated',
  update_bulletin_post: 'bulletinUpdated',
  delete_bulletin_content: 'bulletinUpdated',
  inspect_administration: 'administration',
  set_access_grant: 'administrationUpdated',
  set_role_definition: 'administrationUpdated',
  inspect_storefront_configuration: 'storefront',
  update_storefront_settings: 'storefrontUpdated',
  update_storefront_announcement: 'storefrontUpdated',
  generate_product_content: 'content',
  get_product_content_job_status: 'content',
  list_background_jobs: 'background',
  get_background_job: 'background',
  stop_background_job: 'background',
  start_background_job: 'background',
  suggest_discount: 'proposals',
  suggest_featured_products: 'proposals',
  suggest_landing_page: 'proposals',
  categorize_catalog: 'categorization',
  get_catalog_categorization_status: 'categorization',
  propose_product_edit: 'proposals',
  propose_brand_edit: 'proposals',
  propose_category_edit: 'proposals',
  propose_brand_create: 'proposals',
  propose_category_create: 'proposals',
};

const destinationKeys: Record<string, AdminAiToolDestinationKey> = {
  find_products: 'products',
  inspect_products: 'products',
  create_product: 'products',
  update_products: 'products',
  archive_products: 'products',
  find_brands: 'taxonomy',
  find_categories: 'taxonomy',
  manage_taxonomy: 'taxonomy',
  inspect_orders: 'orders',
  update_order_status: 'orders',
  update_order_details: 'orders',
  inspect_inventory: 'inventory',
  adjust_inventory: 'inventory',
  inspect_assets: 'assets',
  update_asset_state: 'assets',
  reorder_assets: 'assets',
  manage_assets: 'assets',
  inspect_landing_pages: 'landingPages',
  create_landing_page: 'landingPages',
  edit_landing_page: 'landingPages',
  inspect_ai_proposals: 'proposals',
  review_ai_proposals: 'proposals',
  inspect_bulletin: 'bulletin',
  create_bulletin_post: 'bulletin',
  reply_bulletin_post: 'bulletin',
  update_bulletin_post: 'bulletin',
  delete_bulletin_content: 'bulletin',
  inspect_administration: 'administration',
  set_access_grant: 'administration',
  set_role_definition: 'administration',
  inspect_storefront_configuration: 'storefront',
  update_storefront_settings: 'storefront',
  update_storefront_announcement: 'storefront',
  generate_product_content: 'products',
  get_product_content_job_status: 'products',
  suggest_discount: 'proposals',
  suggest_featured_products: 'proposals',
  suggest_landing_page: 'proposals',
  categorize_catalog: 'proposals',
  get_catalog_categorization_status: 'proposals',
  propose_product_edit: 'proposals',
  propose_brand_edit: 'proposals',
  propose_category_edit: 'proposals',
  propose_brand_create: 'proposals',
  propose_category_create: 'proposals',
};

const activityKeysByLabel: Record<AdminAiToolLabelKey, AdminAiToolActivityKey> = {
  catalog: 'products',
  productCreated: 'products',
  catalogUpdated: 'products',
  productsArchived: 'products',
  taxonomy: 'taxonomy',
  taxonomyUpdated: 'taxonomy',
  orders: 'orders',
  ordersUpdated: 'orders',
  inventory: 'inventory',
  inventoryUpdated: 'inventory',
  assets: 'assets',
  assetsUpdated: 'assets',
  landingPages: 'assets',
  landingPageCreated: 'assets',
  landingPageUpdated: 'assets',
  proposals: 'proposals',
  proposalsReviewed: 'proposals',
  bulletin: 'bulletin',
  bulletinUpdated: 'bulletin',
  administration: 'administration',
  administrationUpdated: 'administration',
  storefront: 'storefront',
  storefrontUpdated: 'storefront',
  background: 'background',
  content: 'products',
  categorization: 'products',
  result: 'result',
};

function positiveInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function outputRecord(output: unknown) {
  return output && typeof output === 'object' && !Array.isArray(output)
    ? (output as Record<string, unknown>)
    : null;
}

function assetHref(locale: string, output: unknown) {
  const kind = outputRecord(output)?.kind;
  if (kind === 'featured-group') return `/${locale}/assets/featured-groups`;
  if (kind === 'product-card') return `/${locale}/assets/product-cards`;
  return `/${locale}/assets`;
}

function destinationHref(
  toolName: string,
  destinationKey: AdminAiToolDestinationKey,
  output: unknown,
  locale: string,
) {
  if (destinationKey === 'products') return `/${locale}/products`;
  if (destinationKey === 'taxonomy') return `/${locale}/brands-categories`;
  if (destinationKey === 'orders') return `/${locale}/orders`;
  if (destinationKey === 'inventory') return `/${locale}/inventory`;
  if (destinationKey === 'proposals') return `/${locale}/ai-proposals`;
  if (destinationKey === 'bulletin') return `/${locale}/bulletin`;
  if (destinationKey === 'storefront') return `/${locale}/administration/storefront`;
  if (destinationKey === 'administration') {
    if (toolName === 'set_access_grant') return `/${locale}/administration/users`;
    if (toolName === 'set_role_definition') return `/${locale}/administration/roles`;
    return `/${locale}/administration`;
  }
  if (destinationKey === 'assets') return assetHref(locale, output);

  const record = outputRecord(output);
  const id = positiveInteger(record?.id) ?? positiveInteger(record?.landingPageId);
  return id ? `/${locale}/assets/landing-pages/${id}` : `/${locale}/assets/landing-pages`;
}

export function adminAiToolPresentation(
  toolName: string,
  output: unknown,
  locale: string,
): AdminAiToolPresentation {
  const labelKey = labelKeys[toolName] ?? 'result';
  const destinationKey = destinationKeys[toolName];
  if (!destinationKey) return { labelKey };
  return {
    labelKey,
    destinationKey,
    href: destinationHref(toolName, destinationKey, output, locale),
  };
}

export function adminAiToolActivityKey(toolName: string): AdminAiToolActivityKey {
  if (toolName === 'query_analytics') return 'analytics';
  return activityKeysByLabel[labelKeys[toolName] ?? 'result'];
}

export const ADMIN_AI_PRESENTED_TOOL_NAMES = Object.freeze(Object.keys(labelKeys));
