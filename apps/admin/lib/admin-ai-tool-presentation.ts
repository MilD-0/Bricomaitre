export type AdminAiToolLabelKey =
  | 'catalog'
  | 'productCreated'
  | 'catalogUpdated'
  | 'productsArchived'
  | 'archivedProducts'
  | 'productsRestored'
  | 'taxonomy'
  | 'taxonomyUpdated'
  | 'orders'
  | 'orderCreated'
  | 'ordersDeleted'
  | 'ordersUpdated'
  | 'ecotrackPreview'
  | 'ecotrackRequirements'
  | 'ecotrackPosting'
  | 'ecotrackShipments'
  | 'ecotrackShipmentsUpdated'
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
  | 'actionHistory'
  | 'actionHistoryRecovered'
  | 'storefront'
  | 'storefrontUpdated'
  | 'analyticsUpdated'
  | 'background'
  | 'content'
  | 'categorization'
  | 'result';

export type AdminAiToolDestinationKey =
  | 'products'
  | 'taxonomy'
  | 'orders'
  | 'ecotrack'
  | 'inventory'
  | 'assets'
  | 'landingPages'
  | 'proposals'
  | 'bulletin'
  | 'administration'
  | 'storefront'
  | 'analytics';

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
  inspect_archived_products: 'archivedProducts',
  restore_products: 'productsRestored',
  find_brands: 'taxonomy',
  find_categories: 'taxonomy',
  manage_taxonomy: 'taxonomyUpdated',
  inspect_orders: 'orders',
  create_order: 'orderCreated',
  delete_orders: 'ordersDeleted',
  preview_order_export: 'orders',
  start_order_export: 'background',
  get_order_tracking_links: 'ordersUpdated',
  inspect_order_shopping_list: 'orders',
  save_order_shopping_list: 'ordersUpdated',
  apply_order_shopping_list_inventory: 'inventoryUpdated',
  preview_ecotrack_posting: 'ecotrackPreview',
  load_ecotrack_requirements: 'ecotrackRequirements',
  post_orders_to_ecotrack: 'ecotrackPosting',
  ecotrack_posting_terminal: 'ecotrackPosting',
  inspect_ecotrack_shipments: 'ecotrackShipments',
  manage_ecotrack_shipments: 'ecotrackShipmentsUpdated',
  change_ecotrack_shipments: 'ecotrackShipmentsUpdated',
  update_order_status: 'ordersUpdated',
  update_order_details: 'ordersUpdated',
  inspect_inventory: 'inventory',
  scan_inventory: 'inventory',
  adjust_inventory: 'inventoryUpdated',
  receive_inventory: 'inventoryUpdated',
  update_inventory_state: 'inventoryUpdated',
  inspect_assets: 'assets',
  update_asset_state: 'assetsUpdated',
  reorder_assets: 'assetsUpdated',
  manage_assets: 'assetsUpdated',
  inspect_landing_pages: 'landingPages',
  create_landing_page: 'landingPageCreated',
  edit_landing_page: 'landingPageUpdated',
  inspect_ai_proposals: 'proposals',
  review_ai_proposals: 'proposalsReviewed',
  delete_expired_ai_proposals: 'proposalsReviewed',
  inspect_bulletin: 'bulletin',
  create_bulletin_post: 'bulletinUpdated',
  reply_bulletin_post: 'bulletinUpdated',
  set_bulletin_reaction: 'bulletinUpdated',
  update_bulletin_post: 'bulletinUpdated',
  delete_bulletin_content: 'bulletinUpdated',
  inspect_administration: 'administration',
  set_access_grant: 'administrationUpdated',
  revoke_access_grants: 'administrationUpdated',
  set_role_definition: 'administrationUpdated',
  inspect_action_history: 'actionHistory',
  recover_action_history: 'actionHistoryRecovered',
  inspect_storefront_configuration: 'storefront',
  update_storefront_settings: 'storefrontUpdated',
  update_storefront_announcement: 'storefrontUpdated',
  update_analytics_settings: 'analyticsUpdated',
  manage_analytics_costs: 'analyticsUpdated',
  manage_analytics_day_overrides: 'analyticsUpdated',
  sync_analytics_source: 'analyticsUpdated',
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
  inspect_archived_products: 'products',
  restore_products: 'products',
  find_brands: 'taxonomy',
  find_categories: 'taxonomy',
  manage_taxonomy: 'taxonomy',
  inspect_orders: 'orders',
  create_order: 'orders',
  delete_orders: 'orders',
  preview_order_export: 'orders',
  start_order_export: 'orders',
  get_order_tracking_links: 'orders',
  inspect_order_shopping_list: 'orders',
  save_order_shopping_list: 'orders',
  apply_order_shopping_list_inventory: 'inventory',
  preview_ecotrack_posting: 'ecotrack',
  load_ecotrack_requirements: 'ecotrack',
  post_orders_to_ecotrack: 'ecotrack',
  ecotrack_posting_terminal: 'ecotrack',
  inspect_ecotrack_shipments: 'ecotrack',
  manage_ecotrack_shipments: 'ecotrack',
  change_ecotrack_shipments: 'ecotrack',
  update_order_status: 'orders',
  update_order_details: 'orders',
  inspect_inventory: 'inventory',
  scan_inventory: 'inventory',
  adjust_inventory: 'inventory',
  receive_inventory: 'inventory',
  update_inventory_state: 'inventory',
  inspect_assets: 'assets',
  update_asset_state: 'assets',
  reorder_assets: 'assets',
  manage_assets: 'assets',
  inspect_landing_pages: 'landingPages',
  create_landing_page: 'landingPages',
  edit_landing_page: 'landingPages',
  inspect_ai_proposals: 'proposals',
  review_ai_proposals: 'proposals',
  delete_expired_ai_proposals: 'proposals',
  inspect_bulletin: 'bulletin',
  create_bulletin_post: 'bulletin',
  reply_bulletin_post: 'bulletin',
  set_bulletin_reaction: 'bulletin',
  update_bulletin_post: 'bulletin',
  delete_bulletin_content: 'bulletin',
  inspect_administration: 'administration',
  set_access_grant: 'administration',
  revoke_access_grants: 'administration',
  set_role_definition: 'administration',
  inspect_action_history: 'administration',
  recover_action_history: 'administration',
  inspect_storefront_configuration: 'storefront',
  update_storefront_settings: 'storefront',
  update_storefront_announcement: 'storefront',
  update_analytics_settings: 'analytics',
  manage_analytics_costs: 'analytics',
  manage_analytics_day_overrides: 'analytics',
  sync_analytics_source: 'analytics',
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
  archivedProducts: 'products',
  productsRestored: 'products',
  taxonomy: 'taxonomy',
  taxonomyUpdated: 'taxonomy',
  orders: 'orders',
  orderCreated: 'orders',
  ordersDeleted: 'orders',
  ordersUpdated: 'orders',
  ecotrackPreview: 'orders',
  ecotrackRequirements: 'orders',
  ecotrackPosting: 'orders',
  ecotrackShipments: 'orders',
  ecotrackShipmentsUpdated: 'orders',
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
  actionHistory: 'administration',
  actionHistoryRecovered: 'administration',
  storefront: 'storefront',
  storefrontUpdated: 'storefront',
  analyticsUpdated: 'analytics',
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
  if (destinationKey === 'products') {
    return toolName === 'inspect_archived_products' || toolName === 'restore_products'
      ? `/${locale}/archive`
      : `/${locale}/products`;
  }
  if (destinationKey === 'taxonomy') return `/${locale}/brands-categories`;
  if (destinationKey === 'orders') return `/${locale}/orders`;
  if (destinationKey === 'ecotrack') return `/${locale}/orders/ecotrack`;
  if (destinationKey === 'inventory') return `/${locale}/inventory`;
  if (destinationKey === 'proposals') return `/${locale}/ai-proposals`;
  if (destinationKey === 'bulletin') return `/${locale}/bulletin`;
  if (destinationKey === 'storefront') return `/${locale}/administration/storefront`;
  if (destinationKey === 'analytics') {
    if (toolName === 'sync_analytics_source') {
      return outputRecord(output)?.source === 'searchConsole'
        ? `/${locale}/stats/search`
        : `/${locale}/stats/meta-ads`;
    }
    return `/${locale}/stats/costs`;
  }
  if (destinationKey === 'administration') {
    if (toolName === 'inspect_action_history' || toolName === 'recover_action_history') {
      return `/${locale}/administration/history`;
    }
    if (toolName === 'set_access_grant' || toolName === 'revoke_access_grants') {
      return `/${locale}/administration/users`;
    }
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
  if (toolName === 'query_analytics' || destinationKeys[toolName] === 'analytics') {
    return 'analytics';
  }
  return activityKeysByLabel[labelKeys[toolName] ?? 'result'];
}

export const ADMIN_AI_PRESENTED_TOOL_NAMES = Object.freeze(Object.keys(labelKeys));

export const ADMIN_AI_MUTATING_TOOL_NAMES = Object.freeze([
  'create_product',
  'update_products',
  'archive_products',
  'restore_products',
  'manage_taxonomy',
  'create_order',
  'delete_orders',
  'start_order_export',
  'get_order_tracking_links',
  'save_order_shopping_list',
  'apply_order_shopping_list_inventory',
  'post_orders_to_ecotrack',
  'manage_ecotrack_shipments',
  'change_ecotrack_shipments',
  'update_order_status',
  'update_order_details',
  'adjust_inventory',
  'receive_inventory',
  'update_inventory_state',
  'update_asset_state',
  'reorder_assets',
  'manage_assets',
  'create_landing_page',
  'edit_landing_page',
  'review_ai_proposals',
  'delete_expired_ai_proposals',
  'create_bulletin_post',
  'reply_bulletin_post',
  'set_bulletin_reaction',
  'update_bulletin_post',
  'delete_bulletin_content',
  'set_access_grant',
  'revoke_access_grants',
  'set_role_definition',
  'recover_action_history',
  'update_storefront_settings',
  'update_storefront_announcement',
  'update_analytics_settings',
  'manage_analytics_costs',
  'manage_analytics_day_overrides',
  'sync_analytics_source',
  'generate_product_content',
  'stop_background_job',
  'start_background_job',
  'suggest_discount',
  'suggest_featured_products',
  'suggest_landing_page',
  'categorize_catalog',
  'propose_product_edit',
  'propose_brand_edit',
  'propose_category_edit',
  'propose_brand_create',
  'propose_category_create',
] as const);

const mutatingToolNames = new Set<string>(ADMIN_AI_MUTATING_TOOL_NAMES);

export function adminAiToolMutatesApplication(toolName: string) {
  return mutatingToolNames.has(toolName);
}
