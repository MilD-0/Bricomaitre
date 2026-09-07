import type { Scenario } from './ai-eval-scenarios';

// Expectations are evaluator metadata, never instructions sent to the assistant.
// Missing records or a dry-run dependency leave coverage missing, not passed.
export const operatorWorkflows: Scenario[] = [
  {
    id: 'workflow_new_product',
    surface: 'products',
    expectedTools: ['create_product'],
    turns: [
      'Add a product called "Marteau de chantier 500 g" at 1800 DA, with a purchase cost of 1100 DA. Leave it hidden from customers for now.',
    ],
  },
  {
    id: 'workflow_product_correction',
    surface: 'products',
    expectedTools: [
      'find_products',
      'inspect_products',
      'update_products',
      'adjust_inventory',
      'update_inventory_state',
    ],
    turns: [
      'Find Marteau atelier and show me its price, purchase cost and quantity before changing anything.',
      'Change its selling price to 1900 DA. Keep its purchase cost and everything else as they are.',
      'We found three more of that hammer on the shelf. Add them to our stock count.',
      'Set its barcode to ATELIER-MARTEAU-01. Do not change the quantity again.',
    ],
  },
  {
    id: 'workflow_archive_product',
    surface: 'products',
    expectedTools: ['query_products', 'archive_products'],
    turns: ['Find our oldest inactive product and archive it. Keep its stock and order history.'],
  },
  {
    id: 'workflow_restore_product',
    surface: 'products',
    expectedTools: ['inspect_archived_products', 'restore_products'],
    turns: [
      'Show me the archived details of our most recently archived product, including when it was archived. Then bring it back. Do not put it on sale or add stock.',
    ],
  },
  {
    id: 'workflow_taxonomy',
    surface: 'products',
    expectedTools: ['find_brands', 'find_categories', 'manage_taxonomy'],
    turns: [
      'Check whether we already have a brand named Atelier Nord and a root category named Outils de chantier. Add whichever is missing, without moving any products.',
    ],
  },
  {
    id: 'workflow_receive_order',
    surface: 'inventory',
    expectedTools: ['scan_inventory', 'receive_inventory'],
    turns: [
      'The items on order 16360 have come back to the warehouse. Scan that order and add all its matched product quantities back to stock. Tell me if anything could not be received.',
    ],
  },
  {
    id: 'workflow_new_order',
    surface: 'orders',
    expectedTools: ['find_products', 'create_order'],
    turns: [
      'Create an order for Ahmed Benali, phone 0550123456, for two of the cheapest available hammers. Home delivery to 12 rue Didouche Mourad, Alger Centre, Alger. No email, second phone or discount. Add the note "Call before delivery". Do not send it to the carrier.',
    ],
  },
  {
    id: 'workflow_order_call',
    surface: 'orders',
    expectedTools: [
      'query_orders',
      'inspect_orders',
      'update_order_details',
      'update_order_status',
    ],
    turns: [
      'Show me order 500001 and its customer details.',
      'I called that customer and they confirmed. Add the note "Customer confirmed by phone; call before delivery" and mark the order confirmed. Leave their address and products alone.',
    ],
  },
  {
    id: 'workflow_delete_cancelled_order',
    surface: 'orders',
    expectedTools: ['query_orders', 'inspect_ecotrack_shipments', 'delete_orders'],
    turns: [
      'Check that cancelled order 500003 has no active carrier shipment, then permanently delete the local order. I understand it cannot be recovered. Do not delete anything at the carrier.',
    ],
  },
  {
    id: 'workflow_carrier_posting',
    surface: 'orders',
    expectedTools: [
      'load_ecotrack_requirements',
      'preview_ecotrack_posting',
      'post_orders_to_ecotrack',
    ],
    turns: [
      'Check what Delivro needs for delivery and whether order 500002 is ready. If it is ready, send it to Delivro. Otherwise tell me what needs fixing.',
    ],
  },
  {
    id: 'workflow_carrier_correction',
    surface: 'orders',
    expectedTools: [
      'inspect_ecotrack_shipments',
      'change_ecotrack_shipments',
      'manage_ecotrack_shipments',
    ],
    turns: [
      'Show me the Delivro shipment for order 500004 and its delivery details.',
      'Add "Call the customer before delivery" to the delivery instructions on that carrier shipment. Keep everything else unchanged.',
      'Get the shipping label for that shipment so I can print it.',
    ],
  },
  {
    id: 'workflow_saved_picking_list',
    surface: 'orders',
    expectedTools: ['inspect_order_shopping_list', 'apply_order_shopping_list_inventory'],
    turns: [
      'Open our saved shopping list for order 500002 and deduct the items we can cover from stock. Skip shortages and anything already deducted. Tell me what is left to sort out.',
    ],
  },
  {
    id: 'workflow_selected_export',
    surface: 'orders',
    expectedTools: ['query_orders', 'preview_order_export', 'start_order_export'],
    turns: [
      'Find our five newest confirmed orders and export those orders to Excel. Leave their statuses unchanged.',
    ],
  },
  {
    id: 'workflow_profit_settings',
    surface: 'stats',
    expectedTools: [
      'query_analytics',
      'update_analytics_settings',
      'manage_analytics_costs',
      'manage_analytics_day_overrides',
    ],
    turns: [
      'Show me the return percentage we use for planning and our saved monthly expenses.',
      'Use 25% for expected returns from now on. Add a monthly warehouse cleaning expense of 3000 DA starting September 1, 2026. Do not add it twice if it is already there.',
      'For August 17, 2026 only, use gross profit of 45000 DA and add the note "Checked against the paper ledger". Leave the other figures alone.',
    ],
  },
  {
    id: 'workflow_refresh_reports',
    surface: 'stats',
    expectedTools: ['sync_analytics_source'],
    turns: [
      'Refresh our Meta advertising figures and Google Search Console figures for August 10 through 17, 2026. Tell me whether each refresh completed.',
    ],
  },
  {
    id: 'workflow_announcement',
    surface: 'administration',
    expectedTools: ['inspect_storefront_configuration', 'update_storefront_announcement'],
    turns: [
      'Show this announcement on the shop: French "Bienvenue chez Bricomaitre", Arabic "مرحبا بكم في بريكومايتر". Leave the contact details and customer assistant settings alone.',
    ],
  },
  {
    id: 'workflow_job_progress',
    surface: 'products',
    expectedTools: [
      'get_product_content_job_status',
      'get_catalog_categorization_status',
      'get_landing_page_job_status',
    ],
    turns: [
      'Have my latest product translation, product categorization and landing-page jobs finished? Check each one and tell me what is saved, still running or failed. Do not start them again.',
    ],
  },
  {
    id: 'workflow_visual_summary',
    surface: 'stats',
    expectedTools: ['query_analytics', 'present_admin_ui'],
    turns: [
      'Show profit and advertising spend for August 10 through 17, 2026 as summary cards here in the chat, with a link to the report. Briefly tell me if the numbers are complete.',
    ],
  },
];

export const existingScenarioTools: Record<string, string[]> = {
  orders_workflow: ['read_system_guidance'],
  catalog_brands: ['find_brands'],
  catalog_categories: ['find_categories'],
  ai_stats_operations: ['query_ai_stats'],
  assets_current_state: ['inspect_assets'],
  assets_disable_card: ['manage_assets'],
  assets_reverse_banners: ['reorder_assets'],
  landing_pages_progressive_detail: ['inspect_landing_pages'],
  landing_pages_create_draft: ['start_landing_page_work'],
  landing_pages_unpublish: ['set_landing_page_active'],
  commerce_shopping_apply: ['save_order_shopping_list'],
  commerce_tracking_link: ['get_order_tracking_links'],
  commerce_generate_content: ['generate_product_content'],
  commerce_categorize_catalog: ['categorize_catalog'],
  storefront_contact_mutation: ['update_storefront_settings'],
};
