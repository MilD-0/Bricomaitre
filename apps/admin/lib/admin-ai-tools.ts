import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import type { ActionActor } from './action-history';
import {
  ADMIN_AI_STATS_TOOL_DESCRIPTION,
  adminAiStatsQuerySchema,
  queryAdminAiStats,
} from './admin-ai-ai-stats';
import {
  adminAiAnalyticsCostsMutationSchema,
  adminAiAnalyticsDayOverridesMutationSchema,
  adminAiAnalyticsSettingsPatchSchema,
  adminAiAnalyticsSyncSchema,
  manageAdminAiAnalyticsCosts,
  manageAdminAiAnalyticsDayOverrides,
  syncAdminAiAnalyticsSource,
  updateAdminAiAnalyticsSettings,
} from './admin-ai-analytics-actions';
import {
  ADMIN_AI_INSPECT_ASSETS_TOOL_DESCRIPTION,
  ADMIN_AI_MANAGE_ASSETS_TOOL_DESCRIPTION,
  ADMIN_AI_REORDER_ASSETS_TOOL_DESCRIPTION,
  adminAiAssetCrudSchema,
  adminAiAssetInspectionSchema,
  adminAiAssetReorderSchema,
  inspectAdminAiAssets,
  manageAdminAiAsset,
  reorderAdminAiAssets,
} from './admin-ai-assets';
import {
  ADMIN_AI_FIND_PRODUCTS_TOOL_DESCRIPTION,
  ADMIN_AI_INSPECT_ARCHIVED_PRODUCTS_TOOL_DESCRIPTION,
  ADMIN_AI_INSPECT_PRODUCTS_TOOL_DESCRIPTION,
  adminAiArchivedCatalogProductInspectionSchema,
  adminAiCatalogProductInspectionSchema,
  adminAiCatalogProductLookupSchema,
  findAdminCatalogProducts,
  inspectAdminArchivedCatalogProducts,
  inspectAdminCatalogProducts,
} from './admin-ai-catalog';
import {
  ADMIN_AI_FIND_BRANDS_TOOL_DESCRIPTION,
  ADMIN_AI_FIND_CATEGORIES_TOOL_DESCRIPTION,
  ADMIN_AI_QUERY_PRODUCTS_TOOL_DESCRIPTION,
  adminAiBrandQuerySchema,
  adminAiCatalogQuerySchema,
  adminAiCategoryQuerySchema,
  queryAdminBrands,
  queryAdminCatalogProducts,
  queryAdminCategories,
} from './admin-ai-catalog-query';
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
  adminAiInventoryAdjustmentSchema,
  adminAiInventoryReceiptSchema,
  adminAiInventoryScanSchema,
  adminAiInventoryStateSchema,
  adjustAdminInventory,
  receiveAdminInventory,
  scanAdminInventory,
  updateAdminInventoryState,
} from './admin-ai-inventory';
import {
  ADMIN_AI_START_LANDING_PAGE_WORK_TOOL_DESCRIPTION,
  adminAiLandingPageJobStatusSchema,
  adminAiLandingPageWorkSchema,
  getAdminAiLandingPageJobStatus,
  startAdminAiLandingPageWork,
} from './admin-ai-landing-page-jobs';
import {
  ADMIN_AI_INSPECT_LANDING_PAGES_TOOL_DESCRIPTION,
  adminAiLandingPageInspectionSchema,
  adminAiLandingPagePublicationSchema,
  inspectAdminAiLandingPages,
  setAdminAiLandingPagePublication,
} from './admin-ai-landing-pages';
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
  ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
  ADMIN_AI_PRESENTATION_TOOL_NAME,
  adminAiPresentationPlanSchema,
} from './admin-ai-presentation';
import {
  adminAiCatalogCategorizationSchema,
  adminAiProductContentGenerationSchema,
  adminAiProductJobStatusSchema,
  generateAdminAiProductContent,
  getAdminAiCatalogCategorizationStatus,
  getAdminAiProductContentJobStatus,
  startAdminAiCatalogCategorization,
} from './admin-ai-product-jobs';
import {
  adminAiProductArchiveSchema,
  adminAiProductRestoreSchema,
  adminAiProductUpdateSchema,
  archiveAdminAiProducts,
  createAdminAiProduct,
  restoreAdminAiProducts,
  updateAdminAiProducts,
} from './admin-ai-products';
import {
  ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
  type AdminAiGuidanceTopic,
  adminAiGuidanceRequestSchemaForTopics,
  readAdminAiGuidanceForTopics,
} from './admin-ai-runtime';
import {
  adminAiShoppingListApplySchema,
  adminAiShoppingListInspectionSchema,
  adminAiShoppingListScopeSchema,
  applyAdminAiShoppingListInventory,
  inspectAdminAiShoppingList,
  saveAdminAiShoppingList,
} from './admin-ai-shopping-list';
import {
  inspectAdminStorefrontConfiguration,
  storefrontAnnouncementMutationSchema,
  storefrontSettingsToolSchema,
  updateAdminStorefrontAnnouncement,
  updateAdminStorefrontSettingsFromTool,
} from './admin-ai-storefront';
import { adminAiTaxonomyMutationSchema, manageAdminAiTaxonomy } from './admin-ai-taxonomy';
import type { PermissionKey } from './permissions';
import { productPayloadSchema } from './products';
import { adminAiAnalyticsQuerySchema, queryAdminAnalytics } from './ai-analytics';

const ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION = [
  'Read canonical live Analytics evidence.',
  'Results include metric meanings, dates, coverage, estimation, sources, and warnings. Use focus for useful underlying rows and sourceCoverage for the exact EcoTrack denominator and missing eligible orders.',
].join(' ');

type LiveToolRuntime = {
  kind: 'live';
  actorId: string;
  actor: ActionActor;
  conversationId: number;
  autoAcceptProposals: boolean;
};

type EvaluationToolRuntime = {
  kind: 'evaluation';
  actorId?: string;
};

export type AdminAiToolRuntime = LiveToolRuntime | EvaluationToolRuntime;

export type BuildAdminAiToolsInput = {
  permissions: readonly PermissionKey[];
  locale: 'en' | 'fr' | 'ar';
  now?: Date;
  runtime: AdminAiToolRuntime;
};

export function adminAiEvaluationReceipt(input: unknown) {
  return {
    kind: 'evaluation_noop' as const,
    applied: false as const,
    reason: 'Read-only evaluation: no application state was changed.',
    receivedInput: input,
  };
}

async function executeForRuntime<T>(
  runtime: AdminAiToolRuntime,
  input: unknown,
  execute: (live: LiveToolRuntime) => T | Promise<T>,
) {
  return runtime.kind === 'evaluation' ? adminAiEvaluationReceipt(input) : execute(runtime);
}

export function buildAdminAiTools({
  permissions,
  locale,
  now = new Date(),
  runtime,
}: BuildAdminAiToolsInput): ToolSet {
  const hasAnalytics = permissions.includes('analytics_manage');
  const hasCatalogLookup =
    permissions.includes('products_write') ||
    permissions.includes('orders_write') ||
    permissions.includes('assets_write') ||
    permissions.includes('brands_categories_write');
  const hasTaxonomyLookup =
    permissions.includes('products_write') ||
    permissions.includes('assets_write') ||
    permissions.includes('brands_categories_write');
  const canInspectProducts = permissions.includes('products_write');
  const hasOrders = permissions.includes('orders_write');
  const hasStorefrontSettings = permissions.includes('settings_manage');
  const hasAssets = permissions.includes('assets_write');
  const canMutateTaxonomy = permissions.includes('brands_categories_write');
  const guidanceTopics: AdminAiGuidanceTopic[] = [
    ...(hasAnalytics
      ? ([
          'analytics_profit',
          'analytics_order_lifecycle',
          'analytics_sources_and_coverage',
          'analytics_dates_and_comparisons',
          'analytics_storefront_and_attribution',
          'ai_stats_operations',
          'ai_stats_shopping',
        ] satisfies AdminAiGuidanceTopic[])
      : []),
    ...(hasCatalogLookup ? (['catalog'] satisfies AdminAiGuidanceTopic[]) : []),
    ...(hasOrders ? (['orders'] satisfies AdminAiGuidanceTopic[]) : []),
    ...(hasStorefrontSettings ? (['storefront'] satisfies AdminAiGuidanceTopic[]) : []),
    ...(hasAssets ? (['assets', 'landing_pages'] satisfies AdminAiGuidanceTopic[]) : []),
  ];
  const permittedGuidanceTopics = guidanceTopics as [
    AdminAiGuidanceTopic,
    ...AdminAiGuidanceTopic[],
  ];
  const hasEvidenceTools =
    hasAnalytics || hasCatalogLookup || hasOrders || hasStorefrontSettings || hasAssets;
  const autoAcceptProposals = runtime.kind === 'live' && runtime.autoAcceptProposals;
  const actorId =
    runtime.kind === 'live' ? runtime.actorId : (runtime.actorId ?? 'admin-ai-wide-eval');

  return {
    ...(guidanceTopics.length > 0
      ? {
          read_system_guidance: tool({
            description: ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
            inputSchema: adminAiGuidanceRequestSchemaForTopics(permittedGuidanceTopics),
            execute: (input) => readAdminAiGuidanceForTopics(permittedGuidanceTopics, input),
          }),
        }
      : {}),
    ...(hasCatalogLookup
      ? {
          find_products: tool({
            description: ADMIN_AI_FIND_PRODUCTS_TOOL_DESCRIPTION,
            inputSchema: adminAiCatalogProductLookupSchema,
            execute: findAdminCatalogProducts,
          }),
        }
      : {}),
    ...(hasTaxonomyLookup
      ? {
          find_brands: tool({
            description: ADMIN_AI_FIND_BRANDS_TOOL_DESCRIPTION,
            inputSchema: adminAiBrandQuerySchema,
            execute: (input) => queryAdminBrands(input),
          }),
          find_categories: tool({
            description: ADMIN_AI_FIND_CATEGORIES_TOOL_DESCRIPTION,
            inputSchema: adminAiCategoryQuerySchema,
            execute: (input) => queryAdminCategories(input),
          }),
        }
      : {}),
    ...(canInspectProducts
      ? {
          query_products: tool({
            description: ADMIN_AI_QUERY_PRODUCTS_TOOL_DESCRIPTION,
            inputSchema: adminAiCatalogQuerySchema,
            execute: (input) => queryAdminCatalogProducts(input),
          }),
          inspect_products: tool({
            description: ADMIN_AI_INSPECT_PRODUCTS_TOOL_DESCRIPTION,
            inputSchema: adminAiCatalogProductInspectionSchema,
            execute: inspectAdminCatalogProducts,
          }),
          inspect_archived_products: tool({
            description: ADMIN_AI_INSPECT_ARCHIVED_PRODUCTS_TOOL_DESCRIPTION,
            inputSchema: adminAiArchivedCatalogProductInspectionSchema,
            execute: inspectAdminArchivedCatalogProducts,
          }),
          create_product: tool({
            description:
              'Create one product. Title and selling price are required; omitted catalog fields use their normal defaults. Returns the saved product.',
            inputSchema: productPayloadSchema,
            execute: (product) =>
              executeForRuntime(runtime, product, ({ actor }) =>
                createAdminAiProduct({ product }, actor),
              ),
          }),
          update_products: tool({
            description:
              'Change specified fields on exact current product IDs. Omitted fields are preserved; returns previous values for the changed fields.',
            inputSchema: adminAiProductUpdateSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) => updateAdminAiProducts(input, actor)),
          }),
          archive_products: tool({
            description:
              'Archive exact current product IDs. Their records, inventory, and taxonomy assignments are retained.',
            inputSchema: adminAiProductArchiveSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) =>
                archiveAdminAiProducts(input, actor),
              ),
          }),
          restore_products: tool({
            description:
              'Restore exact archived product IDs. Restore only removes archive state; it does not reactivate or restock them.',
            inputSchema: adminAiProductRestoreSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) =>
                restoreAdminAiProducts(input, actor),
              ),
          }),
          adjust_inventory: tool({
            description:
              'Increase or decrease inventory quantities for exact product IDs by positive deltas. Returns previous and resulting quantities.',
            inputSchema: adminAiInventoryAdjustmentSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) => adjustAdminInventory(input, actor)),
          }),
          scan_inventory: tool({
            description:
              'Resolve one Inventory scanner value without writing. Exact numeric input checks for a local order ID first, then falls back to an exact barcode.',
            inputSchema: adminAiInventoryScanSchema,
            execute: scanAdminInventory,
          }),
          receive_inventory: tool({
            description:
              'Increase exact product quantities from an inspected order or barcode scan. order_scan requires its order ID; barcode_scan has no order ID. Returns resulting quantities and skipped rows.',
            inputSchema: adminAiInventoryReceiptSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) => receiveAdminInventory(input, actor)),
          }),
          update_inventory_state: tool({
            description:
              'Set in-stock state or barcode on exact product IDs. This does not change inventory quantity.',
            inputSchema: adminAiInventoryStateSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) =>
                updateAdminInventoryState(input, actor),
              ),
          }),
          generate_product_content: tool({
            description: [
              'Generate French or Arabic product titles and descriptions for exact products, or missing fields across the active catalog. Small exact scopes return proposals inline; larger work returns a durable background job.',
              autoAcceptProposals
                ? 'Operator auto-apply is enabled: generated proposals are applied and conflicts remain pending.'
                : 'Operator auto-apply is disabled: generated proposals remain pending for review.',
            ].join(' '),
            inputSchema: adminAiProductContentGenerationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, (live) =>
                generateAdminAiProductContent(input, {
                  ownerKey: live.actorId,
                  actor: live.actor,
                  conversationId: live.conversationId,
                  autoApply: live.autoAcceptProposals,
                }),
              ),
          }),
          get_product_content_job_status: tool({
            description:
              'Read this operator’s latest product-content job progress, failure, and terminal result. Queued or running is not completed.',
            inputSchema: adminAiProductJobStatusSchema,
            execute: () => getAdminAiProductContentJobStatus(actorId),
          }),
          categorize_catalog: tool({
            description: [
              'Start one durable job that classifies active or uncategorized products against the current active category hierarchy and creates category-change proposals.',
              autoAcceptProposals
                ? 'Operator auto-apply is enabled: generated proposals are applied and ambiguous or conflicting products remain unchanged.'
                : 'Operator auto-apply is disabled: category proposals remain pending for review.',
            ].join(' '),
            inputSchema: adminAiCatalogCategorizationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, (live) =>
                startAdminAiCatalogCategorization(input, {
                  ownerKey: live.actorId,
                  actor: live.actor,
                  conversationId: live.conversationId,
                  autoApply: live.autoAcceptProposals,
                }),
              ),
          }),
          get_catalog_categorization_status: tool({
            description:
              'Read the latest catalog-categorization job progress, ambiguity/failure counts, and terminal result. Queued or running is not completed.',
            inputSchema: adminAiProductJobStatusSchema,
            execute: () => getAdminAiCatalogCategorizationStatus(actorId),
          }),
        }
      : {}),
    ...(canMutateTaxonomy
      ? {
          manage_taxonomy: tool({
            description:
              'Create, update, or delete one brand or category through the canonical catalog workflow.',
            inputSchema: adminAiTaxonomyMutationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) => manageAdminAiTaxonomy(input, actor)),
          }),
        }
      : {}),
    ...(hasAssets
      ? {
          inspect_assets: tool({
            description: ADMIN_AI_INSPECT_ASSETS_TOOL_DESCRIPTION,
            inputSchema: adminAiAssetInspectionSchema,
            execute: inspectAdminAiAssets,
          }),
          manage_assets: tool({
            description: ADMIN_AI_MANAGE_ASSETS_TOOL_DESCRIPTION,
            inputSchema: adminAiAssetCrudSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) => manageAdminAiAsset(input, actor)),
          }),
          reorder_assets: tool({
            description: ADMIN_AI_REORDER_ASSETS_TOOL_DESCRIPTION,
            inputSchema: adminAiAssetReorderSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, () => reorderAdminAiAssets(input)),
          }),
          inspect_landing_pages: tool({
            description: ADMIN_AI_INSPECT_LANDING_PAGES_TOOL_DESCRIPTION,
            inputSchema: adminAiLandingPageInspectionSchema,
            execute: (input) => inspectAdminAiLandingPages(input),
          }),
          start_landing_page_work: tool({
            description: ADMIN_AI_START_LANDING_PAGE_WORK_TOOL_DESCRIPTION,
            inputSchema: adminAiLandingPageWorkSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, (live) =>
                startAdminAiLandingPageWork(input, {
                  ownerKey: live.actorId,
                  actor: live.actor,
                  conversationId: live.conversationId,
                }),
              ),
          }),
          set_landing_page_active: tool({
            description:
              'Publish or unpublish one exact landing-page revision without changing its content. This is reversible and does not delete the page.',
            inputSchema: adminAiLandingPagePublicationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) =>
                setAdminAiLandingPagePublication(input, actor),
              ),
          }),
          get_landing_page_job_status: tool({
            description:
              'Read this operator’s latest landing-page job progress, partial generation details, failure, and saved result. Queued or running is not completed.',
            inputSchema: adminAiLandingPageJobStatusSchema,
            execute: () => getAdminAiLandingPageJobStatus(actorId),
          }),
        }
      : {}),
    ...(hasOrders
      ? {
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
              executeForRuntime(runtime, input, ({ actor }) =>
                saveAdminAiShoppingList(input, actor),
              ),
          }),
          get_order_tracking_links: tool({
            description:
              'Issue missing opaque storefront tracking tokens and return customer tracking links for exact local order IDs. Existing tokens are reused and missing orders are reported.',
            inputSchema: adminAiOrderTrackingLinksSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, () =>
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
              executeForRuntime(runtime, input, (live) =>
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
              executeForRuntime(runtime, input, ({ actor }) => createAdminAiOrder(input, actor)),
          }),
          update_order_status: tool({
            description:
              'Set the in-house status on exact local order IDs, including explicit operator corrections. no_answer requires the exact attempt count. This does not set EcoTrack status.',
            inputSchema: adminAiOrderStatusMutationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) =>
                updateAdminOrderStatuses(input, actor),
              ),
          }),
          update_order_details: tool({
            description:
              'Change explicit local-order fields on exact IDs; omitted fields stay unchanged. This does not change an existing EcoTrack shipment.',
            inputSchema: adminAiOrderDetailsToolSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) =>
                updateAdminOrderDetailsFromTool(input, actor),
              ),
          }),
          delete_orders: tool({
            description:
              'Permanently delete exact local orders only when no active EcoTrack shipment exists. This is non-reversible.',
            inputSchema: adminAiOrderDeleteSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) => deleteAdminAiOrders(input, actor)),
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
              executeForRuntime(runtime, input, (live) =>
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
              executeForRuntime(runtime, input, ({ actor }) =>
                manageAdminAiEcotrackShipments(input, actor),
              ),
          }),
          change_ecotrack_shipments: tool({
            description:
              'Change explicit fields on exact existing EcoTrack shipments. auto edits a ready-to-ship shipment or recreates it when the provider no longer allows editing; returns the operation and failures.',
            inputSchema: adminAiEcotrackShipmentChangeSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actor }) =>
                changeAdminAiEcotrackShipments(input, actor),
              ),
          }),
          ...(canInspectProducts
            ? {
                apply_order_shopping_list_inventory: tool({
                  description:
                    'Decrease inventory for all or exact eligible lines in a saved shared shopping-list draft. Successful lines are marked applied; shortages, unmatched lines, repeats, and rejected changes remain explicit. Orders are unchanged.',
                  inputSchema: adminAiShoppingListApplySchema,
                  execute: (input) =>
                    executeForRuntime(runtime, input, ({ actor }) =>
                      applyAdminAiShoppingListInventory(input, actor),
                    ),
                }),
              }
            : {}),
        }
      : {}),
    ...(hasAnalytics
      ? {
          query_analytics: tool({
            description: ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
            inputSchema: adminAiAnalyticsQuerySchema,
            execute: queryAdminAnalytics,
          }),
          query_ai_stats: tool({
            description: ADMIN_AI_STATS_TOOL_DESCRIPTION,
            inputSchema: adminAiStatsQuerySchema,
            execute: queryAdminAiStats,
          }),
          update_analytics_settings: tool({
            description:
              'Change the canonical planning return rate and return the persisted before and after values.',
            inputSchema: adminAiAnalyticsSettingsPatchSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, () => updateAdminAiAnalyticsSettings(input)),
          }),
          manage_analytics_costs: tool({
            description:
              'Create, update, or delete exact operating-cost records used by true profit. Updates preserve omitted fields and return a persisted outcome for each requested operation.',
            inputSchema: adminAiAnalyticsCostsMutationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, () => manageAdminAiAnalyticsCosts(input)),
          }),
          manage_analytics_day_overrides: tool({
            description:
              'Set or reset exact calculator-day overrides for gross profit, planning return rate, confirmed orders, or an operator note. Omitted fields stay unchanged and null clears a named value.',
            inputSchema: adminAiAnalyticsDayOverridesMutationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, () => manageAdminAiAnalyticsDayOverrides(input)),
          }),
          sync_analytics_source: tool({
            description:
              'Synchronize an exact Meta or Search Console date range through the canonical integration. Meta ranges are limited to 90 days; returns the source operation result.',
            inputSchema: adminAiAnalyticsSyncSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, () => syncAdminAiAnalyticsSource(input)),
          }),
        }
      : {}),
    ...(hasStorefrontSettings
      ? {
          inspect_storefront_configuration: tool({
            description:
              'Read the current Storefront contact, customer assistant, configured model choices, and bilingual announcement settings.',
            inputSchema: z.object({}).strict(),
            execute: inspectAdminStorefrontConfiguration,
          }),
          update_storefront_settings: tool({
            description:
              'Change only the named Storefront contact, link, or customer-assistant settings. Omitted settings stay unchanged.',
            inputSchema: storefrontSettingsToolSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, () => updateAdminStorefrontSettingsFromTool(input)),
          }),
          update_storefront_announcement: tool({
            description:
              'Replace the French and Arabic Storefront announcement messages and their shared active state. Both messages are required when active.',
            inputSchema: storefrontAnnouncementMutationSchema,
            execute: (input) =>
              executeForRuntime(runtime, input, ({ actorId }) =>
                updateAdminStorefrontAnnouncement(input, actorId),
              ),
          }),
        }
      : {}),
    ...(hasEvidenceTools
      ? {
          [ADMIN_AI_PRESENTATION_TOOL_NAME]: tool({
            description: ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
            inputSchema: adminAiPresentationPlanSchema.omit({ kind: true }),
            execute: async (input) =>
              adminAiPresentationPlanSchema.parse({ kind: 'admin_ui_blocks_v1', ...input }),
          }),
        }
      : {}),
  } satisfies ToolSet;
}
