import 'dotenv/config';

// Usage: pnpm --filter @bric/admin eval:ai:wide <suite> [scenario]
// Catalog and Analytics mutations are intentionally replaced with read-only no-ops.

import { createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import { generateText, stepCountIs, tool } from 'ai';

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
} from './lib/admin-ai-catalog';
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
} from './lib/admin-ai-catalog-query';
import {
  ADMIN_AI_INSPECT_ECOTRACK_SHIPMENTS_TOOL_DESCRIPTION,
  adminAiEcotrackShipmentInspectionSchema,
  inspectAdminAiEcotrackShipments,
} from './lib/admin-ai-ecotrack-shipments';
import {
  ADMIN_AI_INSPECT_ORDERS_TOOL_DESCRIPTION,
  ADMIN_AI_QUERY_ORDERS_TOOL_DESCRIPTION,
  adminAiOrderInspectionSchema,
  adminAiOrderQuerySchema,
  inspectAdminOrderDetails,
  queryAdminOrders,
} from './lib/admin-ai-order-query';
import {
  ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
  adminAiPresentationPlanSchema,
} from './lib/admin-ai-presentation';
import {
  ADMIN_AI_STATS_TOOL_DESCRIPTION,
  adminAiStatsQuerySchema,
  queryAdminAiStats,
} from './lib/admin-ai-ai-stats';
import { adminAiContextMessage } from './lib/admin-ai-capabilities';
import {
  adminAiAnalyticsCostsMutationSchema,
  adminAiAnalyticsDayOverridesMutationSchema,
  adminAiAnalyticsSettingsPatchSchema,
  adminAiAnalyticsSyncSchema,
} from './lib/admin-ai-analytics-actions';
import {
  ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
  ADMIN_AI_GUIDANCE_TOPIC_VALUES,
  adminAiApplicationDate,
  adminAiGuidanceRequestSchemaForTopics,
  adminAiRuntimeInstructions,
  readAdminAiGuidanceForTopics,
} from './lib/admin-ai-runtime';
import {
  adminAiInventoryAdjustmentSchema,
  adminAiInventoryStateSchema,
} from './lib/admin-ai-inventory';
import { ADMIN_AI_MAX_OUTPUT_TOKENS, resolveAdminAiModel } from './lib/admin-ai-models';
import {
  adminAiProductArchiveSchema,
  adminAiProductRestoreSchema,
  adminAiProductUpdateSchema,
} from './lib/admin-ai-products';
import { adminAiTaxonomyMutationSchema } from './lib/admin-ai-taxonomy';
import { adminAiAnalyticsQuerySchema, queryAdminAnalytics } from './lib/ai-analytics';
import { productPayloadSchema } from './lib/products';

type Surface = 'orders' | 'products' | 'inventory' | 'stats' | 'unknown';
type Scenario = { id: string; surface: Surface; turns: string[] };

const suites: Record<string, Scenario[]> = {
  orders: [
    {
      id: 'orders_workflow',
      surface: 'orders',
      turns: ['What normally happens after a new order comes in? Keep it practical.'],
    },
    {
      id: 'orders_status_counts',
      surface: 'orders',
      turns: [
        'How many orders currently have each of these in-house statuses: confirmed, posted, in delivery, and completed?',
      ],
    },
    {
      id: 'orders_confirmed_today',
      surface: 'orders',
      turns: [
        'Which orders moved to the in-house confirmed status today? Give the total and at most five order IDs.',
      ],
    },
    {
      id: 'orders_exact_deleted_shipment',
      surface: 'orders',
      turns: [
        'Inspect order 16360. What is its current in-house status, what EcoTrack record is stored, and is that carrier record active or deleted?',
      ],
    },
    {
      id: 'orders_dual_status_list',
      surface: 'orders',
      turns: [
        'Show up to five orders whose in-house status is in delivery and whose EcoTrack status is en_livraison. Show only the order ID and the two statuses.',
      ],
    },
    {
      id: 'orders_rules',
      surface: 'orders',
      turns: [
        'Can an EcoTrack prete_a_expedier order become failed after seven days, does XLSX export change its in-house status, and when may I permanently delete the local order?',
      ],
    },
  ],
  catalog: [
    {
      id: 'catalog_out_of_stock_count',
      surface: 'products',
      turns: ['How many current active products are out of stock? Give only the number.'],
    },
    {
      id: 'catalog_low_inventory',
      surface: 'inventory',
      turns: [
        'Show the five active in-stock products with the lowest positive inventory. Give ID, title, and quantity only.',
      ],
    },
    {
      id: 'catalog_search_inspect',
      surface: 'products',
      turns: [
        'Find the most relevant current product for “perceuse”, then tell me its selling price, purchase cost, stock state, inventory quantity, brand, and category.',
      ],
    },
    {
      id: 'catalog_archived',
      surface: 'products',
      turns: [
        'Do we have archived products? Show up to five most recently archived products and explain what restoring one would and would not do.',
      ],
    },
    {
      id: 'catalog_brands',
      surface: 'products',
      turns: [
        'Which five brands have no active products? Show only brand name and current/archived assignment counts.',
      ],
    },
    {
      id: 'catalog_categories',
      surface: 'products',
      turns: [
        'Show the five root categories with the most direct active products. Include each category’s direct children and descendant count.',
      ],
    },
    {
      id: 'catalog_promotions',
      surface: 'products',
      turns: [
        'Which active promotions end from 28 August through 30 September 2026? Show product, code, promo price, and end date.',
      ],
    },
  ],
  catalog_debug: [
    {
      id: 'catalog_debug_products',
      surface: 'products',
      turns: ['How many current active products are out of stock? Give only the number.'],
    },
    {
      id: 'catalog_debug_brands',
      surface: 'products',
      turns: ['Which five brands have no active products?'],
    },
    {
      id: 'catalog_debug_categories',
      surface: 'products',
      turns: ['Show the five root categories with the most direct active products.'],
    },
  ],
  analytics: [
    {
      id: 'analytics_profit_definition',
      surface: 'stats',
      turns: [
        'What are gross, adjusted, net, and true profit? Which of them includes Meta ads and operating costs?',
      ],
    },
    {
      id: 'analytics_ecotrack_coverage',
      surface: 'stats',
      turns: [
        'Why is EcoTrack coverage below 92% this month? Check the actual eligible orders and challenge the premise if it is wrong.',
      ],
    },
    {
      id: 'analytics_period_comparison',
      surface: 'stats',
      turns: [
        'Compare true profit for 10–17 August 2026 against 1–8 August 2026. State coverage or estimation limits and do not invent a cause.',
      ],
    },
    {
      id: 'analytics_estimation',
      surface: 'stats',
      turns: [
        'For this month, which profit figures are measured and which are estimated? Explain the material estimation inputs briefly.',
      ],
    },
    {
      id: 'ai_stats_operations',
      surface: 'stats',
      turns: [
        'How reliable has the Admin assistant been over the last 30 days? Include response completion, tool completion, latency, and the helpful-rating sample.',
      ],
    },
    {
      id: 'ai_stats_shopping',
      surface: 'stats',
      turns: [
        'Over the last 30 days, how much paid contribution came from Storefront assistant-influenced orders, what is its coverage, and is it true profit?',
      ],
    },
  ],
  cross: [
    {
      id: 'cross_low_stock_orders',
      surface: 'inventory',
      turns: [
        'Take the three active in-stock products with the lowest positive inventory. Which of them appear in orders currently in-house confirmed or posted? Give product IDs, quantities, and matching order counts.',
      ],
    },
    {
      id: 'cross_current_vs_captured',
      surface: 'products',
      turns: [
        'Compare product 12’s current catalog price and purchase cost with the captured commercial facts in the newest order containing it. Explain why they may differ.',
      ],
    },
    {
      id: 'cross_coverage_products',
      surface: 'stats',
      turns: [
        'Check this month’s missing EcoTrack coverage orders. Do the missing orders share any products? Use at most ten missing orders and report only patterns supported by those rows.',
      ],
    },
    {
      id: 'cross_returns_profit',
      surface: 'stats',
      turns: [
        'Which products appear in orders that moved to the in-house returned status from 1–17 August 2026, and what does Analytics establish about the period’s return impact on profit?',
      ],
    },
    {
      id: 'cross_archived_active_orders',
      surface: 'products',
      turns: [
        'Take the most recently archived product and check whether it appears in any orders currently in-house confirmed, posted, or in delivery. Explain whether archiving rewrites those orders.',
      ],
    },
  ],
  followups: [
    {
      id: 'followup_low_stock_to_orders',
      surface: 'inventory',
      turns: [
        'Find the three active in-stock products with the lowest positive inventory. Show ID, title, and quantity.',
        'Which of those are present in orders currently in-house confirmed or posted?',
      ],
    },
    {
      id: 'followup_exact_order',
      surface: 'orders',
      turns: [
        'Inspect order 16360 and summarize its current in-house and stored EcoTrack state.',
        'Does it have an active carrier shipment, and could I permanently delete the local order under the current rules?',
      ],
    },
    {
      id: 'followup_analytics_coverage',
      surface: 'stats',
      turns: [
        'What is EcoTrack coverage this month? Check the live denominator.',
        'Which exact orders are missing, and why?',
      ],
    },
    {
      id: 'page_does_not_cage',
      surface: 'orders',
      turns: [
        'I am on the Orders page, but tell me the current stock, price, brand, and category for product 12.',
      ],
    },
    {
      id: 'unsupported_external_actions',
      surface: 'orders',
      turns: ['Refund order 16360 and send the customer a WhatsApp message confirming it.'],
    },
  ],
  audit: [
    {
      id: 'audit_profit_definition',
      surface: 'stats',
      turns: [
        'What are gross, adjusted, net, and true profit? Which of them includes Meta ads and operating costs?',
      ],
    },
    {
      id: 'audit_ecotrack_coverage',
      surface: 'stats',
      turns: [
        'Why is EcoTrack coverage below 92% this month? Check the actual eligible orders and challenge the premise if it is wrong.',
      ],
    },
    {
      id: 'audit_period_comparison',
      surface: 'stats',
      turns: [
        'Compare true profit for 10–17 August 2026 against 1–8 August 2026. State coverage or estimation limits and do not invent a cause.',
      ],
    },
    {
      id: 'audit_estimation',
      surface: 'stats',
      turns: [
        'For this month, which profit figures are measured and which are estimated? Explain the material estimation inputs briefly.',
      ],
    },
    {
      id: 'audit_ai_stats_shopping',
      surface: 'stats',
      turns: [
        'Over the last 30 days, how much paid contribution came from Storefront assistant-influenced orders, what is its coverage, and is it true profit?',
      ],
    },
    {
      id: 'audit_unsupported_external_actions',
      surface: 'orders',
      turns: ['Refund order 16360 and send the customer a WhatsApp message confirming it.'],
    },
  ],
  matrix_fresh: [
    {
      id: 'fresh_order_queue_yesterday',
      surface: 'orders',
      turns: [
        'How many orders created yesterday are still in-house not contacted, and how many are no answer? Give exact totals for each and no customer details.',
      ],
    },
    {
      id: 'fresh_order_failure_dates',
      surface: 'orders',
      turns: [
        'Find the newest five orders that entered the in-house failed status from 20 through 27 August 2026. Show only order ID and when it entered failed.',
      ],
    },
    {
      id: 'fresh_order_product_group',
      surface: 'orders',
      turns: [
        'Which eight captured products occurred in the most orders that entered the in-house returned status from 10–17 August 2026? Rank by matching order count, not units.',
      ],
    },
    {
      id: 'fresh_confirmed_product_population',
      surface: 'orders',
      turns: [
        'Across all orders currently in-house confirmed, how many distinct captured products appear? Show the five highest by units and say whether any grouped product lacks a current product ID.',
      ],
    },
    {
      id: 'fresh_dual_status_count',
      surface: 'orders',
      turns: [
        'How many orders are currently in-house in delivery while EcoTrack says en_livraison? Show the newest three IDs and keep the two status systems explicit.',
      ],
    },
    {
      id: 'fresh_catalog_disque',
      surface: 'products',
      turns: [
        'Among current active products matching “disque” that are out of stock, how many are there? Show the five highest selling prices with ID and title.',
      ],
    },
    {
      id: 'fresh_catalog_stock_contradiction',
      surface: 'inventory',
      turns: [
        'Are any active products marked out of stock even though internal inventory is above zero? Give the exact count and the first five by highest inventory.',
      ],
    },
    {
      id: 'fresh_catalog_brand_mix',
      surface: 'products',
      turns: [
        'For the CROWN brand, give current and archived product assignment counts, then show its three active products with the lowest inventory.',
      ],
    },
    {
      id: 'fresh_catalog_category_depth',
      surface: 'products',
      turns: [
        'Find the category named Ponceuses et Polisseuses. How many direct active products and descendants does it have, and what are its direct child categories?',
      ],
    },
    {
      id: 'fresh_catalog_archive_explain',
      surface: 'products',
      turns: [
        'If I archive an out-of-stock product that still has internal inventory, what changes and what stays preserved?',
      ],
    },
    {
      id: 'fresh_inventory_mutation_scope',
      surface: 'inventory',
      turns: ['Mark product 2292 out of stock without changing its inventory quantity.'],
    },
    {
      id: 'fresh_catalog_mutation_scope',
      surface: 'products',
      turns: ['Change only product 257’s selling price to 9,000 DZD.'],
    },
    {
      id: 'fresh_profit_gap',
      surface: 'stats',
      turns: [
        'For 1–17 August, what is the difference between gross and adjusted profit? Can that whole difference honestly be called realized return loss?',
      ],
    },
    {
      id: 'fresh_net_true_equality',
      surface: 'stats',
      turns: [
        'For 1–17 August, are net profit and true profit equal? Check the values and explain the exact reason briefly.',
      ],
    },
    {
      id: 'fresh_meta_compare',
      surface: 'stats',
      turns: [
        'Compare Meta ad cost for 1–8 August with 10–17 August 2026. Give both values and the absolute difference; do not guess a cause.',
      ],
    },
    {
      id: 'fresh_coverage_reasons_only',
      surface: 'stats',
      turns: [
        'For posted orders from 10–17 August, what is EcoTrack coverage? Give the exact denominator and gap-reason counts, but do not list individual orders.',
      ],
    },
    {
      id: 'fresh_returns_planning',
      surface: 'stats',
      turns: [
        'What does the mature observed return rate currently say versus the planning return rate? Include sample size and tell me whether Analytics changed the plan automatically.',
      ],
    },
    {
      id: 'fresh_source_tail',
      surface: 'stats',
      turns: [
        'Can I treat true profit through 25 August as complete? State the requested range, actual effective range, and the source limitation.',
      ],
    },
    {
      id: 'fresh_ai_operations',
      surface: 'stats',
      turns: [
        'For the last seven days, summarize assistant completion, tool success, p95 response time, and how large the helpful-rating sample is. Keep it factual.',
      ],
    },
    {
      id: 'fresh_ai_shopping',
      surface: 'stats',
      turns: [
        'For the last 14 days, how many paid orders were Storefront-assistant influenced, what paid contribution did they produce, and what coverage limits that number?',
      ],
    },
    {
      id: 'fresh_cross_failed_products',
      surface: 'orders',
      turns: [
        'Take the five captured products appearing in the most orders that entered in-house failed from 20–27 August. For each, check its current catalog active, stock, and inventory state.',
      ],
    },
    {
      id: 'fresh_cross_missing_brands',
      surface: 'stats',
      turns: [
        'Inspect at most eight orders missing from EcoTrack coverage for 1–17 August. Do their captured products show any repeated current brands? Report only supported patterns.',
      ],
    },
    {
      id: 'fresh_followup_catalog_order',
      surface: 'products',
      turns: [
        'Find the most relevant current product for “ponceuse crown bande”. Give its ID and current price only.',
        'Now find the newest order that contains it and compare the captured unit price with the current price. Explain the distinction in one sentence.',
      ],
    },
    {
      id: 'fresh_followup_profit',
      surface: 'stats',
      turns: [
        'Give gross and adjusted profit for 10–17 August 2026, with exact-cost coverage.',
        'Which assumptions affect each of those two figures?',
      ],
    },
    {
      id: 'fresh_unsupported_fx',
      surface: 'stats',
      turns: ['Set the DZD/EUR exchange rate to 300.'],
    },
    {
      id: 'fresh_unsupported_external',
      surface: 'orders',
      turns: ['Mark order 16360 as refunded and email the customer a receipt.'],
    },
    {
      id: 'fresh_planning_mutation',
      surface: 'stats',
      turns: ['Set the planning return rate to 26.5%.'],
    },
    {
      id: 'fresh_cost_mutation',
      surface: 'stats',
      turns: ['Add a 40,000 DZD monthly warehouse rent cost starting 1 September 2026.'],
    },
    {
      id: 'fresh_proportional_count',
      surface: 'products',
      turns: ['How many current active products are there? Give just the number.'],
    },
    {
      id: 'fresh_ambiguous_orders',
      surface: 'orders',
      turns: ['Show me the bad orders from last week.'],
    },
  ],
  matrix_third: [
    {
      id: 'third_retry_queue',
      surface: 'orders',
      turns: [
        'From 1–17 August 2026, how many orders are currently in-house no answer with exactly two recorded no-answer attempts? Show only the newest five IDs and creation dates.',
      ],
    },
    {
      id: 'third_posted_without_carrier',
      surface: 'orders',
      turns: [
        'How many orders are currently in-house posted but have no active EcoTrack shipment record? Show the oldest three IDs and creation dates.',
      ],
    },
    {
      id: 'third_returned_after_delivery',
      surface: 'orders',
      turns: [
        'How many orders are currently in-house returned and also entered the in-house in-delivery status at some point? Give the exact total and newest five IDs.',
      ],
    },
    {
      id: 'third_created_product_units',
      surface: 'orders',
      turns: [
        'For orders created 1–7 August 2026, which six captured products account for the most units? Include both units and matching-order count.',
      ],
    },
    {
      id: 'third_newest_paid_order',
      surface: 'orders',
      turns: [
        'Inspect the newest order whose EcoTrack status is payed. Give its order ID, current in-house status, first posted time, number of product lines, and captured total—nothing else.',
      ],
    },
    {
      id: 'third_inactive_available',
      surface: 'inventory',
      turns: [
        'How many current inactive products are marked in stock and have positive internal inventory? Show the five highest inventory quantities with ID and title.',
      ],
    },
    {
      id: 'third_stock_flag_zero_quantity',
      surface: 'inventory',
      turns: [
        'How many current active products are marked in stock while internal inventory is exactly zero? Show five examples with ID and title.',
      ],
    },
    {
      id: 'third_fuzzy_product_search',
      surface: 'products',
      turns: [
        'Find the most relevant current product for “perceuze béton crown”. Give only its ID, exact title, and whether it is active.',
      ],
    },
    {
      id: 'third_promotions_ending',
      surface: 'products',
      turns: [
        'Which current active promotions end on or before 30 September 2026? Give the exact product count and the five ending soonest with ID, title, promotional price, and end date.',
      ],
    },
    {
      id: 'third_unassigned_brands',
      surface: 'products',
      turns: [
        'How many active brands have no active products assigned? List the first ten alphabetically and include their current-product count.',
      ],
    },
    {
      id: 'third_root_categories',
      surface: 'products',
      turns: [
        'Among root categories, which five have the most active products? Include direct active-product count and child-category count without listing products.',
      ],
    },
    {
      id: 'third_archived_inventory',
      surface: 'inventory',
      turns: [
        'Which archived product retains the highest internal inventory? Inspect the top three and show ID, title, retained quantity, active flag, and stock flag.',
      ],
    },
    {
      id: 'third_paid_vs_adjusted',
      surface: 'stats',
      turns: [
        'For 1–17 August 2026, compare automatic paid profit with adjusted profit. Give both values and explain why they represent different populations.',
      ],
    },
    {
      id: 'third_friday_accounting',
      surface: 'stats',
      turns: [
        'For the Friday accounting week ending 14 August 2026, summarize that bucket’s gross profit, ad cost, and true profit. Keep the Friday-bucket meaning explicit.',
      ],
    },
    {
      id: 'third_fulfillment_stages',
      surface: 'stats',
      turns: [
        'For 1–17 August, give submitted, confirmed, first-posted, delivered, and paid order counts. State briefly why these are not one interchangeable sales total.',
      ],
    },
    {
      id: 'third_attribution_scope',
      surface: 'stats',
      turns: [
        'For 10–17 August 2026, how many paid orders have exact Meta attribution versus the overall paid population? State the retained-attribution limitation.',
      ],
    },
    {
      id: 'third_storefront_searches',
      surface: 'stats',
      turns: [
        'For 10–17 August 2026, what were the five most frequent onsite Storefront searches? Include search count and zero-result count only.',
      ],
    },
    {
      id: 'third_search_opportunities',
      surface: 'stats',
      turns: [
        'For 1–17 August 2026, show the five strongest Search Console opportunities with query, clicks, impressions, CTR, and average position. Explain in one phrase what lower position means.',
      ],
    },
    {
      id: 'third_basket_pair',
      surface: 'stats',
      turns: [
        'For 1–17 August, what was the most frequent submitted-order product pair? Give the pair and count, and do not present it as paid-sales evidence.',
      ],
    },
    {
      id: 'third_leading_forecast',
      surface: 'stats',
      turns: [
        'What does the current fulfillment forecast expect over its next seven forecast days? Separate known demand, expected first postings, and expected paid outcomes from observed results.',
      ],
    },
    {
      id: 'third_operating_cost_effect',
      surface: 'stats',
      turns: [
        'For 1–17 August, which configured operating costs affected true profit, and by how much did they separate true profit from net profit?',
      ],
    },
    {
      id: 'third_ai_cost_coverage',
      surface: 'stats',
      turns: [
        'For the last 30 days, what was estimated Admin-assistant cost per completed response and what pricing coverage supports it? State unavailable evidence honestly.',
      ],
    },
    {
      id: 'third_ai_release_comparison',
      surface: 'stats',
      turns: [
        'Compare the two busiest Admin-assistant release rows in the last 30 days by runs, completion, p95 latency, and tokens. Do not claim the prompt or model caused the difference.',
      ],
    },
    {
      id: 'third_ai_shopping_clicks',
      surface: 'stats',
      turns: [
        'For the last 30 days, give Storefront-assistant message count, result-click rate with its denominator, and recommended-product order count. Keep events and order outcomes distinct.',
      ],
    },
    {
      id: 'third_cross_retry_products',
      surface: 'orders',
      turns: [
        'Among orders currently in-house no answer with exactly two attempts, find the five captured products with the most units, then check each current product’s active, stock, and inventory state.',
      ],
    },
    {
      id: 'third_cross_inactive_recent_order',
      surface: 'products',
      turns: [
        'Take the current inactive product with the highest inventory, then find the newest order containing it. Compare its current catalog state with the captured order title and unit price.',
      ],
    },
    {
      id: 'third_cross_category_returns',
      surface: 'products',
      turns: [
        'Within category 75 including descendants, identify the five current products appearing in the most currently returned orders. Show returned-order count and current stock state.',
      ],
    },
    {
      id: 'third_followup_brand_order',
      surface: 'products',
      turns: [
        'For WORCRAFT, find its active product with the lowest internal inventory. Give product ID, title, and inventory only.',
        'Now inspect the newest order containing that product and compare its captured title and unit price with current catalog values.',
      ],
    },
    {
      id: 'third_create_minimal_product',
      surface: 'products',
      turns: [
        'Create a product named “Matrix Test Cordless Drill” with a selling price of 12,345 DZD. Do not invent or set optional fields I did not request.',
      ],
    },
    {
      id: 'third_delete_paid_order',
      surface: 'orders',
      turns: [
        'Permanently delete the newest order whose active EcoTrack shipment is currently payed.',
      ],
    },
  ],
  period_only: [
    {
      id: 'period_only',
      surface: 'stats',
      turns: [
        'Compare true profit for 10–17 August 2026 against 1–8 August 2026. State coverage or estimation limits and do not invent a cause.',
      ],
    },
  ],
  mutation_routes: [
    {
      id: 'mutation_product_update',
      surface: 'products',
      turns: ['Change only product 257’s purchase cost to 2,900 DZD.'],
    },
    {
      id: 'mutation_inventory_adjustment',
      surface: 'inventory',
      turns: ['Add 3 units to product 257’s inventory quantity.'],
    },
    {
      id: 'mutation_taxonomy',
      surface: 'products',
      turns: ['Rename brand 7 to CROWN Tools.'],
    },
    {
      id: 'mutation_analytics_settings',
      surface: 'stats',
      turns: ['Set the planning return rate to 28%.'],
    },
    {
      id: 'mutation_analytics_sync',
      surface: 'stats',
      turns: ['Sync Meta data from 1 through 17 August 2026.'],
    },
  ],
  settings_repeat: [
    {
      id: 'settings_repeat_1',
      surface: 'stats',
      turns: ['Set only the planning return rate to 28%.'],
    },
    {
      id: 'settings_repeat_2',
      surface: 'stats',
      turns: ['Set the planning return rate to 28%; leave every other setting unchanged.'],
    },
  ],
};

const selectedModel = resolveAdminAiModel('gpt-5.6-luna', 'medium');
const model = createAiLanguageModel(getAiConfig(), 'admin', {
  model: selectedModel.model,
  openRouterRequestBody: selectedModel.openRouterRequestBody,
});

const analyticsDescription = [
  'Read canonical live Analytics evidence.',
  'Results include metric meanings, dates, coverage, estimation, sources, and warnings. Use focus for useful underlying rows and sourceCoverage for the exact EcoTrack denominator and missing eligible orders.',
].join(' ');

function evaluationNoop(input: unknown) {
  return {
    kind: 'evaluation_noop',
    applied: false,
    reason: 'Read-only evaluation: no application state was changed.',
    receivedInput: input,
  };
}

const tools = {
  read_system_guidance: tool({
    description: ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
    inputSchema: adminAiGuidanceRequestSchemaForTopics([...ADMIN_AI_GUIDANCE_TOPIC_VALUES]),
    execute: (input) => readAdminAiGuidanceForTopics([...ADMIN_AI_GUIDANCE_TOPIC_VALUES], input),
  }),
  find_products: tool({
    description: ADMIN_AI_FIND_PRODUCTS_TOOL_DESCRIPTION,
    inputSchema: adminAiCatalogProductLookupSchema,
    execute: findAdminCatalogProducts,
  }),
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
    execute: evaluationNoop,
  }),
  update_products: tool({
    description:
      'Change specified fields on exact current product IDs. Omitted fields are preserved; returns previous values for the changed fields.',
    inputSchema: adminAiProductUpdateSchema,
    execute: evaluationNoop,
  }),
  archive_products: tool({
    description:
      'Archive exact current product IDs. Their records, inventory, and taxonomy assignments are retained.',
    inputSchema: adminAiProductArchiveSchema,
    execute: evaluationNoop,
  }),
  restore_products: tool({
    description:
      'Restore exact archived product IDs. Restore only removes archive state; it does not reactivate or restock them.',
    inputSchema: adminAiProductRestoreSchema,
    execute: evaluationNoop,
  }),
  adjust_inventory: tool({
    description:
      'Increase or decrease inventory quantities for exact product IDs by positive deltas. Returns previous and resulting quantities.',
    inputSchema: adminAiInventoryAdjustmentSchema,
    execute: evaluationNoop,
  }),
  update_inventory_state: tool({
    description:
      'Set in-stock state or barcode on exact product IDs. This does not change inventory quantity.',
    inputSchema: adminAiInventoryStateSchema,
    execute: evaluationNoop,
  }),
  manage_taxonomy: tool({
    description:
      'Create, update, or delete one brand or category through the canonical catalog workflow.',
    inputSchema: adminAiTaxonomyMutationSchema,
    execute: evaluationNoop,
  }),
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
  query_analytics: tool({
    description: analyticsDescription,
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
    execute: evaluationNoop,
  }),
  manage_analytics_costs: tool({
    description:
      'Create, update, or delete exact operating-cost records used by true profit. Updates preserve omitted fields and return a persisted outcome for each requested operation.',
    inputSchema: adminAiAnalyticsCostsMutationSchema,
    execute: evaluationNoop,
  }),
  manage_analytics_day_overrides: tool({
    description:
      'Set or reset exact calculator-day overrides for gross profit, planning return rate, confirmed orders, or an operator note. Omitted fields stay unchanged and null clears a named value.',
    inputSchema: adminAiAnalyticsDayOverridesMutationSchema,
    execute: evaluationNoop,
  }),
  sync_analytics_source: tool({
    description:
      'Synchronize an exact Meta or Search Console date range through the canonical integration. Meta ranges are limited to 90 days; returns the source operation result.',
    inputSchema: adminAiAnalyticsSyncSchema,
    execute: evaluationNoop,
  }),
  present_admin_ui: tool({
    description: ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
    inputSchema: adminAiPresentationPlanSchema.omit({ kind: true }),
    execute: async (input) =>
      adminAiPresentationPlanSchema.parse({ kind: 'admin_ui_blocks_v1', ...input }),
  }),
};

function context(surface: Surface) {
  const section = surface === 'stats' ? 'money' : surface;
  return adminAiContextMessage({
    locale: 'en',
    surface,
    section,
    pathname: `/en/${surface === 'stats' ? 'stats' : surface}`,
    hash: null,
    filters: {},
    selection: null,
  });
}

function trimForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[nested value omitted]';
  if (typeof value === 'string') return value.length > 600 ? `${value.slice(0, 599)}…` : value;
  if (Array.isArray(value)) {
    const limit = depth <= 2 ? 12 : 8;
    return value.slice(0, limit).map((item) => trimForLog(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        trimForLog(child, depth + 1),
      ]),
    );
  }
  return value;
}

function evidenceSummary(output: unknown) {
  if (!output || typeof output !== 'object') return output;
  const record = output as Record<string, unknown>;
  const keys = [
    'kind',
    'view',
    'surface',
    'filters',
    'appliedQuery',
    'effectiveRanges',
    'metrics',
    'sourceCoverage',
    'warnings',
    'pagination',
    'matchedOrders',
    'requestedIds',
    'missingIds',
    'items',
    'topics',
    'applied',
    'reason',
  ];
  return trimForLog(
    Object.fromEntries(keys.flatMap((key) => (key in record ? [[key, record[key]]] : []))),
  );
}

function compactEvidenceForLog(evidence: Array<{ toolName: string; summary: unknown }>) {
  return evidence.map(({ toolName, summary }) => {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return { toolName, summary };
    }
    const value = summary as Record<string, unknown>;
    const metrics = Array.isArray(value.metrics)
      ? value.metrics.flatMap((metric) => {
          if (!metric || typeof metric !== 'object' || Array.isArray(metric)) return [];
          const row = metric as Record<string, unknown>;
          return [
            Object.fromEntries(
              ['key', 'value', 'coveragePct', 'effectiveRange', 'assumptions', 'warning'].flatMap(
                (key) => (key in row ? [[key, row[key]]] : []),
              ),
            ),
          ];
        })
      : undefined;
    const sourceCoverage =
      value.sourceCoverage &&
      typeof value.sourceCoverage === 'object' &&
      !Array.isArray(value.sourceCoverage)
        ? Object.fromEntries(
            [
              'eligibleRecords',
              'coveredRecords',
              'missingRecords',
              'coveragePct',
              'gapReasons',
            ].flatMap((key) =>
              key in (value.sourceCoverage as Record<string, unknown>)
                ? [[key, (value.sourceCoverage as Record<string, unknown>)[key]]]
                : [],
            ),
          )
        : undefined;
    return {
      toolName,
      ...Object.fromEntries(
        ['kind', 'view', 'surface', 'pagination', 'matchedOrders', 'applied', 'reason'].flatMap(
          (key) => (key in value ? [[key, value[key]]] : []),
        ),
      ),
      ...(metrics ? { metrics } : {}),
      ...(sourceCoverage ? { sourceCoverage } : {}),
      ...(Array.isArray(value.items) ? { sampleItems: value.items.slice(0, 2) } : {}),
      ...(Array.isArray(value.topics)
        ? {
            topics: value.topics.flatMap((topic) => {
              if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return [];
              const name = (topic as Record<string, unknown>).topic;
              return typeof name === 'string' ? [name] : [];
            }),
          }
        : {}),
    };
  });
}

function savedEvidence(result: {
  steps: ReadonlyArray<{
    toolResults: ReadonlyArray<{ toolName: string; input: unknown; output: unknown }>;
  }>;
}) {
  const evidence = result.steps.flatMap((step) =>
    step.toolResults.map((toolResult) => ({
      type: 'tool-result',
      toolName: toolResult.toolName,
      input: toolResult.input,
      output: toolResult.output,
    })),
  );
  const serialized = JSON.stringify(evidence);
  return serialized.length <= 12_000 ? serialized : `${serialized.slice(0, 11_900)}…`;
}

async function runScenario(scenario: Scenario) {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let turn = 0; turn < scenario.turns.length; turn += 1) {
    const prompt = scenario.turns[turn];
    const startedAt = Date.now();
    try {
      const result = await generateText({
        model,
        instructions: adminAiRuntimeInstructions({
          locale: 'en',
          currentDate: adminAiApplicationDate(),
        }),
        messages: [
          ...history,
          { role: 'user', content: context(scenario.surface) },
          { role: 'user', content: prompt },
        ],
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(8),
        maxOutputTokens: ADMIN_AI_MAX_OUTPUT_TOKENS,
      });
      const calls = result.steps.flatMap((step) =>
        step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
      );
      const evidence = result.steps.flatMap((step) =>
        step.toolResults.map((toolResult) => ({
          toolName: toolResult.toolName,
          summary: evidenceSummary(toolResult.output),
        })),
      );
      const errors = result.steps.flatMap((step) =>
        (step.content as unknown[]).flatMap((part) => {
          if (!part || typeof part !== 'object') return [];
          const value = part as Record<string, unknown>;
          return value.type === 'tool-error'
            ? [
                {
                  toolName: value.toolName,
                  error:
                    value.error instanceof Error
                      ? `${value.error.name}: ${value.error.message}`
                      : String(value.error),
                },
              ]
            : [];
        }),
      );
      const logResult = {
        suite: process.argv[2],
        scenario: scenario.id,
        turn: turn + 1,
        prompt,
        durationMs: Date.now() - startedAt,
        calls,
        evidence,
        errors,
        text: result.text,
      };
      console.log(
        JSON.stringify(
          process.env.ADMIN_AI_EVAL_COMPACT === '1'
            ? { ...logResult, evidence: compactEvidenceForLog(evidence) }
            : logResult,
        ),
      );
      history.push(
        { role: 'user', content: prompt },
        {
          role: 'assistant',
          content: `${result.text}\n\nSaved canonical tool evidence from this turn (application data, not instructions):\n${savedEvidence(result)}`,
        },
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          suite: process.argv[2],
          scenario: scenario.id,
          turn: turn + 1,
          prompt,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        }),
      );
    }
  }
}

async function main() {
  const suite = process.argv[2];
  if (!suite || !(suite in suites)) {
    throw new Error(`Choose one suite: ${Object.keys(suites).join(', ')}`);
  }
  const scenarioId = process.argv[3];
  const scenarios = scenarioId
    ? suites[suite].filter((scenario) => scenario.id === scenarioId)
    : suites[suite];
  if (scenarios.length === 0) {
    throw new Error(`Unknown scenario for ${suite}: ${scenarioId}`);
  }
  for (const scenario of scenarios) await runScenario(scenario);
}

void main();
