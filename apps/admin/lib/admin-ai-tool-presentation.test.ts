import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_PRESENTED_TOOL_NAMES,
  adminAiToolActivityKey,
  adminAiToolPresentation,
} from './admin-ai-tool-presentation';

describe('admin assistant tool presentation', () => {
  it('gives every presented assistant action a specific human result label', () => {
    const toolNames = [
      'find_products',
      'inspect_products',
      'create_product',
      'update_products',
      'archive_products',
      'inspect_archived_products',
      'restore_products',
      'find_brands',
      'find_categories',
      'manage_taxonomy',
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
      'inspect_ecotrack_shipments',
      'manage_ecotrack_shipments',
      'change_ecotrack_shipments',
      'update_order_status',
      'update_order_details',
      'inspect_inventory',
      'scan_inventory',
      'adjust_inventory',
      'receive_inventory',
      'update_inventory_state',
      'inspect_assets',
      'inspect_landing_pages',
      'create_landing_page',
      'edit_landing_page',
      'update_asset_state',
      'reorder_assets',
      'manage_assets',
      'inspect_ai_proposals',
      'review_ai_proposals',
      'inspect_bulletin',
      'create_bulletin_post',
      'reply_bulletin_post',
      'set_bulletin_reaction',
      'update_bulletin_post',
      'delete_bulletin_content',
      'inspect_administration',
      'set_access_grant',
      'revoke_access_grants',
      'set_role_definition',
      'inspect_action_history',
      'recover_action_history',
      'inspect_storefront_configuration',
      'update_storefront_settings',
      'update_storefront_announcement',
      'update_analytics_settings',
      'manage_analytics_costs',
      'manage_analytics_day_overrides',
      'sync_analytics_source',
      'generate_product_content',
      'get_product_content_job_status',
      'list_background_jobs',
      'get_background_job',
      'stop_background_job',
      'start_background_job',
      'suggest_discount',
      'suggest_featured_products',
      'suggest_landing_page',
      'categorize_catalog',
      'get_catalog_categorization_status',
      'propose_product_edit',
      'propose_brand_edit',
      'propose_category_edit',
      'propose_brand_create',
      'propose_category_create',
    ];

    expect([...ADMIN_AI_PRESENTED_TOOL_NAMES].sort()).toEqual(toolNames.sort());
    for (const toolName of toolNames) {
      expect(adminAiToolPresentation(toolName, {}, 'fr').labelKey).not.toBe('result');
      expect(adminAiToolActivityKey(toolName)).not.toBe('result');
    }
    expect(adminAiToolActivityKey('query_analytics')).toBe('analytics');
    expect(adminAiToolActivityKey('update_analytics_settings')).toBe('analytics');
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
  });

  it('links landing-page mutations to the exact persisted editor', () => {
    expect(adminAiToolPresentation('create_landing_page', { id: 91 }, 'en')).toEqual({
      labelKey: 'landingPageCreated',
      destinationKey: 'landingPages',
      href: '/en/assets/landing-pages/91',
    });
    expect(adminAiToolPresentation('edit_landing_page', { landingPageId: 12 }, 'ar').href).toBe(
      '/ar/assets/landing-pages/12',
    );
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

  it('links assets and administration results to their exact owning workspace', () => {
    expect(
      adminAiToolPresentation('manage_assets', { kind: 'featured-group', id: 8 }, 'fr').href,
    ).toBe('/fr/assets/featured-groups');
    expect(adminAiToolPresentation('set_access_grant', {}, 'en').href).toBe(
      '/en/administration/users',
    );
    expect(adminAiToolPresentation('revoke_access_grants', {}, 'fr').href).toBe(
      '/fr/administration/users',
    );
    expect(adminAiToolPresentation('set_role_definition', {}, 'en').href).toBe(
      '/en/administration/roles',
    );
    expect(adminAiToolPresentation('inspect_action_history', {}, 'en').href).toBe(
      '/en/administration/history',
    );
    expect(adminAiToolPresentation('recover_action_history', {}, 'ar').href).toBe(
      '/ar/administration/history',
    );
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
