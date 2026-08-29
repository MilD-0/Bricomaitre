import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_MUTATING_TOOL_NAMES,
  ADMIN_AI_PRESENTED_TOOL_NAMES,
  adminAiToolActivityKey,
  adminAiToolMutatesApplication,
  adminAiToolPresentation,
} from './admin-ai-tool-presentation';

describe('admin assistant tool presentation', () => {
  it('gives every presented assistant action a specific human result label', () => {
    const toolNames = [
      'find_products',
      'query_products',
      'inspect_products',
      'create_product',
      'update_products',
      'archive_products',
      'inspect_archived_products',
      'restore_products',
      'find_brands',
      'find_categories',
      'manage_taxonomy',
      'query_orders',
      'inspect_orders',
      'create_order',
      'delete_orders',
      'preview_order_export',
      'start_order_export',
      'get_order_tracking_links',
      'inspect_order_shopping_list',
      'save_order_shopping_list',
      'apply_order_shopping_list_inventory',
      'preview_ecotrack_posting',
      'load_ecotrack_requirements',
      'post_orders_to_ecotrack',
      'ecotrack_posting_terminal',
      'inspect_ecotrack_shipments',
      'manage_ecotrack_shipments',
      'change_ecotrack_shipments',
      'update_order_status',
      'update_order_details',
      'scan_inventory',
      'adjust_inventory',
      'receive_inventory',
      'update_inventory_state',
      'inspect_assets',
      'inspect_landing_pages',
      'start_landing_page_work',
      'set_landing_page_active',
      'get_landing_page_job_status',
      'reorder_assets',
      'manage_assets',
      'inspect_storefront_configuration',
      'update_storefront_settings',
      'update_storefront_announcement',
      'update_analytics_settings',
      'manage_analytics_costs',
      'manage_analytics_day_overrides',
      'sync_analytics_source',
      'generate_product_content',
      'get_product_content_job_status',
      'categorize_catalog',
      'get_catalog_categorization_status',
    ];

    expect([...ADMIN_AI_PRESENTED_TOOL_NAMES].sort()).toEqual(toolNames.sort());
    for (const toolName of toolNames) {
      expect(adminAiToolPresentation(toolName, {}, 'fr').labelKey).not.toBe('result');
      expect(adminAiToolActivityKey(toolName)).not.toBe('result');
    }
    expect(adminAiToolActivityKey('query_analytics')).toBe('analytics');
    expect(adminAiToolActivityKey('query_ai_stats')).toBe('analytics');
    expect(adminAiToolActivityKey('update_analytics_settings')).toBe('analytics');
  });

  it('distinguishes application mutations from reads and previews', () => {
    for (const toolName of ADMIN_AI_MUTATING_TOOL_NAMES) {
      expect(adminAiToolMutatesApplication(toolName)).toBe(true);
    }
    for (const toolName of [
      'query_orders',
      'inspect_orders',
      'preview_ecotrack_posting',
      'load_ecotrack_requirements',
      'ecotrack_posting_terminal',
      'inspect_ecotrack_shipments',
      'query_analytics',
      'query_ai_stats',
    ]) {
      expect(adminAiToolMutatesApplication(toolName)).toBe(false);
    }
  });

  it('links Analytics actions to the exact owning workspace', () => {
    expect(adminAiToolPresentation('update_analytics_settings', {}, 'fr').href).toBe(
      '/fr/stats/costs',
    );
    expect(
      adminAiToolPresentation('sync_analytics_source', { source: 'searchConsole' }, 'en').href,
    ).toBe('/en/stats/search');
    expect(adminAiToolPresentation('sync_analytics_source', { source: 'meta' }, 'ar').href).toBe(
      '/ar/stats/meta-ads',
    );
    expect(adminAiToolPresentation('query_analytics', { view: 'fulfillment' }, 'en').href).toBe(
      '/en/stats/fulfillment',
    );
    expect(
      adminAiToolPresentation(
        'query_analytics',
        { kind: 'analytics_investigation', results: [{ view: 'search' }] },
        'fr',
      ).href,
    ).toBe('/fr/stats/search');
    expect(adminAiToolPresentation('query_ai_stats', { surface: 'operations' }, 'en').href).toBe(
      '/en/stats/ai-assistants',
    );
    expect(adminAiToolPresentation('query_ai_stats', { surface: 'shopping' }, 'ar').href).toBe(
      '/ar/stats/shopping-assistant',
    );
  });

  it('links landing-page mutations to the exact persisted editor', () => {
    expect(adminAiToolPresentation('set_landing_page_active', { id: 41 }, 'fr').href).toBe(
      '/fr/assets/landing-pages/41',
    );
    expect(adminAiToolPresentation('start_landing_page_work', {}, 'en').href).toBe(
      '/en/assets/landing-pages',
    );
  });

  it('links taxonomy changes to the canonical Brands workspace', () => {
    expect(adminAiToolPresentation('manage_taxonomy', {}, 'fr').href).toBe('/fr/brands');
  });

  it('links ECOTRACK workflows to the native shipment workspace', () => {
    for (const toolName of [
      'preview_ecotrack_posting',
      'load_ecotrack_requirements',
      'post_orders_to_ecotrack',
      'inspect_ecotrack_shipments',
      'manage_ecotrack_shipments',
      'change_ecotrack_shipments',
    ]) {
      expect(adminAiToolPresentation(toolName, {}, 'fr').href).toBe('/fr/orders/ecotrack');
      expect(adminAiToolActivityKey(toolName)).toBe('orders');
    }
  });

  it('links local order creation and deletion to the native Orders workspace', () => {
    expect(adminAiToolPresentation('create_order', {}, 'fr').href).toBe('/fr/orders');
    expect(adminAiToolPresentation('delete_orders', {}, 'ar').href).toBe('/ar/orders');
  });

  it('links order exports and customer tracking handoff to Orders', () => {
    for (const toolName of [
      'preview_order_export',
      'start_order_export',
      'get_order_tracking_links',
    ]) {
      expect(adminAiToolPresentation(toolName, {}, 'fr').href).toBe('/fr/orders');
    }
  });

  it('links shared shopping-list drafts to Orders and applied stock to Inventory', () => {
    expect(adminAiToolPresentation('inspect_order_shopping_list', {}, 'fr').href).toBe(
      '/fr/orders',
    );
    expect(adminAiToolPresentation('save_order_shopping_list', {}, 'fr').href).toBe('/fr/orders');
    expect(adminAiToolPresentation('apply_order_shopping_list_inventory', {}, 'fr').href).toBe(
      '/fr/inventory',
    );
  });

  it('links scanner, receipt, and inventory-state results to native Inventory', () => {
    for (const toolName of ['scan_inventory', 'receive_inventory', 'update_inventory_state']) {
      expect(adminAiToolPresentation(toolName, {}, 'fr').href).toBe('/fr/inventory');
      expect(adminAiToolActivityKey(toolName)).toBe('inventory');
    }
  });

  it('links assets to their exact owning workspace', () => {
    expect(
      adminAiToolPresentation('manage_assets', { kind: 'featured-group', id: 8 }, 'fr').href,
    ).toBe('/fr/assets/featured-groups');
  });

  it('links archived product reads and restores back to the native archive', () => {
    expect(adminAiToolPresentation('inspect_archived_products', {}, 'fr').href).toBe('/fr/archive');
    expect(adminAiToolPresentation('restore_products', {}, 'en').href).toBe('/en/archive');
  });

  it('keeps unknown future tools readable without inventing a destination', () => {
    expect(adminAiToolPresentation('future_tool', { id: 1 }, 'en')).toEqual({
      labelKey: 'result',
    });
  });
});
