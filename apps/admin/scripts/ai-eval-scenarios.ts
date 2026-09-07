import 'dotenv/config';
import { existingScenarioTools, operatorWorkflows } from './ai-eval-workflows';

export type Surface =
  'orders' | 'products' | 'inventory' | 'stats' | 'administration' | 'assets' | 'unknown';

export type Scenario = { id: string; surface: Surface; turns: string[]; expectedTools?: string[] };

export const suites: Record<string, Scenario[]> = {
  workflows: operatorWorkflows,
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
        'What is happening with order 16360? Tell me its status here and whether its carrier shipment still exists or was deleted.',
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
        'Which five brands have no active products? Show how many current and archived products belong to each.',
      ],
    },
    {
      id: 'catalog_categories',
      surface: 'products',
      turns: [
        'Which five top-level categories have the most active products of their own? Show their immediate subcategories too, and how many subcategories sit below each in total.',
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
        'I think fewer than 92% of this month’s orders are covered by EcoTrack. Is that right? Check which orders should be counted and which are missing.',
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
        'How much did we earn from paid orders where customers used the shop assistant in the last 30 days? How complete is that figure, and does it include all our costs?',
      ],
    },
  ],
  storefront: [
    {
      id: 'storefront_configuration',
      surface: 'administration',
      turns: [
        'What contact details, customer assistant model, and announcement are currently shown on the Storefront? Keep it brief.',
      ],
    },
    {
      id: 'storefront_model_choice',
      surface: 'administration',
      turns: [
        'Can I change the Storefront customer assistant to any model name, or only certain models?',
      ],
    },
    {
      id: 'storefront_announcement_mutation',
      surface: 'administration',
      turns: ['Turn off the Storefront announcement bar. Do not change either saved message.'],
    },
    {
      id: 'storefront_contact_mutation',
      surface: 'administration',
      turns: ['Change only the Storefront contact email to ventes@bricomaitre.com.'],
    },
    {
      id: 'storefront_model_mutation',
      surface: 'administration',
      turns: ['Switch the Storefront customer assistant model to openai/gpt-5.6-luna.'],
    },
    {
      id: 'storefront_incomplete_announcement',
      surface: 'administration',
      turns: [
        'Turn on a Storefront announcement saying “Livraison gratuite” in French. I have not supplied Arabic text.',
      ],
    },
    {
      id: 'storefront_phone_availability',
      surface: 'administration',
      turns: ['Hide the Storefront phone contact completely, but keep the saved phone number.'],
    },
  ],
  assets: [
    {
      id: 'assets_current_state',
      surface: 'assets',
      turns: [
        'How many banners, featured groups, and product cards do we have, and how many of each are active? Keep it brief.',
      ],
    },
    {
      id: 'assets_featured_group_meaning',
      surface: 'assets',
      turns: [
        'Look at the first active featured group. Which products belong in it, and what happens if we give that group priority in the shop assistant’s recommendations?',
      ],
    },
    {
      id: 'assets_disable_card',
      surface: 'assets',
      turns: ['Deactivate the first currently active product card. Change nothing else.'],
    },
    {
      id: 'assets_group_recommendation',
      surface: 'assets',
      turns: [
        'Give the first active featured group’s products recommendation priority. Preserve all of its content and selections.',
      ],
    },
    {
      id: 'assets_reverse_banners',
      surface: 'assets',
      turns: ['Reverse the current banner order, using the complete current banner list.'],
    },
    {
      id: 'landing_pages_current_state',
      surface: 'assets',
      turns: [
        'How many landing pages do we have in French and Arabic, and how many are live? Keep it brief.',
      ],
    },
    {
      id: 'landing_pages_progressive_detail',
      surface: 'assets',
      turns: [
        'Open the first published landing page. Which parts were written for the page, and which details come from the product catalog?',
        'Show me just the opening section of that same page and its heading so I know which part we are looking at.',
      ],
    },
    {
      id: 'landing_pages_create_draft',
      surface: 'assets',
      turns: [
        'Pick an active product we have in stock and make a French sales-page draft for tradespeople. Keep it unpublished.',
      ],
    },
    {
      id: 'landing_pages_scoped_revision',
      surface: 'assets',
      turns: [
        'Open the first published landing page and make only its opening section clearer for an ordinary customer. Keep the page published and leave the rest alone.',
      ],
    },
    {
      id: 'landing_pages_unpublish',
      surface: 'assets',
      turns: ['Unpublish the first currently live landing page without changing its content.'],
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
        'Look at up to ten orders missing from this month’s EcoTrack figures. Do the same products keep appearing? Tell me what you can actually see.',
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
        'How complete are our EcoTrack figures this month? How many orders should be included?',
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
        'I think fewer than 92% of this month’s orders are covered by EcoTrack. Is that right? Check which orders should be counted and which are missing.',
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
        'How much did we earn from paid orders where customers used the shop assistant in the last 30 days? How complete is that figure, and does it include all our costs?',
      ],
    },
    {
      id: 'audit_unsupported_external_actions',
      surface: 'orders',
      turns: ['Refund order 16360 and send the customer a WhatsApp message confirming it.'],
    },
  ],
  commerce_spine: [
    {
      id: 'commerce_inventory_scan',
      surface: 'inventory',
      turns: [
        'I scanned 16360 at the warehouse. What did it find, and how many of each product are on it? Do not add anything to stock yet.',
      ],
    },
    {
      id: 'commerce_inventory_receive',
      surface: 'inventory',
      turns: ['Scan barcode DRILL-12 and receive two units for the matched product.'],
    },
    {
      id: 'commerce_shopping_preview',
      surface: 'orders',
      turns: [
        'What do we need to pick for all confirmed orders? Summarize the orders, items and quantities, what we are short of, and anything you cannot match to a product. Just show me for now.',
      ],
    },
    {
      id: 'commerce_shopping_apply',
      surface: 'orders',
      turns: [
        'Save a shopping list for all confirmed orders and deduct what we can pick from stock. Tell me what was deducted and what is still unresolved.',
      ],
    },
    {
      id: 'commerce_tracking_link',
      surface: 'orders',
      turns: ['Give me the customer tracking link for local order 16360.'],
    },
    {
      id: 'commerce_order_export',
      surface: 'orders',
      turns: [
        'Export the recent confirmed orders to Excel. Check that there is something to export first, and leave their statuses alone.',
      ],
    },
    {
      id: 'commerce_generate_content',
      surface: 'products',
      turns: [
        'Fill in missing Arabic names and descriptions for our active products. Leave your suggestions for me to review before applying them.',
      ],
    },
    {
      id: 'commerce_categorize_catalog',
      surface: 'products',
      turns: [
        'Suggest categories for all active products that do not have one, using the categories we already have. Leave anything uncertain alone and let me review the suggestions first.',
      ],
    },
  ],
};

for (const scenario of Object.values(suites).flat()) {
  scenario.expectedTools ??= existingScenarioTools[scenario.id];
}
