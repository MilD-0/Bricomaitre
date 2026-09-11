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
  | 'landingPageUpdated'
  | 'storefront'
  | 'storefrontUpdated'
  | 'analyticsUpdated'
  | 'background'
  | 'content'
  | 'categorization'
  | 'result';

type AdminAiToolDestinationKey =
  | 'products'
  | 'taxonomy'
  | 'orders'
  | 'ecotrack'
  | 'inventory'
  | 'assets'
  | 'landingPages'
  | 'proposals'
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
  | 'storefront'
  | 'background'
  | 'analytics'
  | 'result';

const labelKeys: Record<string, AdminAiToolLabelKey> = {
  find_products: 'catalog',
  query_products: 'catalog',
  inspect_products: 'catalog',
  create_product: 'productCreated',
  update_products: 'catalogUpdated',
  archive_products: 'productsArchived',
  inspect_archived_products: 'archivedProducts',
  restore_products: 'productsRestored',
  find_brands: 'taxonomy',
  find_categories: 'taxonomy',
  manage_taxonomy: 'taxonomyUpdated',
  query_orders: 'orders',
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
  scan_inventory: 'inventory',
  adjust_inventory: 'inventoryUpdated',
  receive_inventory: 'inventoryUpdated',
  update_inventory_state: 'inventoryUpdated',
  inspect_assets: 'assets',
  reorder_assets: 'assetsUpdated',
  manage_assets: 'assetsUpdated',
  inspect_landing_pages: 'landingPages',
  start_landing_page_work: 'background',
  set_landing_page_active: 'landingPageUpdated',
  get_landing_page_job_status: 'background',
  inspect_storefront_configuration: 'storefront',
  update_storefront_settings: 'storefrontUpdated',
  update_storefront_announcement: 'storefrontUpdated',
  update_analytics_settings: 'analyticsUpdated',
  manage_analytics_costs: 'analyticsUpdated',
  manage_analytics_day_overrides: 'analyticsUpdated',
  manage_off_pipeline_sales: 'analyticsUpdated',
  sync_analytics_source: 'analyticsUpdated',
  generate_product_content: 'content',
  get_product_content_job_status: 'content',
  categorize_catalog: 'categorization',
  get_catalog_categorization_status: 'categorization',
};

const destinationKeys: Record<string, AdminAiToolDestinationKey> = {
  find_products: 'products',
  query_products: 'products',
  inspect_products: 'products',
  create_product: 'products',
  update_products: 'products',
  archive_products: 'products',
  inspect_archived_products: 'products',
  restore_products: 'products',
  find_brands: 'taxonomy',
  find_categories: 'taxonomy',
  manage_taxonomy: 'taxonomy',
  query_orders: 'orders',
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
  scan_inventory: 'inventory',
  adjust_inventory: 'inventory',
  receive_inventory: 'inventory',
  update_inventory_state: 'inventory',
  inspect_assets: 'assets',
  reorder_assets: 'assets',
  manage_assets: 'assets',
  inspect_landing_pages: 'landingPages',
  start_landing_page_work: 'landingPages',
  set_landing_page_active: 'landingPages',
  get_landing_page_job_status: 'landingPages',
  inspect_storefront_configuration: 'storefront',
  update_storefront_settings: 'storefront',
  update_storefront_announcement: 'storefront',
  update_analytics_settings: 'analytics',
  manage_analytics_costs: 'analytics',
  manage_analytics_day_overrides: 'analytics',
  manage_off_pipeline_sales: 'analytics',
  query_off_pipeline_sales: 'analytics',
  sync_analytics_source: 'analytics',
  query_analytics: 'analytics',
  query_ai_stats: 'analytics',
  generate_product_content: 'products',
  get_product_content_job_status: 'products',
  categorize_catalog: 'proposals',
  get_catalog_categorization_status: 'proposals',
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
  landingPageUpdated: 'assets',
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
  if (destinationKey === 'taxonomy') return `/${locale}/brands`;
  if (destinationKey === 'orders') return `/${locale}/orders`;
  if (destinationKey === 'ecotrack') return `/${locale}/orders/ecotrack`;
  if (destinationKey === 'inventory') return `/${locale}/inventory`;
  if (destinationKey === 'proposals') return `/${locale}/ai-proposals`;
  if (destinationKey === 'storefront') return `/${locale}/administration/storefront`;
  if (destinationKey === 'analytics') {
    if (toolName === 'query_ai_stats') {
      return outputRecord(output)?.surface === 'shopping'
        ? `/${locale}/stats/shopping-assistant`
        : `/${locale}/stats/ai-assistants`;
    }
    if (toolName === 'query_analytics') {
      const direct = outputRecord(output);
      const firstResult = Array.isArray(direct?.results) ? outputRecord(direct.results[0]) : null;
      const view = direct?.view ?? firstResult?.view;
      const routes: Record<string, string> = {
        command: '/stats',
        money: '/stats/time',
        acquisition: '/stats/meta-ads',
        fulfillment: '/stats/fulfillment',
        storefront: '/stats/website',
        search: '/stats/search',
        catalog: '/stats/products',
        assumptions: '/stats/costs',
      };
      return `/${locale}${typeof view === 'string' ? (routes[view] ?? '/stats') : '/stats'}`;
    }
    if (toolName === 'sync_analytics_source') {
      return outputRecord(output)?.source === 'searchConsole'
        ? `/${locale}/stats/search`
        : `/${locale}/stats/meta-ads`;
    }
    return `/${locale}/stats/costs`;
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

export { adminAiToolMutatesApplication } from './admin-ai-execution-capabilities';
