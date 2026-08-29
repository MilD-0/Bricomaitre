import { tool, type ToolSet } from 'ai';

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
import { adminAiTaxonomyMutationSchema, manageAdminAiTaxonomy } from './admin-ai-taxonomy';
import {
  adminAiToolActorId,
  executeAdminAiToolForRuntime,
  type AdminAiToolBuildContext,
} from './admin-ai-tool-runtime';
import { productPayloadSchema } from './products';

export function buildAdminAiCatalogTools({
  permissions,
  runtime,
}: AdminAiToolBuildContext): ToolSet {
  const canFindProducts =
    permissions.includes('products_write') ||
    permissions.includes('orders_write') ||
    permissions.includes('assets_write') ||
    permissions.includes('brands_categories_write');
  const canFindTaxonomy =
    permissions.includes('products_write') ||
    permissions.includes('assets_write') ||
    permissions.includes('brands_categories_write');
  const canManageProducts = permissions.includes('products_write');
  const canManageTaxonomy = permissions.includes('brands_categories_write');
  const autoApply = runtime.kind === 'live' && runtime.autoAcceptProposals;
  const actorId = adminAiToolActorId(runtime);

  return {
    ...(canFindProducts
      ? {
          find_products: tool({
            description: ADMIN_AI_FIND_PRODUCTS_TOOL_DESCRIPTION,
            inputSchema: adminAiCatalogProductLookupSchema,
            execute: findAdminCatalogProducts,
          }),
        }
      : {}),
    ...(canFindTaxonomy
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
    ...(canManageProducts
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
              executeAdminAiToolForRuntime(runtime, product, ({ actor }) =>
                createAdminAiProduct({ product }, actor),
              ),
          }),
          update_products: tool({
            description:
              'Change specified fields on exact current product IDs. Omitted fields are preserved; returns previous values for the changed fields.',
            inputSchema: adminAiProductUpdateSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                updateAdminAiProducts(input, actor),
              ),
          }),
          archive_products: tool({
            description:
              'Archive exact current product IDs. Their records, inventory, and taxonomy assignments are retained.',
            inputSchema: adminAiProductArchiveSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                archiveAdminAiProducts(input, actor),
              ),
          }),
          restore_products: tool({
            description:
              'Restore exact archived product IDs. Restore only removes archive state; it does not reactivate or restock them.',
            inputSchema: adminAiProductRestoreSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                restoreAdminAiProducts(input, actor),
              ),
          }),
          adjust_inventory: tool({
            description:
              'Increase or decrease inventory quantities for exact product IDs by positive deltas. Returns previous and resulting quantities.',
            inputSchema: adminAiInventoryAdjustmentSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                adjustAdminInventory(input, actor),
              ),
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
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                receiveAdminInventory(input, actor),
              ),
          }),
          update_inventory_state: tool({
            description:
              'Set in-stock state or barcode on exact product IDs. This does not change inventory quantity.',
            inputSchema: adminAiInventoryStateSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                updateAdminInventoryState(input, actor),
              ),
          }),
          generate_product_content: tool({
            description: [
              'Generate French or Arabic product titles and descriptions for exact products, or missing fields across the active catalog. Small exact scopes return proposals inline; larger work returns a durable background job.',
              autoApply
                ? 'Operator auto-apply is enabled: generated proposals are applied and conflicts remain pending.'
                : 'Operator auto-apply is disabled: generated proposals remain pending for review.',
            ].join(' '),
            inputSchema: adminAiProductContentGenerationSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, (live) =>
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
              autoApply
                ? 'Operator auto-apply is enabled: generated proposals are applied and ambiguous or conflicting products remain unchanged.'
                : 'Operator auto-apply is disabled: category proposals remain pending for review.',
            ].join(' '),
            inputSchema: adminAiCatalogCategorizationSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, (live) =>
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
    ...(canManageTaxonomy
      ? {
          manage_taxonomy: tool({
            description:
              'Create, update, or delete one brand or category through the canonical catalog workflow.',
            inputSchema: adminAiTaxonomyMutationSchema,
            execute: (input) =>
              executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
                manageAdminAiTaxonomy(input, actor),
              ),
          }),
        }
      : {}),
  } satisfies ToolSet;
}
