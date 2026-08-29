import { tool, type ToolSet } from 'ai';

import {
  ADMIN_AI_INSPECT_ECOTRACK_SHIPMENTS_TOOL_DESCRIPTION,
  adminAiEcotrackShipmentActionSchema,
  adminAiEcotrackShipmentChangeSchema,
  adminAiEcotrackShipmentInspectionSchema,
  changeAdminAiEcotrackShipments,
  inspectAdminAiEcotrackShipments,
  manageAdminAiEcotrackShipments,
} from './admin-ai-ecotrack-shipments';
import {
  adminAiEcotrackPostingPreviewSchema,
  adminAiEcotrackPostingStartSchema,
  adminAiEcotrackRequirementsSchema,
  loadAdminAiEcotrackRequirements,
  previewAdminAiEcotrackPosting,
  startAdminAiEcotrackPosting,
} from './admin-ai-ecotrack';
import {
  adminAiOrderExportScopeSchema,
  previewAdminAiOrderExport,
  startAdminAiOrderExport,
} from './admin-ai-order-exports';
import {
  ADMIN_AI_INSPECT_ORDERS_TOOL_DESCRIPTION,
  ADMIN_AI_QUERY_ORDERS_TOOL_DESCRIPTION,
  adminAiOrderInspectionSchema,
  adminAiOrderQuerySchema,
  inspectAdminOrderDetails,
  queryAdminOrders,
} from './admin-ai-order-query';
import {
  adminAiOrderTrackingLinksSchema,
  issueAdminAiOrderTrackingLinks,
} from './admin-ai-order-tracking';
import {
  adminAiOrderCreateSchema,
  adminAiOrderDeleteSchema,
  adminAiOrderDetailsToolSchema,
  adminAiOrderStatusMutationSchema,
  createAdminAiOrder,
  deleteAdminAiOrders,
  updateAdminOrderDetailsFromTool,
  updateAdminOrderStatuses,
} from './admin-ai-orders';
import {
  adminAiShoppingListApplySchema,
  adminAiShoppingListInspectionSchema,
  adminAiShoppingListScopeSchema,
  applyAdminAiShoppingListInventory,
  inspectAdminAiShoppingList,
  saveAdminAiShoppingList,
} from './admin-ai-shopping-list';
import {
  executeAdminAiToolForRuntime,
  type AdminAiToolBuildContext,
} from './admin-ai-tool-runtime';

export function buildAdminAiOrderTools({
  permissions,
  locale,
  now,
  runtime,
}: AdminAiToolBuildContext): ToolSet {
  if (!permissions.includes('orders_write')) return {};
  const canApplyInventory = permissions.includes('products_write');

  return {
    query_orders: tool({
      description: ADMIN_AI_QUERY_ORDERS_TOOL_DESCRIPTION,
      inputSchema: adminAiOrderQuerySchema,
      execute: queryAdminOrders,
    }),
    inspect_orders: tool({
      description: ADMIN_AI_INSPECT_ORDERS_TOOL_DESCRIPTION,
      inputSchema: adminAiOrderInspectionSchema,
      execute: inspectAdminOrderDetails,
    }),
    inspect_ecotrack_shipments: tool({
      description: ADMIN_AI_INSPECT_ECOTRACK_SHIPMENTS_TOOL_DESCRIPTION,
      inputSchema: adminAiEcotrackShipmentInspectionSchema,
      execute: inspectAdminAiEcotrackShipments,
    }),
    inspect_order_shopping_list: tool({
      description:
        'Read a server-built shared shopping list for exact orders or an in-house-status cohort. It aggregates captured order quantities against live inventory and returns searchable, paginated lines, coverage, shortages, and draft IDs without writing.',
      inputSchema: adminAiShoppingListInspectionSchema,
      execute: inspectAdminAiShoppingList,
    }),
    save_order_shopping_list: tool({
      description:
        'Create, refresh, or merge the shared shopping-list draft for exact orders or an in-house-status cohort. The server rebuilds canonical lines and preserves team edits; this does not change inventory.',
      inputSchema: adminAiShoppingListScopeSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          saveAdminAiShoppingList(input, actor),
        ),
    }),
    get_order_tracking_links: tool({
      description:
        'Issue missing opaque storefront tracking tokens and return customer tracking links for exact local order IDs. Existing tokens are reused and missing orders are reported.',
      inputSchema: adminAiOrderTrackingLinksSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, () =>
          issueAdminAiOrderTrackingLinks(input, locale),
        ),
    }),
    preview_order_export: tool({
      description:
        'Preview the native order XLSX export for exact selected orders or the recent confirmed cohort. Returns field gaps, exclusions, a bounded row sample, and filename without starting work or changing order status.',
      inputSchema: adminAiOrderExportScopeSchema,
      execute: (input) => previewAdminAiOrderExport(input, now),
    }),
    start_order_export: tool({
      description:
        'Start the native background XLSX export for exact selected orders or the recent confirmed cohort. Returns a durable queued, reused, or busy job receipt; exporting never changes order status.',
      inputSchema: adminAiOrderExportScopeSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, (live) =>
          startAdminAiOrderExport(
            input,
            { ownerKey: live.actorId, conversationId: live.conversationId },
            now,
          ),
        ),
    }),
    create_order: tool({
      description:
        'Create one local submitted order from exact product IDs; repeat an ID for quantity. This does not post to EcoTrack.',
      inputSchema: adminAiOrderCreateSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          createAdminAiOrder(input, actor),
        ),
    }),
    update_order_status: tool({
      description:
        'Set the in-house status on exact local order IDs, including explicit operator corrections. no_answer requires the exact attempt count. This does not set EcoTrack status.',
      inputSchema: adminAiOrderStatusMutationSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          updateAdminOrderStatuses(input, actor),
        ),
    }),
    update_order_details: tool({
      description:
        'Change explicit local-order fields on exact IDs; omitted fields stay unchanged. This does not change an existing EcoTrack shipment.',
      inputSchema: adminAiOrderDetailsToolSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          updateAdminOrderDetailsFromTool(input, actor),
        ),
    }),
    delete_orders: tool({
      description:
        'Permanently delete exact local orders only when no active EcoTrack shipment exists. This is non-reversible.',
      inputSchema: adminAiOrderDeleteSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          deleteAdminAiOrders(input, actor),
        ),
    }),
    load_ecotrack_requirements: tool({
      description:
        'Read live EcoTrack destination and validation requirements, with repair evidence for exact invalid orders or a provider error.',
      inputSchema: adminAiEcotrackRequirementsSchema,
      execute: loadAdminAiEcotrackRequirements,
    }),
    preview_ecotrack_posting: tool({
      description:
        'Preview which confirmed orders in an exact or date cohort can be posted without writing. Returns eligible, skipped, and invalid orders; posting requires Delivro or Emir.',
      inputSchema: adminAiEcotrackPostingPreviewSchema,
      execute: (input) => previewAdminAiEcotrackPosting(input, { now }),
    }),
    post_orders_to_ecotrack: tool({
      description:
        'Start canonical background posting for an exact cohort and chosen provider. Local status becomes posted only after successful provider creation.',
      inputSchema: adminAiEcotrackPostingStartSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, (live) =>
          startAdminAiEcotrackPosting(input, {
            ownerKey: live.actorId,
            actor: live.actor,
            conversationId: live.conversationId,
            now,
          }),
        ),
    }),
    manage_ecotrack_shipments: tool({
      description:
        'Refresh, dispatch, add an update, request return, prepare labels, or delete exact existing EcoTrack shipments. Provider restrictions are enforced; successful deletion restores the local order to confirmed.',
      inputSchema: adminAiEcotrackShipmentActionSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          manageAdminAiEcotrackShipments(input, actor),
        ),
    }),
    change_ecotrack_shipments: tool({
      description:
        'Change explicit fields on exact existing EcoTrack shipments. auto edits a ready-to-ship shipment or recreates it when the provider no longer allows editing; returns the operation and failures.',
      inputSchema: adminAiEcotrackShipmentChangeSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          changeAdminAiEcotrackShipments(input, actor),
        ),
    }),
    ...(canApplyInventory
      ? {
          apply_order_shopping_list_inventory: tool({
            description:
              'Decrease inventory for all or exact eligible lines in a saved shared shopping-list draft. Successful lines are marked applied; shortages, unmatched lines, repeats, and rejected changes remain explicit. Orders are unchanged.',
            inputSchema: adminAiShoppingListApplySchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                applyAdminAiShoppingListInventory(input, actor),
              ),
          }),
        }
      : {}),
  } satisfies ToolSet;
}
