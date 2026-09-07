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
  if (!output || typeof output !== 'object') return false;
  const receipt = output as Record<string, unknown>;
  // Batch receipts report both committed items and failures. A failed sibling
  // must not hide durable changes or encourage repeating the entire batch.
  if (toolName === 'adjust_inventory' || toolName === 'receive_inventory') {
    return Array.isArray(receipt.items) && receipt.items.length > 0;
  }
  const countKey = (
    {
      update_inventory_state: 'updatedCount',
      update_products: 'updatedCount',
      archive_products: 'archivedCount',
      restore_products: 'restoredCount',
      generate_product_content: 'appliedCount',
    } as Record<string, string>
  )[toolName];
  if (countKey) return typeof receipt[countKey] === 'number' && receipt[countKey] > 0;
  if (receipt.ok !== true) return false;
  const job = (output as { job?: unknown }).job;
  if (job && typeof job === 'object') {
    const status = (job as { status?: unknown }).status;
    if (status === 'queued' || status === 'running') return false;
  }
  return true;
}
