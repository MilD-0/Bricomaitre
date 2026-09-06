/**
 * The few tool names needed to reconcile completed effects with assistant
 * narration. Tool availability itself comes from buildAdminAiTools.
 */
export const ADMIN_AI_MUTATING_TOOL_NAMES = Object.freeze([
  'create_product',
  'update_products',
  'archive_products',
  'restore_products',
  'generate_product_content',
  'categorize_catalog',
  'adjust_inventory',
  'receive_inventory',
  'update_inventory_state',
  'manage_taxonomy',
  'manage_assets',
  'reorder_assets',
  'start_landing_page_work',
  'set_landing_page_active',
  'save_order_shopping_list',
  'apply_order_shopping_list_inventory',
  'get_order_tracking_links',
  'start_order_export',
  'create_order',
  'update_order_status',
  'update_order_details',
  'delete_orders',
  'post_orders_to_ecotrack',
  'manage_ecotrack_shipments',
  'change_ecotrack_shipments',
  'update_analytics_settings',
  'manage_analytics_costs',
  'manage_analytics_day_overrides',
  'sync_analytics_source',
  'update_storefront_settings',
  'update_storefront_announcement',
] as const);

const backgroundToolNames = new Set<string>([
  'categorize_catalog',
  'start_landing_page_work',
  'start_order_export',
]);

const mutatingToolNames = new Set<string>(ADMIN_AI_MUTATING_TOOL_NAMES);

export function adminAiToolMutatesApplication(toolName: string) {
  return mutatingToolNames.has(toolName);
}

export function adminAiToolConfirmsCompletedMutation(toolName: string, output: unknown) {
  if (!mutatingToolNames.has(toolName) || backgroundToolNames.has(toolName)) return false;
  if (!output || typeof output !== 'object' || (output as { ok?: unknown }).ok !== true) {
    return false;
  }
  if (toolName === 'generate_product_content')
    return (
      typeof (output as { appliedCount?: unknown }).appliedCount === 'number' &&
      (output as { appliedCount: number }).appliedCount > 0
    );
  const job = (output as { job?: unknown }).job;
  if (job && typeof job === 'object') {
    const status = (job as { status?: unknown }).status;
    if (status === 'queued' || status === 'running') return false;
  }
  return true;
}
