import {
  compactAiEvalSuiteReport,
  createAiLanguageModel,
  getAiConfig,
  runAiEvalSuite,
  type AiEvalTranscript,
} from '@bric/ai-core';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { ADMIN_AI_CHAT_INSTRUCTIONS } from '../lib/ai-admin-chat';
import {
  ADMIN_AI_ANALYTICS_INSTRUCTIONS,
  ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
} from '../lib/admin-ai-analytics-contract';
import {
  adminAiAnalyticsQueriesForPlan,
  adminAiAnalyticsPlanMessage,
  isAdminAiAnalyticsContinuationMessage,
  planAdminAiAnalyticsQuery,
  type AdminAiAnalyticsQueryPlan,
} from '../lib/admin-ai-analytics-plan';
import {
  ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
  analyticsAnswerRequirements,
  adminAiAnalyticsQuerySchemaForPlan,
  adminAiAnalyticsQuerySchema,
  queryAdminAnalyticsInvestigation,
} from '../lib/ai-analytics';
import {
  adminAiAnalyticsCostsMutationSchemaForMessage,
  adminAiAnalyticsDayOverridesMutationSchemaForMessage,
  adminAiAnalyticsSettingsPatchSchemaForMessage,
  adminAiAnalyticsSyncSchemaForContext,
} from '../lib/admin-ai-analytics-actions';
import { ADMIN_AI_EVAL_SCENARIOS, type AdminAiEvalInput } from '../lib/ai-eval-scenarios';
import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_MAX_OUTPUT_TOKENS,
  resolveAdminAiModel,
} from '../lib/admin-ai-models';
import {
  adminAiGroundingTool,
  adminAiMutationTool,
  adminAiStepPlan,
} from '../lib/admin-ai-tool-plan';
import {
  adminAiLandingPageCreateSchema,
  adminAiLandingPageEditSchema,
} from '../lib/admin-ai-landing-pages';
import {
  adminAiOrderCreateSchema,
  adminAiOrderDeleteSchema,
  adminAiOrderDetailsToolSchema,
  adminAiOrderStatusMutationSchema,
} from '../lib/admin-ai-orders';
import { adminAiOrderExportScopeSchemaForMessage } from '../lib/admin-ai-order-exports';
import { adminAiOrderTrackingLinksSchema } from '../lib/admin-ai-order-tracking';
import {
  adminAiShoppingListApplySchema,
  adminAiShoppingListScopeSchema,
} from '../lib/admin-ai-shopping-list';
import {
  adminAiEcotrackPostingPreviewSchema,
  adminAiEcotrackPostingStartSchema,
  adminAiEcotrackRequirementsSchema,
} from '../lib/admin-ai-ecotrack';
import {
  adminAiEcotrackShipmentActionSchema,
  adminAiEcotrackShipmentChangeSchema,
  adminAiEcotrackShipmentInspectionSchema,
} from '../lib/admin-ai-ecotrack-shipments';
import {
  adminAiInventoryAdjustmentSchema,
  adminAiInventoryReceiptSchema,
  adminAiInventoryScanSchema,
  adminAiInventoryStateSchema,
} from '../lib/admin-ai-inventory';
import { adminAiAssetCrudSchema } from '../lib/admin-ai-assets';
import { adminAssetStateMutationSchema } from '../lib/asset-mutations';
import { adminAiProposalReviewSchema } from '../lib/admin-ai-proposal-review';
import {
  adminAiAccessGrantSchema,
  adminAiAccessRevocationSchema,
  adminAiRoleDefinitionSchema,
} from '../lib/admin-ai-administration';
import {
  adminAiActionHistoryInspectionSchema,
  adminAiActionHistoryRecoverySchema,
} from '../lib/admin-ai-action-history';
import {
  storefrontAnnouncementMutationSchema,
  storefrontSettingsToolSchema,
} from '../lib/admin-ai-storefront';
import {
  adminAiInventoryInspectionSchema,
  adminAiProductLookupSchema,
} from '../lib/admin-ai-domain';
import {
  adminAiBulletinDeleteSchema,
  adminAiBulletinPostSchema,
  adminAiBulletinPostUpdateSchema,
  adminAiBulletinReactionSchema,
  adminAiBulletinReplySchema,
} from '../lib/admin-ai-bulletin';
import {
  adminAiArchivedProductInspectionSchema,
  adminAiProductArchiveSchema,
  adminAiProductCreateSchema,
  adminAiProductRestoreSchema,
  adminAiProductUpdateSchema,
} from '../lib/admin-ai-products';
import { adminAiTaxonomyMutationSchema } from '../lib/admin-ai-taxonomy';
import { permissionCatalog } from '../lib/permissions';
import type { AiEvalScenario } from '@bric/ai-core/evals';

const descriptions: Record<string, string> = {
  inspect_orders: 'Read complete live order, customer, delivery, product, value, and status data.',
  create_order:
    'Create one canonical local order from exact product IDs and operator-supplied customer and delivery values.',
  delete_orders:
    'Delete exact inspected local orders and disclose whether an external carrier shipment may remain.',
  preview_order_export:
    'Preview the native selected or complete recent-confirmed Orders Excel export with exact row counts, exclusions, required-field gaps, a labeled sample, and its completion status effect.',
  start_order_export:
    'Start the native server-owned Orders Excel export after preview. Confirmed mode must keep orderIds [] because the server reloads the complete cohort; never copy preview IDs. Queued is not complete; confirmed exports dispatch successfully exported orders after file creation.',
  get_order_tracking_links:
    'Issue missing opaque customer tracking tokens and return canonical storefront tracking links for exact inspected orders.',
  inspect_order_shopping_list:
    'Preview the native shared shopping list for exact selected orders or a complete status cohort, including current inventory coverage, shortages, unmatched lines, and saved team-draft state, without writing.',
  save_order_shopping_list:
    'Rebuild and save or merge the native shared order shopping list from the complete canonical cohort without changing inventory.',
  apply_order_shopping_list_inventory:
    'Decrease inventory for eligible lines in a saved shared shopping list and report every applied, rejected, missing, unmatched, already-applied, or uncovered line. Use selection all with draftIds [] for all, every, toute, or the whole list; exact is only for a named subset. Report applicationSummary.appliedUnits as the exact applied total; inventoryCoveredUnits is not an applied total.',
  preview_ecotrack_posting:
    'Resolve and validate an exact ECOTRACK posting cohort without mutating it, then require a Delivro or Emir choice.',
  load_ecotrack_requirements:
    'Load canonical ECOTRACK posting documentation, current order evidence, and live destination matches before repair.',
  post_orders_to_ecotrack:
    'Start one server-owned ECOTRACK posting job for the previewed scope and explicit provider.',
  inspect_ecotrack_shipments:
    'Read fresh native ECOTRACK shipment state, allowed actions, MAJ entries, and tracking history.',
  manage_ecotrack_shipments:
    'Refresh, dispatch, add a MAJ, request return, prepare label downloads, or delete exact inspected ECOTRACK shipments with partial results.',
  change_ecotrack_shipments:
    'Edit or canonically recreate exact inspected carrier shipments using explicit field operations while preserving omitted fields.',
  update_order_status: 'Update exact inspected orders through the canonical order workflow.',
  update_order_details:
    'Correct exact inspected order customer, delivery, address, note, or product-line details.',
  inspect_inventory: 'Read current inventory levels, movements, and low-stock products.',
  scan_inventory:
    'Preview one exact native Inventory order-ID or barcode scan with catalog matches and quantities.',
  adjust_inventory: 'Increase or decrease exact resolved inventory quantities.',
  receive_inventory:
    'Receive exact previewed order or barcode quantities through canonical inventory history.',
  update_inventory_state:
    'Set or clear exact inspected product barcodes and sellability through canonical Inventory updates.',
  inspect_assets: 'Read current asset inventory, usage, size, and missing media state.',
  inspect_landing_pages:
    'Read complete current landing-page documents, revisions, publication state, and ordered blocks.',
  create_landing_page:
    'Generate and persist one complete validated landing page for an exact resolved product.',
  edit_landing_page:
    'Apply a staged, revision-safe landing-page edit while preserving unaffected blocks.',
  update_asset_state: 'Activate, deactivate, or place exact inspected merchandising assets.',
  reorder_assets: 'Persist an explicit complete ordering for one inspected asset kind.',
  manage_assets:
    'Create, completely replace, or delete one exact banner, featured group, or product card.',
  inspect_ai_proposals: 'Read the current AI proposal review inbox.',
  review_ai_proposals: 'Approve or reject exact inspected proposals through canonical workflows.',
  inspect_administration: 'Read staff accounts, exact permissions, roles, and access grants.',
  set_access_grant: 'Create or update one exact canonical staff access grant.',
  revoke_access_grants:
    'Revoke exact inspected staff access-grant IDs through canonical deletion and action history.',
  set_role_definition: 'Create or update one complete custom staff role definition.',
  inspect_action_history:
    'Read filtered or exact native action-log entries with actors, resources, entities, semantic before/after changes, applied state, and current permission-aware recovery.',
  recover_action_history:
    'Undo or redo exact inspected action-log IDs through canonical transactional recovery after an explicit operator request.',
  inspect_storefront_configuration:
    'Read storefront contacts, AI settings, configured models, and bilingual announcement content.',
  update_storefront_settings:
    'Update only explicit storefront contact, link, assistant-enabled, or configured-model fields through field/value operations.',
  update_storefront_announcement:
    'Update the French and Arabic storefront announcement after an explicit operator request.',
  inspect_bulletin: 'Read complete Bulletin posts, replies, attachments, reactions, and authors.',
  create_bulletin_post: 'Create a canonical Bulletin post as the current operator.',
  reply_bulletin_post: 'Reply to one exact inspected Bulletin thread as the current operator.',
  set_bulletin_reaction:
    'Idempotently add or remove one native emoji reaction on an exact inspected Bulletin post or reply.',
  update_bulletin_post:
    'Edit or pin one exact inspected Bulletin post with omitted fields preserved.',
  delete_bulletin_content:
    'Delete one exact inspected Bulletin post or reply through ownership and moderation rules.',
  query_analytics: ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
  update_analytics_settings:
    'Persist an explicitly requested canonical Analytics planning return rate, DZD/EUR FX rate, or Friday-rest activation date after reading current assumptions. Omitted settings are preserved.',
  manage_analytics_costs:
    'Create, partially update, or delete exact canonical operating-cost records after reading current costs. Return persisted or not-found evidence for every operation.',
  manage_analytics_day_overrides:
    'Persist or reset exact calculator-day overrides after reading the owning Analytics view. Omitted fields stay unchanged and null clears an explicitly named value.',
  sync_analytics_source:
    'Synchronize an explicitly requested Meta or Search Console date range through the canonical Analytics integration and return the exact source result.',
  categorize_catalog: 'Start exactly one resumable full-catalog categorization job.',
  generate_product_content: 'Start one bulk product-content generation job.',
  find_products: 'Resolve product names to current exact product records and IDs.',
  inspect_products:
    'Read complete current product content, identifiers, commercial fields, taxonomy, images, inventory, and promo rules.',
  create_product:
    'Create one exact product through canonical validation, history, inventory, and catalog refresh.',
  update_products:
    'Directly update exact inspected products through canonical merged-record validation.',
  archive_products: 'Archive exact inspected products while retaining historical order references.',
  inspect_archived_products:
    'Read exact or filtered records from the complete native product archive, including identifiers and archived timestamps.',
  restore_products:
    'Restore exact inspected archived products without changing their separate activation or stock state.',
  suggest_discount: 'Create one reviewable product discount proposal.',
  find_brands: 'Resolve current brands by name before taxonomy changes.',
  find_categories: 'Resolve current category names, IDs, and parent hierarchy before changes.',
  manage_taxonomy:
    'Directly create, update, activate, reparent, or delete one exact brand or category.',
  propose_brand_create: 'Create one reviewable inactive brand proposal.',
  list_background_jobs: 'Read current server-owned background job queues and progress.',
  propose_product_edit: 'Create one reviewable product edit proposal.',
};

const fixtureByTool: Record<string, unknown> = {
  find_products: { matches: [{ id: 12, title: 'Perceuse Bosch 18 V', price: '15000.00' }] },
  inspect_products: {
    items: [
      {
        id: 12,
        title: 'Perceuse Bosch 18 V',
        slug: 'perceuse-bosch-18-v',
        sku: 'PB-1',
        price: 15_000,
        purchasePrice: 9_500,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 2,
        brandId: 2,
        categoryId: 3,
        images: ['https://cdn.example.com/perceuse.jpg'],
        promoCodes: [],
      },
    ],
    taxonomyMatches: {
      brands: { items: [{ id: 2, name: 'Bosch' }], total: 1 },
      categories: { items: [{ id: 3, name: 'Perceuses' }], total: 1 },
    },
  },
  find_brands: { matches: [] },
  find_categories: {
    items: [{ id: 3, name: 'Perceuses', nameAr: 'مثاقب', parentId: null, isActive: true }],
    total: 1,
  },
  inspect_orders: { orders: [{ id: 91, customer: { name: 'Client Exemple' }, status: 'pending' }] },
  create_order: {
    ok: true,
    item: {
      id: 95,
      fullName: 'Ahmed Benali',
      phoneNumber1: '0550123456',
      confirmed: 0,
      variant: null,
      productSubtotal: 29_800,
      deliveryFee: 600,
      totalAmount: 30_400,
      orderProducts: [{ productId: 12, title: 'Perceuse Bosch 18 V', quantity: 2 }],
    },
    duplicateCandidates: [],
  },
  delete_orders: {
    ok: true,
    requestedCount: 1,
    deletedCount: 1,
    failedCount: 0,
    deleted: [
      {
        id: 91,
        customerName: 'Client Exemple',
        status: 2,
        ecotrackTrackingNumber: 'TRK-91',
        externalShipmentMayRemain: true,
      },
    ],
    failed: [],
  },
  preview_order_export: {
    kind: 'order_export_preview',
    mode: 'confirmed',
    fileName: 'confirmed-orders-export-20260824-120000.xlsx',
    orderIds: [91, 92, 93],
    rowCount: 3,
    missingOrderIds: [],
    staleConfirmedOrderIds: [80, 81],
    missingRequiredFields: [{ orderId: 92, fields: ['address'] }],
    previewRows: [
      { reference: '91', fullName: 'Client Exemple', totalToCollect: '15600' },
      { reference: '92', fullName: 'Cliente Exemple', totalToCollect: '9800' },
      { reference: '93', fullName: 'Client Trois', totalToCollect: '7200' },
    ],
    previewRowsTruncated: false,
    completionEffect: 'exported orders transition to dispatched after the file is created',
  },
  start_order_export: {
    kind: 'order_export_started',
    mode: 'confirmed',
    resolvedOrderCount: 3,
    orderIds: [91, 92, 93],
    missingOrderIds: [],
    staleConfirmedOrderIds: [80, 81],
    completionEffect: 'exported orders transition to dispatched after the file is created',
    job: {
      id: '0e7da8cf-4df1-44dc-8538-f682caa3bc71',
      status: 'queued',
      downloadPath: null,
    },
    startDisposition: 'started',
  },
  get_order_tracking_links: {
    ok: true,
    locale: 'fr',
    items: [
      {
        orderId: 91,
        customerName: 'Client Exemple',
        action: 'issued',
        trackingUrl: 'https://bricomaitre.com/fr/thank-you?token=order-91-token',
      },
    ],
    failed: [],
    successCount: 1,
    failureCount: 0,
  },
  inspect_order_shopping_list: {
    kind: 'order_shopping_list_preview',
    scopeKey: 'status:confirmed',
    sourceMode: 'confirmed',
    loadedSharedDraft: true,
    missingOrderIds: [],
    summary: {
      orderCount: 3,
      lineCount: 4,
      totalUnits: 9,
      inventoryCoveredUnits: 7,
      shortageUnits: 2,
      unmatchedLines: 1,
    },
    draft: {
      draftItems: [
        { draftId: '2:12', productId: 12, title: 'Perceuse Bosch', quantity: 4 },
        { draftId: '2:18', productId: 18, title: 'Foret béton', quantity: 2 },
        { draftId: '2:24', productId: 24, title: 'Disque diamant', quantity: 1 },
        { draftId: 'none:legacy', productId: null, title: 'Ancien marteau', quantity: 2 },
      ],
    },
  },
  save_order_shopping_list: {
    ok: true,
    action: 'merged',
    scopeKey: 'status:confirmed',
    missingOrderIds: [],
    summary: {
      orderCount: 3,
      lineCount: 4,
      totalUnits: 9,
      inventoryCoveredUnits: 7,
      shortageUnits: 2,
      unmatchedLines: 1,
    },
  },
  apply_order_shopping_list_inventory: {
    ok: false,
    scopeKey: 'status:confirmed',
    applied: [
      { productId: 12, previousQuantity: 10, nextQuantity: 6 },
      { productId: 18, previousQuantity: 5, nextQuantity: 3 },
    ],
    skipped: [{ productId: 24, reason: 'insufficient', available: 0 }],
    selectionSkipped: [{ draftId: 'none:legacy', productId: null, reason: 'unmatched_product' }],
    applicationSummary: {
      appliedLineCount: 2,
      appliedUnits: 6,
      inventoryRejectedCount: 1,
    },
    summary: {
      orderCount: 3,
      lineCount: 4,
      totalUnits: 9,
      inventoryCoveredUnits: 7,
      shortageUnits: 2,
      unmatchedLines: 1,
    },
  },
  preview_ecotrack_posting: {
    kind: 'ecotrack_posting_preview',
    request: {
      scope: 'confirmed_today',
      mode: 'confirmed',
      orderIds: [91, 92],
      businessDate: '2026-08-23',
      dateBasis: 'order_created_africa_algiers',
    },
    providerChoiceRequired: true,
    providerChoices: [
      { id: 'delivro', label: 'Delivro' },
      { id: 'emir', label: 'Emir' },
    ],
    totalRequested: 2,
    eligibleCount: 2,
    eligible: [
      { orderId: 91, customerName: 'Client Exemple', destination: 'Alger Centre, 16' },
      { orderId: 92, customerName: 'Cliente Exemple', destination: 'Bab Ezzouar, 16' },
    ],
    skippedCount: 0,
    skipped: [],
    invalidCount: 0,
    invalid: [],
  },
  load_ecotrack_requirements: {
    kind: 'ecotrack_requirements',
    documentation: {
      repositoryGuide: 'docs/ecotrack-integration.md',
      canonicalPostingContract: 'apps/admin/lib/ecotrack.ts',
    },
    requirements: [
      {
        reason: 'invalid_commune',
        requirement: 'The commune must match the live catalog inside the selected wilaya.',
        repairFields: ['wilayaId', 'commune'],
      },
    ],
    orders: {
      items: [{ id: 92, delivery: { state: 16, city: 'Bab Ezzour' } }],
      requestedIds: [92],
      missingIds: [],
    },
    orderSuggestions: [
      {
        orderId: 92,
        communeMatches: [{ commune: 'Bab Ezzouar', wilayaId: 16, wilaya: 'Alger' }],
      },
    ],
  },
  post_orders_to_ecotrack: {
    kind: 'ecotrack_posting_started',
    provider: 'emir',
    resolvedOrderCount: 2,
    job: { id: '0e7da8cf-4df1-44dc-8538-f682caa3bc70', status: 'queued' },
  },
  inspect_ecotrack_shipments: {
    kind: 'ecotrack_shipments',
    scope: 'exact',
    requestedCount: 2,
    foundCount: 2,
    failures: [],
    items: [
      {
        orderId: 91,
        reference: '91',
        trackingNumber: 'TRK-91',
        provider: 'delivro',
        fullName: 'Client Exemple',
        currentStatus: 'en_livraison',
        status: { currentStatus: 'en_livraison' },
        canEdit: true,
        canDelete: false,
        canDispatch: true,
        canEditAndRecreate: false,
        canAddMaj: true,
        canAskReturn: true,
        majEntries: [{ remarque: 'Client appelé', station: 'Alger' }],
        trackingEvents: [{ status: 'en_livraison', scanLocation: 'Alger' }],
      },
      {
        orderId: 92,
        reference: '92',
        trackingNumber: 'TRK-92',
        provider: 'emir',
        fullName: 'Cliente Exemple',
        currentStatus: 'paye_et_archive',
        status: { currentStatus: 'paye_et_archive' },
        canEdit: false,
        canDelete: false,
        canDispatch: false,
        canEditAndRecreate: false,
        canAddMaj: false,
        canAskReturn: false,
        majEntries: [],
        trackingEvents: [{ status: 'paye_et_archive', scanLocation: 'Alger' }],
      },
    ],
  },
  manage_ecotrack_shipments: {
    kind: 'ecotrack_shipment_action',
    action: 'dispatch',
    ok: true,
    items: [
      {
        orderId: 91,
        reference: '91',
        trackingNumber: 'TRK-91',
        provider: 'delivro',
        currentStatus: 'en_ramassage',
      },
    ],
    failures: [
      {
        orderId: 92,
        reference: '92',
        trackingNumber: 'TRK-92',
        message: 'La commande 92 n’est plus dispatchable.',
      },
    ],
    successCount: 1,
    failureCount: 1,
    totalRequested: 2,
  },
  change_ecotrack_shipments: {
    kind: 'ecotrack_shipment_change',
    ok: true,
    items: [
      {
        orderId: 91,
        reference: '91',
        trackingNumber: 'TRK-91',
        provider: 'delivro',
        currentStatus: 'prete_a_expedier',
        operation: 'edit',
      },
    ],
    failures: [],
    successCount: 1,
    failureCount: 0,
    totalRequested: 1,
  },
  update_order_status: {
    ok: true,
    items: [
      {
        orderId: 91,
        previousStatus: 0,
        status: 2,
        statusLabel: 'confirmed',
        noAnswerCount: 0,
      },
    ],
    skipped: [],
  },
  update_order_details: {
    ok: true,
    updatedCount: 1,
    items: [
      {
        id: 91,
        delivery: 1,
        state: 16,
        city: 'Bab Ezzouar',
        homeAddress: '12 rue des Outils',
        subtotal: 15_000,
        deliveryFee: 600,
        totalAmount: 15_600,
      },
    ],
    failed: [],
  },
  inspect_inventory: { lowStock: [{ productId: 12, quantity: 2 }] },
  scan_inventory: {
    kind: 'order',
    order: { id: 50, fullName: 'Client Test' },
    items: [
      {
        productId: 12,
        title: 'Perceuse Bosch 18 V',
        quantity: 2,
        inventoryQuantity: 4,
        selectable: true,
      },
      {
        productId: 18,
        title: 'Foret béton 8 mm',
        quantity: 1,
        inventoryQuantity: 2,
        selectable: true,
      },
      {
        productId: null,
        title: 'Ancien produit',
        quantity: 1,
        inventoryQuantity: null,
        selectable: false,
        reason: 'Missing catalog match.',
      },
    ],
  },
  adjust_inventory: {
    ok: true,
    items: [{ productId: 12, previousQuantity: 2, nextQuantity: 8 }],
    skipped: [],
  },
  receive_inventory: {
    ok: true,
    complete: true,
    items: [
      { productId: 12, previousQuantity: 4, nextQuantity: 6 },
      { productId: 18, previousQuantity: 2, nextQuantity: 3 },
    ],
    skipped: [],
  },
  update_inventory_state: {
    ok: true,
    updatedCount: 1,
    items: [
      {
        productId: 12,
        fields: ['barcode'],
        item: { id: 12, title: 'Perceuse Bosch 18 V', barcode: 'DRILL-2026', inStock: true },
      },
    ],
    failed: [],
  },
  inspect_assets: {
    featuredGroups: [
      {
        id: 7,
        name: 'Sélection atelier',
        active: false,
        showAtTopOfProductsPage: false,
        productIds: [12, 18],
      },
    ],
    missing: [{ productId: 12, title: 'Perceuse Bosch 18 V' }],
  },
  inspect_landing_pages: {
    items: [
      {
        id: 41,
        productId: 12,
        productTitle: 'Perceuse Bosch 18 V',
        locale: 'fr',
        slug: 'perceuse-bosch-18-v-41',
        status: 'draft',
        draftRevision: 3,
        document: {
          schemaVersion: 2,
          theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
          seo: { title: 'Perceuse Bosch 18 V', description: 'Perceuse pour vos travaux.' },
          blocks: [
            { id: 'hero', type: 'product-hero', heading: 'Perceuse Bosch 18 V' },
            { id: 'benefits', type: 'benefit-grid', heading: 'Les avantages' },
            { id: 'final', type: 'final-cta', heading: 'Commander' },
          ],
        },
      },
    ],
  },
  create_landing_page: {
    id: 51,
    productId: 12,
    locale: 'fr',
    slug: 'perceuse-bosch-18-v-51',
    active: false,
    currentRevision: 1,
    generation: {
      model: 'openai/gpt-5.6-luna',
      reasoning: 'Mobile-first campaign for professional tradespeople.',
      groundingNotes: ['Product 12', 'French storefront catalog content'],
      stages: {
        status: 'completed',
        plannedSections: 3,
        generatedSections: 3,
        preservedSections: 0,
        fallbackSections: 0,
        skippedSections: 0,
        retryCount: 0,
        failures: [],
      },
    },
  },
  edit_landing_page: {
    id: 41,
    slug: 'perceuse-bosch-18-v-41',
    productId: 12,
    locale: 'fr',
    active: false,
    currentRevision: 4,
    changed: true,
    generation: {
      model: 'openai/gpt-5.6-luna',
      reasoning: 'Rewrote only the requested hero for mobile tradespeople.',
      groundingNotes: ['Existing revision 3', 'All non-hero blocks preserved'],
      stages: {
        status: 'completed',
        plannedSections: 1,
        generatedSections: 1,
        preservedSections: 2,
        fallbackSections: 0,
        skippedSections: 0,
        retryCount: 0,
        failures: [],
      },
    },
  },
  update_asset_state: {
    ok: true,
    updatedCount: 1,
    items: [
      {
        kind: 'featured-group',
        id: 7,
        active: true,
        showAtTopOfProductsPage: true,
      },
    ],
  },
  manage_assets: {
    ok: true,
    operation: 'create',
    kind: 'featured-group',
    id: 8,
    sortOrder: 2,
    data: {
      name: 'Sélection atelier',
      nameAr: 'اختيار الورشة',
      productIds: [12, 18],
      brandIds: [],
      categoryIds: [],
      showAtTopOfProductsPage: false,
      active: false,
    },
  },
  inspect_ai_proposals: { proposals: [{ id: 44, status: 'proposed' }] },
  review_ai_proposals: {
    action: 'approve',
    requestedCount: 1,
    reviewedCount: 1,
    appliedCount: 1,
    rejectedCount: 0,
    reviewed: [{ proposalId: 44, resource: 'products', result: { status: 'applied' } }],
    failed: [],
  },
  inspect_administration: {
    accessGrants: [{ id: 9, email: 'operator@example.com', role: 'employee' }],
  },
  inspect_action_history: {
    kind: 'action_history',
    scope: 'exact',
    requestedCount: 1,
    items: [
      {
        id: 44,
        resource: 'products',
        entityType: 'products',
        entityId: 12,
        entityLabel: 'Perceuse Bosch 18 V',
        operation: 'update',
        createdBy: 'editor@bricomaitre.com',
        createdByName: 'Editor',
        isReversible: true,
        isUndone: false,
        changes: [{ key: 'price', field: 'Prix', before: '15000', after: '14900' }],
        createdAt: '2026-08-24T08:00:00.000Z',
        undoneAt: null,
        redoneAt: null,
        recovery: { nextAction: 'undo', blockedReason: null },
      },
    ],
    failures: [],
  },
  recover_action_history: {
    kind: 'action_history_recovery',
    ok: true,
    items: [
      {
        id: 44,
        entityLabel: 'Perceuse Bosch 18 V',
        direction: 'undo',
        isUndone: true,
        recovery: { nextAction: 'redo', blockedReason: null },
      },
    ],
    failures: [],
    successCount: 1,
    failureCount: 0,
    totalRequested: 1,
  },
  set_access_grant: {
    ok: true,
    action: 'updated',
    id: 9,
    email: 'operator@example.com',
    role: 'employee',
    roleDefinitionId: null,
  },
  revoke_access_grants: {
    ok: true,
    requestedCount: 1,
    revokedCount: 1,
    failedCount: 0,
    revoked: [
      {
        id: 9,
        email: 'operator@example.com',
        role: 'employee',
        roleDefinitionId: null,
      },
    ],
    failed: [],
  },
  set_role_definition: {
    ok: true,
    action: 'created',
    id: 14,
    name: 'Support',
    slug: 'support',
    description: null,
    permissions: ['orders_write', 'ops_view'],
  },
  inspect_storefront_configuration: {
    settings: {
      contactPhone: '0795342826',
      phoneEnabled: true,
      contactEmail: 'bricomaitre@gmail.com',
      address: 'BT N20, Bab Ezzouar, Alger',
      mapUrl: 'https://maps.example.com/bricomaitre',
      facebookUrl: 'https://facebook.com/bricomaitre',
      aiAssistantEnabled: true,
      aiModel: 'openai/gpt-5.6-luna',
      aiFallbackModel: null,
    },
    announcement: { messageFr: '', messageAr: '', active: false },
    configuredAiModels: ['openai/gpt-5.6-luna', 'deepseek/deepseek-v4-flash'],
  },
  update_storefront_settings: {
    ok: true,
    settings: {
      contactPhone: '0795342826',
      phoneEnabled: true,
      contactEmail: 'bricomaitre@gmail.com',
      address: '12 rue des Outils, Alger',
      mapUrl: 'https://maps.example.com/bricomaitre',
      facebookUrl: null,
      aiAssistantEnabled: false,
      aiModel: 'openai/gpt-5.6-luna',
      aiFallbackModel: null,
    },
  },
  inspect_bulletin: {
    posts: [
      {
        id: 7,
        title: 'Suivi',
        pinned: false,
        permissions: { canEdit: true, canDelete: true, canPin: true },
        replies: [{ id: 9, body: 'Ancienne réponse', permissions: { canDelete: true } }],
      },
    ],
  },
  create_bulletin_post: {
    ok: true,
    id: 10,
    title: 'Suivi',
    tags: ['suivi'],
    pinned: false,
  },
  reply_bulletin_post: { ok: true, id: 11, postId: 7 },
  set_bulletin_reaction: {
    ok: true,
    kind: 'post',
    requestedAction: 'add',
    id: 7,
    emoji: '👍',
    reacted: true,
    changed: true,
  },
  update_bulletin_post: { ok: true, id: 7, pinned: true },
  delete_bulletin_content: { ok: true, kind: 'reply', id: 9 },
  create_product: {
    ok: true,
    id: 21,
    slug: 'perceuse-compacte-12-v',
    inventoryQuantity: 5,
    active: true,
    inStock: true,
    availabilityStatus: 'in_stock',
    catalogFeedRefresh: 'queued',
  },
  update_products: {
    ok: true,
    updatedCount: 1,
    items: [{ productId: 12, price: 14_900, purchasePrice: 9_000 }],
    failed: [],
    catalogFeedRefresh: 'queued',
  },
  archive_products: {
    ok: true,
    archivedCount: 1,
    items: [{ productId: 12, archived: true, active: false, inStock: false }],
    missing: [],
  },
  inspect_archived_products: {
    kind: 'archived_products',
    scope: 'exact',
    requestedCount: 1,
    items: [
      {
        id: 12,
        title: 'Perceuse Bosch 18 V',
        sku: 'PB-1',
        barcode: null,
        archivedAt: '2026-08-20T10:00:00.000Z',
      },
    ],
    missingProductIds: [],
  },
  restore_products: {
    ok: true,
    requestedCount: 1,
    restoredCount: 1,
    failedCount: 0,
    catalogFeedRefresh: 'queued',
    restored: [
      {
        id: 12,
        title: 'Perceuse Bosch 18 V',
        active: false,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        archived: false,
      },
    ],
    failed: [],
  },
  manage_taxonomy: {
    ok: true,
    operation: 'create',
    result: {
      kind: 'brand',
      id: 6,
      name: 'Atelier Pro',
      slug: 'atelier-pro',
      status: 'active',
    },
  },
  manage_taxonomy_reparent: {
    ok: true,
    operation: 'update',
    result: { kind: 'category', id: 7, changes: { parentId: 3 } },
  },
  update_storefront_announcement: {
    ok: true,
    announcement: {
      messageFr: 'Livraison offerte ce week-end',
      messageAr: 'توصيل مجاني نهاية هذا الأسبوع',
      active: true,
    },
  },
  update_analytics_settings: {
    kind: 'analytics_settings',
    previous: { fxRate: 280, planningReturnRate: 18, fridayRestFrom: null },
    current: { fxRate: 280, planningReturnRate: 24, fridayRestFrom: null },
    changedFields: ['planningReturnRate'],
  },
  manage_analytics_costs: {
    kind: 'analytics_costs',
    requestedCount: 1,
    changedCount: 1,
    results: [
      {
        index: 0,
        action: 'create',
        status: 'created',
        current: {
          id: 8,
          name: 'Entrepôt',
          amountDzd: 30_000,
          period: 'monthly',
          startDate: '2026-09-01',
          endDate: null,
        },
      },
    ],
  },
  manage_analytics_day_overrides: {
    kind: 'analytics_day_overrides',
    requestedCount: 1,
    changedCount: 1,
    results: [
      {
        index: 0,
        action: 'upsert',
        date: '2026-08-21',
        status: 'saved',
        current: {
          date: '2026-08-21',
          returnRatePct: 21,
          note: 'Fermeture fournisseur',
        },
      },
    ],
  },
  list_background_jobs: {
    jobs: [{ id: 5, type: 'product_export', status: 'running', progress: 60 }],
  },
};

const genericInputSchema = z.object({}).catchall(z.unknown());

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function analyticsFixtureForScenario(
  scenario: AiEvalScenario<AdminAiEvalInput>,
  inputValue: unknown,
) {
  const input = recordValue(inputValue);
  const view = typeof input.view === 'string' ? input.view : 'command';
  const range = typeof input.range === 'string' ? input.range : '30d';
  const presetStarts: Record<string, string> = {
    '7d': '2026-08-17',
    '14d': '2026-08-10',
    '30d': '2026-07-25',
    '90d': '2026-05-26',
    year: '2026-01-01',
    all: '2025-01-01',
  };
  const startDate =
    range === 'custom' && typeof input.startDate === 'string'
      ? input.startDate
      : (presetStarts[range] ?? '2026-07-25');
  const endDate =
    range === 'custom' && typeof input.endDate === 'string' ? input.endDate : '2026-08-23';
  const requestedRange = { startDate, endDate };
  const through = (cutoff: string) => (endDate < cutoff ? endDate : cutoff);
  const economicsRange = { startDate, endDate: through('2026-08-17') };
  const acquisitionRange = { startDate, endDate: through('2026-08-16') };
  const fulfillmentRange = { startDate, endDate: through('2026-08-16') };

  const metric = (
    name: string,
    value: number | null,
    definition: string,
    options: {
      unit?: string;
      sources?: string[];
      effectiveRange?: { startDate: string; endDate: string };
      dateBasis?: string;
      coveragePct?: number | null;
      maturity?: string;
      estimated?: boolean;
      assumptions?: string[];
      warning?: string | null;
      previous?: number | null;
    } = {},
  ) => ({
    key: name,
    name,
    value,
    unit: options.unit ?? 'count',
    definition,
    sources: options.sources ?? ['orders'],
    requestedRange,
    effectiveRange: options.effectiveRange ?? economicsRange,
    dateBasis: options.dateBasis ?? 'Africa/Algiers business date.',
    asOf: (options.effectiveRange ?? economicsRange).endDate,
    coveragePct: options.coveragePct ?? null,
    maturity: options.maturity ?? 'Observed over the declared effective range.',
    estimated: options.estimated ?? false,
    assumptions: options.assumptions ?? [],
    attributionCoveragePct: null,
    comparisonStatus: options.previous == null ? 'not_applicable' : 'comparable',
    warning: options.warning ?? null,
    previous: options.previous ?? null,
  });

  let metrics: Record<string, unknown>[] = [];
  let data: Record<string, unknown> = {};
  let warnings: string[] = [];

  switch (scenario.id) {
    case 'admin-analytics-submitted-is-not-sale':
    case 'admin-analytics-submitted-is-not-sale-ar':
      metrics = [
        metric(
          'submittedOrders',
          128,
          'Incoming storefront orders; submitted demand, not completed sales.',
          {
            dateBasis: 'Order-created date.',
            effectiveRange: { startDate, endDate: '2026-08-19' },
          },
        ),
        metric('deliveredOrders', 79, 'EcoTrack recorded deliveries; delivery is not payment.', {
          sources: ['orders', 'ecotrack'],
          dateBasis: 'EcoTrack delivery event date.',
          effectiveRange: fulfillmentRange,
        }),
        metric(
          'paidOrders',
          61,
          'EcoTrack payed and paye_et_archive outcomes; recognized paid flow.',
          {
            sources: ['orders', 'ecotrack'],
            dateBasis: 'EcoTrack paid/archive recognition date.',
            effectiveRange: fulfillmentRange,
          },
        ),
      ];
      data = { lifecycleSummary: { submittedOrders: 128, deliveredOrders: 79, paidOrders: 61 } };
      break;
    case 'admin-analytics-paid-funnel-semantics':
      metrics = [
        metric('impressions', 180_000, 'Impressions reported by Meta.', {
          sources: ['meta'],
          dateBasis: 'Meta reporting date.',
          effectiveRange: acquisitionRange,
        }),
        metric('bricOrders', 90, 'Exactly attributed submitted Bricomaitre orders.', {
          sources: ['orders'],
          dateBasis: 'Captured order-attribution date.',
          effectiveRange: acquisitionRange,
        }),
        metric('paidOrders', 54, 'Attributed orders later recognized as paid by EcoTrack.', {
          sources: ['orders', 'ecotrack'],
          dateBasis: 'Captured attribution cohort with later paid outcome observed.',
          effectiveRange: acquisitionRange,
          maturity: 'Recent attributed cohorts can still be awaiting terminal outcomes.',
        }),
      ];
      data = {
        funnelSemantics:
          'Meta exposure, submitted Bricomaitre demand, and later EcoTrack paid outcomes are not interchangeable.',
      };
      break;
    case 'admin-analytics-paid-contribution-vs-true-profit':
      metrics = [
        metric(
          'automaticPaidProfit',
          310_000,
          'EcoTrack COD minus estimated tariff and product cost. This is paid contribution, not whole-business profit.',
          {
            unit: 'dzd',
            sources: ['orders', 'ecotrack'],
            effectiveRange: fulfillmentRange,
            dateBasis: 'EcoTrack paid/archive recognition date.',
            coveragePct: 92,
            estimated: true,
            assumptions: ['30% fallback margin where immutable purchase costs are missing'],
          },
        ),
        metric(
          'trueProfit',
          145_000,
          'Adjusted profit minus comparable Meta ad cost and operating costs; planning-based whole-business true profit.',
          {
            unit: 'dzd',
            sources: ['orders', 'meta', 'assumptions'],
            effectiveRange: economicsRange,
            dateBasis: 'Calculator accounting date led by first-posted orders.',
            coveragePct: 92,
            estimated: true,
          },
        ),
      ];
      data = { paidContributionDzd: 310_000, trueProfitDzd: 145_000 };
      break;
    case 'admin-analytics-profit-investigation':
      if (view === 'money') {
        metrics = [
          metric('trueProfit', 145_000, 'Planning-based whole-business true profit.', {
            unit: 'dzd',
            sources: ['orders', 'meta', 'assumptions'],
            effectiveRange: economicsRange,
            dateBasis: 'Calculator accounting date led by first-posted orders.',
            previous: 190_000,
          }),
        ];
        data = { trueProfitDzd: 145_000, previousTrueProfitDzd: 190_000 };
      } else if (view === 'acquisition') {
        metrics = [
          metric('adCost', 210_000, 'Comparable Meta spend converted to DZD.', {
            unit: 'dzd',
            sources: ['meta', 'assumptions'],
            effectiveRange: acquisitionRange,
            dateBasis: 'Meta reporting date.',
            previous: 170_000,
          }),
        ];
        data = { adCostDzd: 210_000, previousAdCostDzd: 170_000 };
      } else {
        metrics = [
          metric('paidOrders', 61, 'EcoTrack payed and paye_et_archive outcomes.', {
            sources: ['orders', 'ecotrack'],
            effectiveRange: fulfillmentRange,
            dateBasis: 'Original first-posted cohort.',
            previous: 74,
          }),
        ];
        data = { paidOrders: 61, previousPaidOrders: 74, mature: true };
      }
      break;
    case 'admin-analytics-observed-return-is-not-planning':
    case 'admin-analytics-adopt-planning-return':
      metrics = [
        metric(
          'planningReturnRate',
          18,
          'Manually configured return rate used by every projection.',
          {
            unit: 'percent',
            sources: ['assumptions'],
            dateBasis: 'Manual assumption effective date.',
          },
        ),
        metric(
          'observedMatureReturnRate',
          24,
          'Returned divided by paid plus returned for mature terminal outcomes; descriptive evidence only.',
          {
            unit: 'percent',
            sources: ['orders', 'ecotrack'],
            effectiveRange: fulfillmentRange,
            dateBasis: 'Original first-posted cohort.',
            maturity: 'Mature terminal cohort of 250 orders.',
          },
        ),
      ];
      data = {
        returns: {
          planningRatePct: 18,
          observedMatureRatePct: 24,
          matureSampleSize: 250,
          adoption: 'Observed does not change planning without an explicit user action.',
        },
      };
      break;
    case 'admin-analytics-create-operating-cost':
      metrics = [
        metric('operatingCosts', 20_000, 'Canonical operating costs effective in the period.', {
          unit: 'dzd',
          sources: ['assumptions'],
          dateBasis: 'Configured cost effective dates.',
        }),
      ];
      data = {
        operatingCosts: [
          {
            id: 7,
            name: 'Hébergement',
            amountDzd: 20_000,
            period: 'monthly',
            startDate: '2026-01-01',
            endDate: null,
          },
        ],
      };
      break;
    case 'admin-analytics-daily-override':
      metrics = [
        metric(
          'planningReturnRate',
          18,
          'Current manual planning return percentage used by projections.',
          {
            unit: 'percent',
            sources: ['assumptions'],
            dateBasis: 'Manual assumption effective date.',
          },
        ),
      ];
      data = {
        dailyAssumptions: [],
        currentDefaults: { planningReturnRate: 18 },
      };
      break;
    case 'admin-analytics-sync-meta':
      metrics = [
        metric('metaSpend', 1_280, 'Meta-reported spend over the covered source range.', {
          unit: 'eur',
          sources: ['meta'],
          effectiveRange: { startDate, endDate: '2026-08-17' },
          dateBasis: 'Meta reporting date.',
          warning: 'Meta currently covers the requested period only through 2026-08-17.',
        }),
      ];
      data = {
        coverage: { metaThrough: '2026-08-17', requestedThrough: '2026-08-23' },
      };
      break;
    case 'admin-analytics-sync-search':
      metrics = [
        metric('searchClicks', 420, 'Finalized organic Google Search clicks.', {
          sources: ['searchConsole'],
          effectiveRange: { startDate, endDate: '2026-08-20' },
          dateBasis: 'Search Console finalized reporting date.',
        }),
      ];
      data = {
        coverage: { searchConsoleThrough: '2026-08-20', requestedThrough: '2026-08-20' },
      };
      break;
    case 'admin-analytics-common-source-cutoff':
      metrics = [
        metric('costPerPaid', 4_200, 'Comparable Meta cost divided by paid outcomes.', {
          unit: 'dzd',
          sources: ['orders', 'meta', 'ecotrack'],
          effectiveRange: acquisitionRange,
          dateBasis: 'Shared source effective range.',
          warning:
            'Common cross-source coverage ends 2026-08-16. The 2026-08-17 through 2026-08-23 tail is unavailable, not zero.',
        }),
      ];
      data = {
        coverage: {
          requestedThrough: '2026-08-23',
          ordersThrough: '2026-08-19',
          metaThrough: '2026-08-17',
          ecotrackThrough: '2026-08-16',
          commonThrough: '2026-08-16',
          missingTailSemantics: 'unavailable_not_zero',
        },
      };
      warnings = ['Cross-source paid-acquisition claims are comparable only through 2026-08-16.'];
      break;
    case 'admin-analytics-meta-attribution-window':
      metrics = [
        metric('attributedPostedOrders', 26, 'Exactly attributed Bricomaitre posted orders.', {
          sources: ['orders', 'meta'],
          effectiveRange: acquisitionRange,
          dateBasis: 'Captured order-attribution date.',
        }),
      ];
      data = {
        attribution: {
          reconstructedRetainedCoverageBegins: '2026-08-10',
          immutableOrderTimeCaptureBegins: '2026-08-17',
          rule: 'A campaign absent from the ranked table is not proof it did not run.',
        },
      };
      break;
    case 'admin-analytics-conversation-follow-up':
      metrics = [
        metric('adCost', 84_000, 'Meta spend converted to DZD for Campaign Alpha.', {
          unit: 'dzd',
          sources: ['meta', 'assumptions'],
          effectiveRange: acquisitionRange,
          dateBasis: 'Meta reporting date.',
        }),
      ];
      data = {
        interpretation:
          'Campaign Alpha has lower outbound CTR and higher CPM, which are diagnostic correlations rather than proof of causality.',
      };
      break;
    case 'admin-analytics-modeled-decline':
      metrics = [
        metric('trueProfit', 145_000, 'Observed true profit over the completed effective range.', {
          unit: 'dzd',
          sources: ['orders', 'meta', 'assumptions'],
          effectiveRange: economicsRange,
        }),
      ];
      data = {
        forecastMeaning:
          'Dotted rows are modeled completion/future values; a sharp dotted decline is not an observed business collapse.',
      };
      break;
    case 'admin-analytics-search-position-direction':
      metrics = [
        metric(
          'averagePosition',
          5.2,
          'Impression-weighted Search Console average position. Lower is better.',
          {
            unit: 'position',
            sources: ['searchConsole'],
            effectiveRange: { startDate, endDate: '2026-08-20' },
            dateBasis: 'Search Console finalized reporting date.',
            previous: 8.4,
          },
        ),
      ];
      data = { averagePosition: { current: 5.2, previous: 8.4, lowerIsBetter: true } };
      break;
    case 'admin-analytics-profit-x-zero-spend':
      metrics = [
        metric(
          'profitX',
          null,
          'Adjusted profit divided by Meta ad cost; unavailable when comparable ad cost is zero.',
          {
            unit: 'ratio',
            sources: ['orders', 'meta', 'assumptions'],
            effectiveRange: economicsRange,
            warning:
              'Unavailable because comparable Meta ad cost is zero; it is neither zero nor infinity.',
          },
        ),
        metric('adCost', 0, 'Comparable Meta spend converted to DZD.', {
          unit: 'dzd',
          sources: ['meta', 'assumptions'],
          effectiveRange: economicsRange,
        }),
      ];
      data = { adjustedProfitDzd: 220_000, adCostDzd: 0, profitX: null };
      break;
    case 'admin-analytics-missing-cost-estimation':
      metrics = [
        metric('trueProfit', 145_000, 'Planning-based whole-business true profit.', {
          unit: 'dzd',
          sources: ['orders', 'meta', 'assumptions'],
          effectiveRange: economicsRange,
          coveragePct: 92,
          estimated: true,
          assumptions: ['30% fallback margin for uncovered purchase costs'],
          warning:
            'Exact purchase-cost coverage is 92%; uncovered economics use the canonical 30% estimated margin.',
        }),
      ];
      data = { exactCostCoveragePct: 92, fallbackMarginPct: 30, estimated: true };
      warnings = [
        'The result materially depends on the uncovered 8% and must be described as partly estimated.',
      ];
      break;
    case 'admin-analytics-friday-accounting':
      metrics = [
        metric('adCost', 46_000, 'Actual Meta spend converted with the snapshotted FX rate.', {
          unit: 'dzd',
          sources: ['meta', 'assumptions'],
          effectiveRange: economicsRange,
          dateBasis:
            'Actual Meta reporting date in source totals; Friday rest-day spend rolls only in calculator accounting.',
        }),
      ];
      data = {
        fridayAccounting: {
          friday: '2026-08-21',
          calculatorRollForwardDay: '2026-08-22',
          isRestDay: true,
          actualMetaTimestampChanged: false,
          actualMetaSpendRemainsOnFriday: true,
          scope: 'calculator_accounting_only',
        },
      };
      break;
    case 'admin-analytics-delivery-attempt-telemetry':
      metrics = [
        metric('deliveredOrders', 79, 'EcoTrack recorded deliveries.', {
          sources: ['orders', 'ecotrack'],
          effectiveRange: fulfillmentRange,
          dateBasis: 'EcoTrack delivery event date.',
        }),
      ];
      data = {
        attemptTelemetry: {
          deliveredOrderId: 91,
          recordedAttempts: 0,
          interpretation:
            'EcoTrack did not supply attempt telemetry; zero recorded attempts does not prove no attempt occurred.',
        },
      };
      break;
    case 'admin-analytics-storefront-funnel':
      metrics = [
        metric('sessions', 1_000, 'Distinct canonical first-party Storefront sessions.', {
          sources: ['storefront'],
          effectiveRange: { startDate, endDate: '2026-08-19' },
          dateBasis: 'First-party Storefront session date.',
        }),
        metric(
          'conversionRate',
          8,
          'Submitted local Storefront orders divided by canonical first-party sessions.',
          {
            unit: 'percent',
            sources: ['orders', 'storefront'],
            effectiveRange: { startDate, endDate: '2026-08-19' },
            dateBasis: 'Shared order-created and Storefront session date range.',
          },
        ),
      ];
      data = {
        funnelSemantics:
          'Every stage is distinct sessions. Submitted-order sessions are incoming demand, not paid sales.',
      };
      break;
    case 'admin-analytics-search-index-health':
      metrics = [
        metric('searchClicks', 420, 'Finalized organic Google Search clicks.', {
          sources: ['searchConsole'],
          effectiveRange: { startDate, endDate: '2026-08-20' },
          dateBasis: 'Search Console finalized reporting date.',
        }),
      ];
      data = {
        indexSemantics:
          'URL inspection state is separate from aggregate traffic; an issue does not establish zero clicks or visibility.',
      };
      break;
    case 'admin-analytics-creative-diagnostics':
      metrics = [
        metric('impressions', 180_000, 'Meta-reported impressions.', {
          sources: ['meta'],
          effectiveRange: acquisitionRange,
          dateBasis: 'Meta reporting date.',
        }),
      ];
      data = {
        creativeSemantics:
          'CPM and outbound CTR are diagnostic correlations. They may indicate fatigue but cannot prove causality.',
      };
      break;
    default:
      metrics = [
        metric('postedOrders', 24, 'Orders on their first transition to local status 11.', {
          effectiveRange: fulfillmentRange,
          dateBasis: 'First-posted date.',
        }),
      ];
      data = { summary: { postedOrders: 24 } };
  }

  const focusInput = recordValue(input.focus);
  const focusDimension =
    typeof focusInput.dimension === 'string' ? focusInput.dimension : undefined;
  const focusRowsByScenario: Record<string, Record<string, unknown>[]> = {
    'admin-analytics-paid-funnel-semantics': [
      { key: 'impressions', value: 180_000 },
      { key: 'bricOrders', value: 90 },
      { key: 'paid', value: 54 },
    ],
    'admin-analytics-product-focus': [
      {
        id: '12',
        title: 'Perceuse Bosch 18 V',
        postedUnits: 24,
        paidUnits: 18,
        projectedContributionDzd: 125_000,
      },
    ],
    'admin-analytics-meta-attribution-window': [
      {
        id: 'campaign-alpha',
        name: 'Campagne Alpha',
        spendEur: 420,
        exactlyAttributedOrders: 26,
        attributionSpendCoveragePct: 61,
      },
    ],
    'admin-analytics-conversation-follow-up': [
      {
        id: 'campaign-alpha',
        name: 'Campaign Alpha',
        spendEur: 420,
        impressions: 82_000,
        outboundCtrPct: 1.3,
        previousOutboundCtrPct: 2.4,
        cpmEur: 9.1,
        previousCpmEur: 6.2,
      },
    ],
    'admin-analytics-modeled-decline': [
      { day: '2026-08-23', trueProfitDzd: 34_000, modeled: false },
      { day: '2026-08-24', trueProfitDzd: 28_000, modeled: true },
      { day: '2026-08-25', trueProfitDzd: 14_000, modeled: true },
      { day: '2026-08-26', trueProfitDzd: 4_000, modeled: true },
    ],
    'admin-analytics-search-position-direction': [
      { day: '2026-08-01', averagePosition: 8.4 },
      { day: '2026-08-20', averagePosition: 5.2 },
    ],
    'admin-analytics-friday-accounting': [
      {
        weekStart: '2026-08-21',
        fridayMetaSpendDzd: 46_000,
        calculatorRollForwardDay: '2026-08-22',
        actualTimestampChanged: false,
      },
    ],
    'admin-analytics-delivery-attempt-telemetry': [
      { outcome: 'delivered', orders: 1, recordedAttempts: 0, telemetryAvailable: false },
    ],
    'admin-analytics-storefront-funnel': [
      { stage: 'sessions', value: 1_000 },
      { stage: 'product-view sessions', value: 650 },
      { stage: 'cart sessions', value: 280 },
      { stage: 'checkout sessions', value: 160 },
      { stage: 'submitted-order sessions', value: 80 },
    ],
    'admin-analytics-search-index-health': [
      {
        url: 'https://bricomaitre.com/products/drill-18v',
        path: '/products/drill-18v',
        verdict: 'Crawled - currently not indexed',
        inspectedAt: '2026-08-22T09:00:00.000Z',
      },
    ],
    'admin-analytics-creative-diagnostics': [
      { day: '2026-08-16', cpmEur: 6.2, outboundCtrPct: 2.4 },
      { day: '2026-08-23', cpmEur: 9.1, outboundCtrPct: 1.3 },
    ],
  };
  const focusRows = focusRowsByScenario[scenario.id] ?? [];
  const rowContractByScenario: Record<string, Record<string, unknown>[]> = {
    'admin-analytics-paid-funnel-semantics': [
      {
        key: 'impressions',
        definition: 'Impressions reported by Meta; not Bricomaitre orders.',
        dateBasis: 'Meta reporting date.',
        sources: ['meta'],
      },
      {
        key: 'bricOrders',
        definition: 'Exactly captured Bricomaitre submitted orders; demand, not paid sales.',
        dateBasis: 'Captured order-attribution date.',
        sources: ['orders'],
        attribution:
          'Exact retained Meta attribution begins around 2026-08-10; immutable capture begins 2026-08-17.',
      },
      {
        key: 'paid',
        definition: 'Exactly attributed orders later reaching a legitimate EcoTrack paid outcome.',
        dateBasis: 'Captured order-attribution cohort with later paid outcome observed.',
        sources: ['orders', 'ecotrack'],
        maturity: 'Recent attributed cohorts can still be awaiting terminal outcomes.',
      },
    ],
  };
  const focus = focusDimension
    ? {
        ...focusInput,
        definition: `Canonical ${focusDimension} dataset for the ${view} workspace.`,
        dateBasis: metrics[0]?.dateBasis ?? 'Owning Analytics workspace date basis.',
        totalSemantics:
          'Rows are a ranked or temporal decision view; missing rows are not proof of business absence.',
        effectiveRanges: [
          view === 'acquisition'
            ? { key: 'acquisition', ...acquisitionRange }
            : view === 'fulfillment'
              ? { key: 'fulfillment', ...fulfillmentRange }
              : view === 'storefront'
                ? { key: 'storefront', startDate, endDate: '2026-08-19' }
                : view === 'search'
                  ? { key: 'search', startDate, endDate: '2026-08-20' }
                  : view === 'catalog'
                    ? { key: 'catalog', ...fulfillmentRange }
                    : view === 'assumptions'
                      ? { key: 'assumptions', ...economicsRange }
                      : { key: 'economics', ...economicsRange },
        ],
        available: scenario.id === 'admin-analytics-product-focus' ? 75 : focusRows.length,
        matched: focusRows.length,
        included: focusRows.length,
        rowContract: rowContractByScenario[scenario.id] ?? [],
        rows: focusRows,
      }
    : null;

  return {
    kind: 'analytics2',
    responseContractVersion: 4,
    semanticContract: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
    answerRequirements: analyticsAnswerRequirements(
      metrics as unknown as Parameters<typeof analyticsAnswerRequirements>[0],
      focusDimension ? { dimension: focusDimension } : null,
    ),
    query: view,
    view,
    filters: {
      view,
      range,
      startDate,
      endDate,
      grain: input.grain ?? 'auto',
    },
    effectiveRanges: [
      { key: 'economics', ...economicsRange, sources: ['orders', 'meta', 'assumptions'] },
      { key: 'acquisition', ...acquisitionRange, sources: ['orders', 'meta', 'ecotrack'] },
      { key: 'fulfillment', ...fulfillmentRange, sources: ['orders', 'ecotrack'] },
    ],
    metrics,
    focus,
    generatedAt: '2026-08-23T12:00:00.000Z',
    referenceDate: '2026-08-23',
    data: focus ? { kind: view, metrics, focus } : { kind: view, metrics, ...data },
    sources: [
      { key: 'orders', state: 'current', throughDate: '2026-08-19', coveragePct: 100 },
      { key: 'meta', state: 'partial', throughDate: '2026-08-17', coveragePct: 80 },
      { key: 'ecotrack', state: 'partial', throughDate: '2026-08-16', coveragePct: 76 },
      { key: 'assumptions', state: 'manual', throughDate: null, coveragePct: 92 },
      {
        key: 'searchConsole',
        state: 'partial',
        throughDate: '2026-08-20',
        coveragePct: 87,
      },
    ],
    warnings,
    truncations: [],
  };
}

function toolsForScenario(
  scenario: AiEvalScenario<AdminAiEvalInput>,
  analyticsPlan: AdminAiAnalyticsQueryPlan | null,
) {
  const schemaBackedFixtureTools = {
    inspect_orders: tool({
      description: descriptions.inspect_orders,
      inputSchema: z.object({
        orderIds: z.array(z.number().int().positive()).max(50).default([]),
        status: z.number().int().min(0).max(11).optional(),
        noAnswerCount: z.number().int().min(0).max(99).optional(),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async () => fixtureByTool.inspect_orders,
    }),
    find_products: tool({
      description: descriptions.find_products,
      inputSchema: adminAiProductLookupSchema,
      execute: async () => fixtureByTool.find_products,
    }),
    inspect_inventory: tool({
      description: descriptions.inspect_inventory,
      inputSchema: adminAiInventoryInspectionSchema,
      execute: async () => fixtureByTool.inspect_inventory,
    }),
    preview_ecotrack_posting: tool({
      description: descriptions.preview_ecotrack_posting,
      inputSchema: adminAiEcotrackPostingPreviewSchema,
      execute: async () => fixtureByTool.preview_ecotrack_posting,
    }),
    load_ecotrack_requirements: tool({
      description: descriptions.load_ecotrack_requirements,
      inputSchema: adminAiEcotrackRequirementsSchema,
      execute: async () => fixtureByTool.load_ecotrack_requirements,
    }),
    post_orders_to_ecotrack: tool({
      description: descriptions.post_orders_to_ecotrack,
      inputSchema: adminAiEcotrackPostingStartSchema,
      execute: async () => fixtureByTool.post_orders_to_ecotrack,
    }),
    inspect_ecotrack_shipments: tool({
      description: descriptions.inspect_ecotrack_shipments,
      inputSchema: adminAiEcotrackShipmentInspectionSchema,
      execute: async () => {
        const fixture = fixtureByTool.inspect_ecotrack_shipments as {
          items: unknown[];
          [key: string]: unknown;
        };
        return scenario.id === 'admin-ecotrack-shipment-dispatch'
          ? fixture
          : { ...fixture, requestedCount: 1, foundCount: 1, items: fixture.items.slice(0, 1) };
      },
    }),
    manage_ecotrack_shipments: tool({
      description: descriptions.manage_ecotrack_shipments,
      inputSchema: adminAiEcotrackShipmentActionSchema,
      execute: async () => fixtureByTool.manage_ecotrack_shipments,
    }),
    change_ecotrack_shipments: tool({
      description: descriptions.change_ecotrack_shipments,
      inputSchema: adminAiEcotrackShipmentChangeSchema,
      execute: async () => fixtureByTool.change_ecotrack_shipments,
    }),
    update_order_status: tool({
      description: descriptions.update_order_status,
      inputSchema: adminAiOrderStatusMutationSchema,
      execute: async () => fixtureByTool.update_order_status,
    }),
    create_order: tool({
      description: descriptions.create_order,
      inputSchema: adminAiOrderCreateSchema,
      execute: async () => fixtureByTool.create_order,
    }),
    delete_orders: tool({
      description: descriptions.delete_orders,
      inputSchema: adminAiOrderDeleteSchema,
      execute: async () => fixtureByTool.delete_orders,
    }),
    preview_order_export: tool({
      description: descriptions.preview_order_export,
      inputSchema: adminAiOrderExportScopeSchemaForMessage(scenario.input.message),
      execute: async () => fixtureByTool.preview_order_export,
    }),
    start_order_export: tool({
      description: descriptions.start_order_export,
      inputSchema: adminAiOrderExportScopeSchemaForMessage(scenario.input.message),
      execute: async () => fixtureByTool.start_order_export,
    }),
    get_order_tracking_links: tool({
      description: descriptions.get_order_tracking_links,
      inputSchema: adminAiOrderTrackingLinksSchema,
      execute: async () => fixtureByTool.get_order_tracking_links,
    }),
    inspect_order_shopping_list: tool({
      description: descriptions.inspect_order_shopping_list,
      inputSchema: adminAiShoppingListScopeSchema,
      execute: async () => fixtureByTool.inspect_order_shopping_list,
    }),
    save_order_shopping_list: tool({
      description: descriptions.save_order_shopping_list,
      inputSchema: adminAiShoppingListScopeSchema,
      execute: async () => fixtureByTool.save_order_shopping_list,
    }),
    apply_order_shopping_list_inventory: tool({
      description: descriptions.apply_order_shopping_list_inventory,
      inputSchema: adminAiShoppingListApplySchema,
      execute: async () => fixtureByTool.apply_order_shopping_list_inventory,
    }),
    update_order_details: tool({
      description: descriptions.update_order_details,
      inputSchema: adminAiOrderDetailsToolSchema,
      execute: async () =>
        scenario.id === 'admin-ecotrack-repair-invalid-commune'
          ? {
              ok: true,
              updatedCount: 1,
              items: [
                {
                  id: 92,
                  delivery: 1,
                  state: 16,
                  city: 'Bab Ezzouar',
                  subtotal: 15_000,
                  deliveryFee: 600,
                  totalAmount: 15_600,
                },
              ],
              failed: [],
            }
          : fixtureByTool.update_order_details,
    }),
    adjust_inventory: tool({
      description: descriptions.adjust_inventory,
      inputSchema: adminAiInventoryAdjustmentSchema,
      execute: async () => fixtureByTool.adjust_inventory,
    }),
    scan_inventory: tool({
      description: descriptions.scan_inventory,
      inputSchema: adminAiInventoryScanSchema,
      execute: async () => fixtureByTool.scan_inventory,
    }),
    receive_inventory: tool({
      description: descriptions.receive_inventory,
      inputSchema: adminAiInventoryReceiptSchema,
      execute: async () => fixtureByTool.receive_inventory,
    }),
    update_inventory_state: tool({
      description: descriptions.update_inventory_state,
      inputSchema: adminAiInventoryStateSchema,
      execute: async () => fixtureByTool.update_inventory_state,
    }),
    create_landing_page: tool({
      description: descriptions.create_landing_page,
      inputSchema: adminAiLandingPageCreateSchema,
      execute: async () => fixtureByTool.create_landing_page,
    }),
    edit_landing_page: tool({
      description: descriptions.edit_landing_page,
      inputSchema: adminAiLandingPageEditSchema,
      execute: async () => fixtureByTool.edit_landing_page,
    }),
    update_asset_state: tool({
      description: descriptions.update_asset_state,
      inputSchema: adminAssetStateMutationSchema,
      execute: async () => fixtureByTool.update_asset_state,
    }),
    manage_assets: tool({
      description: descriptions.manage_assets,
      inputSchema: adminAiAssetCrudSchema,
      execute: async () => fixtureByTool.manage_assets,
    }),
    review_ai_proposals: tool({
      description: descriptions.review_ai_proposals,
      inputSchema: adminAiProposalReviewSchema,
      execute: async () => fixtureByTool.review_ai_proposals,
    }),
    set_access_grant: tool({
      description: descriptions.set_access_grant,
      inputSchema: adminAiAccessGrantSchema,
      execute: async () => fixtureByTool.set_access_grant,
    }),
    revoke_access_grants: tool({
      description: descriptions.revoke_access_grants,
      inputSchema: adminAiAccessRevocationSchema,
      execute: async () => fixtureByTool.revoke_access_grants,
    }),
    set_role_definition: tool({
      description: descriptions.set_role_definition,
      inputSchema: adminAiRoleDefinitionSchema,
      execute: async () => fixtureByTool.set_role_definition,
    }),
    inspect_action_history: tool({
      description: descriptions.inspect_action_history,
      inputSchema: adminAiActionHistoryInspectionSchema,
      execute: async () => fixtureByTool.inspect_action_history,
    }),
    recover_action_history: tool({
      description: descriptions.recover_action_history,
      inputSchema: adminAiActionHistoryRecoverySchema,
      execute: async () => fixtureByTool.recover_action_history,
    }),
    update_storefront_announcement: tool({
      description: descriptions.update_storefront_announcement,
      inputSchema: storefrontAnnouncementMutationSchema,
      execute: async () => fixtureByTool.update_storefront_announcement,
    }),
    update_storefront_settings: tool({
      description: descriptions.update_storefront_settings,
      inputSchema: storefrontSettingsToolSchema,
      execute: async () => fixtureByTool.update_storefront_settings,
    }),
    create_bulletin_post: tool({
      description: descriptions.create_bulletin_post,
      inputSchema: adminAiBulletinPostSchema,
      execute: async () => fixtureByTool.create_bulletin_post,
    }),
    reply_bulletin_post: tool({
      description: descriptions.reply_bulletin_post,
      inputSchema: adminAiBulletinReplySchema,
      execute: async () => fixtureByTool.reply_bulletin_post,
    }),
    set_bulletin_reaction: tool({
      description: descriptions.set_bulletin_reaction,
      inputSchema: adminAiBulletinReactionSchema,
      execute: async () => fixtureByTool.set_bulletin_reaction,
    }),
    update_bulletin_post: tool({
      description: descriptions.update_bulletin_post,
      inputSchema: adminAiBulletinPostUpdateSchema,
      execute: async () => fixtureByTool.update_bulletin_post,
    }),
    delete_bulletin_content: tool({
      description: descriptions.delete_bulletin_content,
      inputSchema: adminAiBulletinDeleteSchema,
      execute: async () => fixtureByTool.delete_bulletin_content,
    }),
    create_product: tool({
      description: descriptions.create_product,
      inputSchema: adminAiProductCreateSchema,
      execute: async () => fixtureByTool.create_product,
    }),
    update_products: tool({
      description: descriptions.update_products,
      inputSchema: adminAiProductUpdateSchema,
      execute: async () => fixtureByTool.update_products,
    }),
    archive_products: tool({
      description: descriptions.archive_products,
      inputSchema: adminAiProductArchiveSchema,
      execute: async () => fixtureByTool.archive_products,
    }),
    inspect_archived_products: tool({
      description: descriptions.inspect_archived_products,
      inputSchema: adminAiArchivedProductInspectionSchema,
      execute: async () => fixtureByTool.inspect_archived_products,
    }),
    restore_products: tool({
      description: descriptions.restore_products,
      inputSchema: adminAiProductRestoreSchema,
      execute: async () => fixtureByTool.restore_products,
    }),
    manage_taxonomy: tool({
      description: descriptions.manage_taxonomy,
      inputSchema: adminAiTaxonomyMutationSchema,
      execute: async () =>
        scenario.id === 'admin-taxonomy-reparent'
          ? fixtureByTool.manage_taxonomy_reparent
          : fixtureByTool.manage_taxonomy,
    }),
    update_analytics_settings: tool({
      description: descriptions.update_analytics_settings,
      inputSchema: adminAiAnalyticsSettingsPatchSchemaForMessage(scenario.input.message),
      execute: async () => fixtureByTool.update_analytics_settings,
    }),
    manage_analytics_costs: tool({
      description: descriptions.manage_analytics_costs,
      inputSchema: adminAiAnalyticsCostsMutationSchemaForMessage(scenario.input.message),
      execute: async () => fixtureByTool.manage_analytics_costs,
    }),
    manage_analytics_day_overrides: tool({
      description: descriptions.manage_analytics_day_overrides,
      inputSchema: adminAiAnalyticsDayOverridesMutationSchemaForMessage(scenario.input.message),
      execute: async () => fixtureByTool.manage_analytics_day_overrides,
    }),
    sync_analytics_source: tool({
      description: descriptions.sync_analytics_source,
      inputSchema: adminAiAnalyticsSyncSchemaForContext(
        scenario.input.message,
        scenario.input.surface.split('/', 2)[1],
      ),
      execute: async (input) => ({
        kind: 'analytics_sync',
        ...input,
        result: {
          rows: input.source === 'meta' ? 23 : 19,
          status: 'completed',
        },
      }),
    }),
  };
  return Object.fromEntries(
    Object.entries(descriptions).map(([name, description]) => {
      if (name === 'query_analytics')
        return [
          name,
          tool({
            description,
            inputSchema: adminAiAnalyticsQuerySchemaForPlan(analyticsPlan),
            execute: async (input) => {
              const queries = analyticsPlan
                ? adminAiAnalyticsQueriesForPlan(input, analyticsPlan)
                : [input];
              return queryAdminAnalyticsInvestigation(
                queries,
                analyticsPlan?.reason ?? 'Canonical Analytics query.',
                async (query) =>
                  analyticsFixtureForScenario(scenario, adminAiAnalyticsQuerySchema.parse(query)),
              );
            },
          }),
        ];
      if (name in schemaBackedFixtureTools)
        return [name, schemaBackedFixtureTools[name as keyof typeof schemaBackedFixtureTools]];
      return [
        name,
        tool({
          description,
          inputSchema: genericInputSchema,
          execute: async () => fixtureByTool[name] ?? { status: 'proposed', id: 100 },
        }),
      ];
    }),
  );
}

async function executeScenarioUnsafe(
  scenario: AiEvalScenario<AdminAiEvalInput>,
): Promise<AiEvalTranscript> {
  const config = getAiConfig();
  const selectedModel = resolveAdminAiModel(ADMIN_AI_DEFAULT_MODEL, 'medium');
  const [surface, section] = scenario.input.surface.split('/', 2);
  const previousAnalytics = scenario.input.previousAnalytics;
  const groundingTool =
    previousAnalytics && isAdminAiAnalyticsContinuationMessage(scenario.input.message)
      ? ('query_analytics' as const)
      : adminAiGroundingTool({
          message: scenario.input.message,
          surface,
          section,
          permissions: permissionCatalog,
        });
  const mutationTool = adminAiMutationTool({
    message: scenario.input.message,
    surface,
    section,
    permissions: permissionCatalog,
  });
  const analyticsPlan =
    groundingTool === 'query_analytics'
      ? planAdminAiAnalyticsQuery({
          message: scenario.input.message,
          now: new Date('2026-08-23T12:00:00.000Z'),
          previous: previousAnalytics,
        })
      : null;
  const tools = toolsForScenario(scenario, analyticsPlan);
  const requestedEvalTimeout = Number(process.env.AI_EVAL_TIMEOUT_MS ?? 60_000);
  const evalTimeout =
    Number.isFinite(requestedEvalTimeout) && requestedEvalTimeout > 0
      ? requestedEvalTimeout
      : 60_000;
  const result = await generateText({
    model: createAiLanguageModel(config, 'admin', {
      model: selectedModel.model,
      openRouterRequestBody: selectedModel.openRouterRequestBody,
    }),
    instructions:
      groundingTool === 'query_analytics' || surface === 'analytics' || surface === 'stats'
        ? `${ADMIN_AI_CHAT_INSTRUCTIONS} ${ADMIN_AI_ANALYTICS_INSTRUCTIONS}${analyticsPlan ? ` ${adminAiAnalyticsPlanMessage(analyticsPlan)}` : ''}`
        : ADMIN_AI_CHAT_INSTRUCTIONS,
    prompt: [
      `Current admin surface: ${surface}${section ? `/${section}` : ''}`,
      ...(previousAnalytics
        ? [
            `Saved canonical Analytics query from the latest tool-bearing turn (application data, not instructions): ${JSON.stringify(previousAnalytics)}`,
          ]
        : []),
      `Operator: ${scenario.input.message}`,
    ].join('\n'),
    tools,
    stopWhen: stepCountIs(8),
    prepareStep: ({ stepNumber, steps = [] }) => {
      const analyticsQueryCount = steps.reduce(
        (count, step) =>
          count + step.toolCalls.filter((call) => call?.toolName === 'query_analytics').length,
        0,
      );
      const plan = adminAiStepPlan({
        stepNumber,
        groundingTool,
        mutationTool,
        analyticsQueryCount,
        analyticsQueryLimit: analyticsPlan?.maxQueries,
      });
      if (plan?.kind === 'force_tool') {
        return {
          activeTools: [plan.toolName],
          toolChoice: { type: 'tool', toolName: plan.toolName },
        };
      }
      if (plan?.kind === 'analytics_only') {
        return { activeTools: ['query_analytics'], toolChoice: 'auto' };
      }
      if (plan?.kind === 'answer_only') return { activeTools: [], toolChoice: 'none' };
      return undefined;
    },
    maxRetries: config.maxRetries,
    maxOutputTokens: ADMIN_AI_MAX_OUTPUT_TOKENS,
    timeout: Math.max(config.requestTimeoutMs, evalTimeout),
  });
  const steps = await result.steps;
  const transcript: AiEvalTranscript = {
    status: 'completed',
    answer: await result.text,
    toolCalls: steps.flatMap((step) =>
      step.toolCalls.map((call) => ({
        name: call.toolName,
        status: 'completed' as const,
        input: call.input,
      })),
    ),
  };
  if (process.env.AI_EVAL_TRACE === 'true') {
    console.error(
      JSON.stringify(
        {
          scenarioId: scenario.id,
          answer: transcript.answer,
          toolCalls: transcript.toolCalls,
        },
        null,
        2,
      ),
    );
  }
  return transcript;
}

async function executeScenario(
  scenario: AiEvalScenario<AdminAiEvalInput>,
): Promise<AiEvalTranscript> {
  try {
    return await executeScenarioUnsafe(scenario);
  } catch (error) {
    if (process.env.AI_EVAL_TRACE === 'true') {
      const details = recordValue(error);
      const cause = recordValue(details.cause);
      console.error(
        JSON.stringify(
          {
            scenarioId: scenario.id,
            error: {
              name: error instanceof Error ? error.name : 'UnknownError',
              message: error instanceof Error ? error.message : String(error),
              statusCode: details.statusCode ?? cause.statusCode ?? null,
              responseBody: details.responseBody ?? cause.responseBody ?? null,
              cause: cause.message ?? null,
            },
          },
          null,
          2,
        ),
      );
    }
    throw error;
  }
}

async function main() {
  const pattern = process.env.AI_EVAL_SCENARIO_PATTERN?.trim();
  const scenarios = pattern
    ? ADMIN_AI_EVAL_SCENARIOS.filter((scenario) => new RegExp(pattern, 'i').test(scenario.id))
    : [...ADMIN_AI_EVAL_SCENARIOS];
  if (scenarios.length === 0) throw new Error(`No AI eval scenarios matched ${pattern}.`);
  const report = await runAiEvalSuite({
    scenarios,
    execute: executeScenario,
    concurrency: Number(process.env.AI_EVAL_CONCURRENCY ?? 1),
  });

  const output = process.env.AI_EVAL_VERBOSE === 'true' ? report : compactAiEvalSuiteReport(report);
  console.log(JSON.stringify(output, null, 2));
  const threshold = Number(process.env.AI_EVAL_PASS_RATE ?? 0.85);
  if (report.passRate < threshold) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
