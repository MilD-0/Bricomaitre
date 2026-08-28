import type { PermissionKey } from './permissions';

export const ADMIN_AI_CAPABILITY_DOMAINS = [
  'products',
  'taxonomy',
  'orders',
  'ecotrack',
  'inventory',
  'assets',
  'landingPages',
  'proposals',
  'bulletin',
  'administration',
  'actionHistory',
  'storefront',
  'analytics',
  'backgroundWork',
] as const;

export type AdminAiCapabilityDomain = (typeof ADMIN_AI_CAPABILITY_DOMAINS)[number];

export type AdminAiCapabilityEffect =
  'read' | 'preview' | 'monitor' | 'proposal' | 'write' | 'external' | 'background';

export type AdminAiCapabilityRisk = 'none' | 'low' | 'material' | 'high';
export type AdminAiCapabilityResult = 'records' | 'preview' | 'receipt' | 'proposal' | 'job';

type AdminAiCapabilityAvailability = {
  anyPermissions?: readonly PermissionKey[];
  allPermissions?: readonly PermissionKey[];
  requiresBackgroundJobs?: boolean;
};

type AdminAiCapabilityGroup = {
  domain: AdminAiCapabilityDomain;
  effect: AdminAiCapabilityEffect;
  risk: AdminAiCapabilityRisk;
  result: AdminAiCapabilityResult;
  availability?: AdminAiCapabilityAvailability;
  tools: readonly string[];
};

const productLookupPermissions = [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
] as const satisfies readonly PermissionKey[];
const taxonomyLookupPermissions = [
  'products_write',
  'assets_write',
  'brands_categories_write',
] as const satisfies readonly PermissionKey[];
const proposalInspectionPermissions = [
  'products_write',
  'assets_write',
  'brands_categories_write',
] as const satisfies readonly PermissionKey[];

/**
 * Evidence about the execution adapters currently registered by the admin
 * assistant. This is deliberately about effects and ownership, not phrases an
 * operator might use. The reasoning model may choose different valid evidence
 * paths; the application uses this registry to constrain consequences.
 */
const capabilityGroups = [
  {
    domain: 'products',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { anyPermissions: productLookupPermissions },
    tools: ['find_products'],
  },
  {
    domain: 'products',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['products_write'] },
    tools: ['query_products', 'inspect_products', 'inspect_archived_products'],
  },
  {
    domain: 'products',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['products_write'] },
    tools: ['create_product', 'update_products', 'archive_products', 'restore_products'],
  },
  {
    domain: 'products',
    effect: 'proposal',
    risk: 'low',
    result: 'proposal',
    availability: { allPermissions: ['products_write'] },
    tools: ['suggest_discount', 'propose_product_edit'],
  },
  {
    domain: 'products',
    effect: 'background',
    risk: 'material',
    result: 'job',
    availability: { allPermissions: ['products_write'] },
    tools: ['generate_product_content', 'categorize_catalog'],
  },
  {
    domain: 'products',
    effect: 'monitor',
    risk: 'none',
    result: 'job',
    availability: { allPermissions: ['products_write'] },
    tools: ['get_product_content_job_status', 'get_catalog_categorization_status'],
  },
  {
    domain: 'taxonomy',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { anyPermissions: taxonomyLookupPermissions },
    tools: ['find_brands', 'find_categories'],
  },
  {
    domain: 'taxonomy',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['brands_categories_write'] },
    tools: ['manage_taxonomy'],
  },
  {
    domain: 'taxonomy',
    effect: 'proposal',
    risk: 'low',
    result: 'proposal',
    availability: { allPermissions: ['brands_categories_write'] },
    tools: [
      'propose_brand_edit',
      'propose_category_edit',
      'propose_brand_create',
      'propose_category_create',
    ],
  },
  {
    domain: 'orders',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['orders_write'] },
    tools: ['query_orders', 'inspect_orders', 'inspect_order_shopping_list'],
  },
  {
    domain: 'orders',
    effect: 'preview',
    risk: 'none',
    result: 'preview',
    availability: { allPermissions: ['orders_write'] },
    tools: ['preview_order_export'],
  },
  {
    domain: 'orders',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['orders_write'] },
    tools: [
      'create_order',
      'update_order_status',
      'update_order_details',
      'get_order_tracking_links',
      'save_order_shopping_list',
    ],
  },
  {
    domain: 'orders',
    effect: 'write',
    risk: 'high',
    result: 'receipt',
    availability: { allPermissions: ['orders_write'] },
    tools: ['delete_orders'],
  },
  {
    domain: 'orders',
    effect: 'background',
    risk: 'material',
    result: 'job',
    availability: { allPermissions: ['orders_write'] },
    tools: ['start_order_export'],
  },
  {
    domain: 'inventory',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['orders_write', 'products_write'] },
    tools: ['apply_order_shopping_list_inventory'],
  },
  {
    domain: 'ecotrack',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['orders_write'] },
    tools: ['load_ecotrack_requirements', 'inspect_ecotrack_shipments'],
  },
  {
    domain: 'ecotrack',
    effect: 'preview',
    risk: 'none',
    result: 'preview',
    availability: { allPermissions: ['orders_write'] },
    tools: ['preview_ecotrack_posting'],
  },
  {
    domain: 'ecotrack',
    effect: 'external',
    risk: 'high',
    result: 'receipt',
    availability: { allPermissions: ['orders_write'] },
    tools: ['post_orders_to_ecotrack', 'manage_ecotrack_shipments', 'change_ecotrack_shipments'],
  },
  {
    domain: 'inventory',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['products_write'] },
    tools: ['inspect_inventory', 'scan_inventory'],
  },
  {
    domain: 'inventory',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['products_write'] },
    tools: ['adjust_inventory', 'receive_inventory', 'update_inventory_state'],
  },
  {
    domain: 'assets',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['assets_write'] },
    tools: ['inspect_assets'],
  },
  {
    domain: 'assets',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['assets_write'] },
    tools: ['update_asset_state', 'reorder_assets', 'manage_assets'],
  },
  {
    domain: 'assets',
    effect: 'proposal',
    risk: 'low',
    result: 'proposal',
    availability: { allPermissions: ['assets_write'] },
    tools: ['suggest_featured_products'],
  },
  {
    domain: 'landingPages',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['assets_write'] },
    tools: ['inspect_landing_pages'],
  },
  {
    domain: 'landingPages',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['assets_write'] },
    tools: ['create_landing_page', 'edit_landing_page'],
  },
  {
    domain: 'landingPages',
    effect: 'proposal',
    risk: 'low',
    result: 'proposal',
    availability: { allPermissions: ['assets_write'] },
    tools: ['suggest_landing_page'],
  },
  {
    domain: 'proposals',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { anyPermissions: proposalInspectionPermissions },
    tools: ['inspect_ai_proposals'],
  },
  {
    domain: 'proposals',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { anyPermissions: proposalInspectionPermissions },
    tools: ['review_ai_proposals', 'delete_expired_ai_proposals'],
  },
  {
    domain: 'bulletin',
    effect: 'read',
    risk: 'none',
    result: 'records',
    tools: ['inspect_bulletin'],
  },
  {
    domain: 'bulletin',
    effect: 'write',
    risk: 'low',
    result: 'receipt',
    tools: ['create_bulletin_post', 'reply_bulletin_post', 'set_bulletin_reaction'],
  },
  {
    domain: 'bulletin',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    tools: ['update_bulletin_post', 'delete_bulletin_content'],
  },
  {
    domain: 'administration',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['settings_manage'] },
    tools: ['inspect_administration'],
  },
  {
    domain: 'administration',
    effect: 'write',
    risk: 'high',
    result: 'receipt',
    availability: { allPermissions: ['settings_manage'] },
    tools: ['set_access_grant', 'revoke_access_grants', 'set_role_definition'],
  },
  {
    domain: 'actionHistory',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['settings_manage'] },
    tools: ['inspect_action_history'],
  },
  {
    domain: 'actionHistory',
    effect: 'write',
    risk: 'high',
    result: 'receipt',
    availability: { allPermissions: ['settings_manage'] },
    tools: ['recover_action_history'],
  },
  {
    domain: 'storefront',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['settings_manage'] },
    tools: ['inspect_storefront_configuration'],
  },
  {
    domain: 'storefront',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['settings_manage'] },
    tools: ['update_storefront_settings', 'update_storefront_announcement'],
  },
  {
    domain: 'analytics',
    effect: 'read',
    risk: 'none',
    result: 'records',
    availability: { allPermissions: ['analytics_manage'] },
    tools: ['query_analytics', 'query_ai_stats'],
  },
  {
    domain: 'analytics',
    effect: 'write',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['analytics_manage'] },
    tools: [
      'update_analytics_settings',
      'manage_analytics_costs',
      'manage_analytics_day_overrides',
    ],
  },
  {
    domain: 'analytics',
    effect: 'external',
    risk: 'material',
    result: 'receipt',
    availability: { allPermissions: ['analytics_manage'] },
    tools: ['sync_analytics_source'],
  },
  {
    domain: 'backgroundWork',
    effect: 'monitor',
    risk: 'none',
    result: 'job',
    availability: { requiresBackgroundJobs: true },
    tools: ['list_background_jobs', 'get_background_job'],
  },
  {
    domain: 'backgroundWork',
    effect: 'background',
    risk: 'material',
    result: 'job',
    availability: { requiresBackgroundJobs: true },
    tools: ['start_background_job'],
  },
  {
    domain: 'backgroundWork',
    effect: 'write',
    risk: 'high',
    result: 'job',
    availability: { requiresBackgroundJobs: true },
    tools: ['stop_background_job'],
  },
] as const satisfies readonly AdminAiCapabilityGroup[];

export type AdminAiExecutionToolName = (typeof capabilityGroups)[number]['tools'][number];

export type AdminAiExecutionCapability = {
  toolName: AdminAiExecutionToolName;
  domain: AdminAiCapabilityDomain;
  effect: AdminAiCapabilityEffect;
  risk: AdminAiCapabilityRisk;
  result: AdminAiCapabilityResult;
  availability: AdminAiCapabilityAvailability;
};

const readToolPurposes = {
  find_products:
    'Resolve a product by title, SKU, barcode, or exact selection. Use for identity and lightweight catalog lookup.',
  query_products:
    'Query exact catalog and inventory cohorts with filters, sorting, totals, taxonomy, and promotion dates.',
  inspect_products:
    'Read complete live product records for exact product facts or before a product change.',
  inspect_archived_products:
    'Read products in the native archive. It does not inspect live catalog products.',
  get_product_content_job_status:
    'Read the latest product-content background job and its reconciled outcome.',
  get_catalog_categorization_status:
    'Read the latest catalog-categorization background job and its reconciled outcome.',
  find_brands: 'Resolve current brand identities and labels.',
  find_categories: 'Resolve current category identities, labels, and hierarchy.',
  inspect_orders:
    'Read exact operational order records or a known local-status cohort. It does not calculate Analytics metrics, source coverage, or explain aggregate performance.',
  query_orders:
    'Query local operational orders using current in-house state, status history, products, and active EcoTrack linkage.',
  inspect_order_shopping_list:
    'Read the canonical purchase and inventory requirements for an exact order scope.',
  preview_order_export:
    'Preview the exact records, exclusions, and effects of an order export without starting it.',
  load_ecotrack_requirements:
    'Read missing fields and posting eligibility for exact orders before EcoTrack posting.',
  inspect_ecotrack_shipments:
    'Read exact current provider shipment records and available shipment operations. It does not calculate historical Analytics coverage.',
  preview_ecotrack_posting:
    'Preview exact orders for an EcoTrack posting request without contacting the provider.',
  inspect_inventory: 'Read current inventory records by product, SKU, barcode, or search.',
  scan_inventory: 'Resolve one inventory scan code against current product and stock records.',
  inspect_assets: 'Read current banners, featured groups, and product-card assets.',
  inspect_landing_pages: 'Read current landing-page records and their configuration.',
  inspect_ai_proposals: 'Read reviewable AI proposals, evidence, state, and conflicts.',
  inspect_bulletin: 'Read Bulletin posts, replies, tags, and reactions.',
  inspect_administration: 'Read current staff access, roles, and permission assignments.',
  inspect_action_history: 'Read auditable application actions and their recovery state.',
  inspect_storefront_configuration:
    'Read current storefront contacts, model settings, and announcement configuration.',
  query_analytics:
    'Read canonical metrics, comparisons, source coverage, and cross-system performance evidence. It also owns metric-specific underlying-record drilldowns, including the exact eligible orders missing canonical EcoTrack coverage. Use this one capability for measured rates and their diagnostic cohorts even when the underlying records belong to Orders, EcoTrack, Meta, or Storefront.',
  query_ai_stats:
    'Read the dedicated AI Operations and Shopping Assistant Stats workspaces. Use for assistant completion, tool reliability, latency, ratings, estimated cost, workflows, releases, shopping-assistant usage, influence, and assisted-order outcomes; these datasets are not part of the general Analytics workspaces.',
  list_background_jobs: 'List current and recent background jobs permitted for the operator.',
  get_background_job: 'Read one exact background job, progress, failure, and result.',
} as const satisfies Partial<Record<AdminAiExecutionToolName, string>>;

export const ADMIN_AI_EXECUTION_CAPABILITIES = Object.freeze(
  capabilityGroups.flatMap((group) =>
    group.tools.map((toolName): AdminAiExecutionCapability => ({
      toolName,
      domain: group.domain,
      effect: group.effect,
      risk: group.risk,
      result: group.result,
      availability: 'availability' in group ? group.availability : {},
    })),
  ),
);

export const ADMIN_AI_EXECUTION_TOOL_NAMES = Object.freeze(
  ADMIN_AI_EXECUTION_CAPABILITIES.map((capability) => capability.toolName),
);

export const ADMIN_AI_MUTATING_TOOL_NAMES = Object.freeze(
  ADMIN_AI_EXECUTION_CAPABILITIES.filter(
    (capability) => !['read', 'preview', 'monitor'].includes(capability.effect),
  ).map((capability) => capability.toolName),
);

function hasCapabilityAccess(
  capability: AdminAiExecutionCapability,
  permissions: readonly PermissionKey[],
  backgroundJobsAvailable: boolean,
) {
  const { anyPermissions, allPermissions, requiresBackgroundJobs } = capability.availability;
  if (requiresBackgroundJobs && !backgroundJobsAvailable) return false;
  if (anyPermissions && !anyPermissions.some((permission) => permissions.includes(permission))) {
    return false;
  }
  if (allPermissions && !allPermissions.every((permission) => permissions.includes(permission))) {
    return false;
  }
  return true;
}

export function adminAiReadableToolNames(input: {
  permissions: readonly PermissionKey[];
  backgroundJobsAvailable: boolean;
}) {
  return ADMIN_AI_EXECUTION_CAPABILITIES.filter(
    (capability) =>
      ['read', 'preview', 'monitor'].includes(capability.effect) &&
      hasCapabilityAccess(capability, input.permissions, input.backgroundJobsAvailable),
  ).map((capability) => capability.toolName);
}

export function adminAiToolMutatesApplication(toolName: string) {
  return (ADMIN_AI_MUTATING_TOOL_NAMES as readonly string[]).includes(toolName);
}

export function adminAiCapabilityEvidenceForModel(
  permissions: readonly PermissionKey[],
  backgroundJobsAvailable: boolean,
) {
  const domains = new Map<AdminAiCapabilityDomain, Set<AdminAiCapabilityEffect>>();
  for (const capability of ADMIN_AI_EXECUTION_CAPABILITIES) {
    if (!hasCapabilityAccess(capability, permissions, backgroundJobsAvailable)) continue;
    const effects = domains.get(capability.domain) ?? new Set<AdminAiCapabilityEffect>();
    effects.add(capability.effect);
    domains.set(capability.domain, effects);
  }
  return [...domains].map(([domain, effects]) => ({ domain, effects: [...effects] }));
}

export function adminAiReadCapabilityEvidenceForModel(input: {
  permissions: readonly PermissionKey[];
  backgroundJobsAvailable: boolean;
}) {
  return ADMIN_AI_EXECUTION_CAPABILITIES.filter(
    (capability) =>
      ['read', 'preview', 'monitor'].includes(capability.effect) &&
      hasCapabilityAccess(capability, input.permissions, input.backgroundJobsAvailable),
  ).map((capability) => ({
    toolName: capability.toolName,
    domain: capability.domain,
    purpose:
      (readToolPurposes as Partial<Record<AdminAiExecutionToolName, string>>)[
        capability.toolName
      ] ?? 'Read current application evidence from this exact capability surface.',
  }));
}
