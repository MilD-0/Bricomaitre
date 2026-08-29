import { describe, expect, it } from 'vitest';

import { buildAdminAiTools } from './admin-ai-tools';

const allPermissions = [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
  'analytics_manage',
  'settings_manage',
] as const;

describe('Admin AI live tool construction', () => {
  it('constructs only the decided live surface', () => {
    const tools = buildAdminAiTools({
      permissions: allPermissions,
      locale: 'en',
      runtime: { kind: 'evaluation' },
    });

    expect(Object.keys(tools).sort()).toEqual(
      [
        'adjust_inventory',
        'apply_order_shopping_list_inventory',
        'archive_products',
        'categorize_catalog',
        'change_ecotrack_shipments',
        'create_order',
        'create_product',
        'delete_orders',
        'find_brands',
        'find_categories',
        'find_products',
        'generate_product_content',
        'get_catalog_categorization_status',
        'get_landing_page_job_status',
        'get_order_tracking_links',
        'get_product_content_job_status',
        'inspect_archived_products',
        'inspect_assets',
        'inspect_ecotrack_shipments',
        'inspect_landing_pages',
        'inspect_order_shopping_list',
        'inspect_orders',
        'inspect_products',
        'inspect_storefront_configuration',
        'load_ecotrack_requirements',
        'manage_analytics_costs',
        'manage_analytics_day_overrides',
        'manage_assets',
        'manage_ecotrack_shipments',
        'manage_taxonomy',
        'post_orders_to_ecotrack',
        'present_admin_ui',
        'preview_ecotrack_posting',
        'preview_order_export',
        'query_ai_stats',
        'query_analytics',
        'query_orders',
        'query_products',
        'read_system_guidance',
        'receive_inventory',
        'reorder_assets',
        'restore_products',
        'save_order_shopping_list',
        'scan_inventory',
        'set_landing_page_active',
        'start_landing_page_work',
        'start_order_export',
        'sync_analytics_source',
        'update_analytics_settings',
        'update_inventory_state',
        'update_order_details',
        'update_order_status',
        'update_products',
        'update_storefront_announcement',
        'update_storefront_settings',
      ].sort(),
    );
    expect(tools).not.toHaveProperty('inspect_bulletin');
    expect(tools).not.toHaveProperty('inspect_administration');
    expect(tools).not.toHaveProperty('list_background_jobs');
    expect(tools).not.toHaveProperty('create_landing_page');
  });

  it('constructs the tool surface directly from permissions', () => {
    expect(
      Object.keys(
        buildAdminAiTools({
          permissions: ['settings_manage'],
          locale: 'fr',
          runtime: { kind: 'evaluation' },
        }),
      ).sort(),
    ).toEqual(
      [
        'inspect_storefront_configuration',
        'present_admin_ui',
        'read_system_guidance',
        'update_storefront_announcement',
        'update_storefront_settings',
      ].sort(),
    );
    expect(
      buildAdminAiTools({ permissions: [], locale: 'en', runtime: { kind: 'evaluation' } }),
    ).toEqual({});
  });

  it('keeps the same mutation schema and description while replacing only its effect in evals', async () => {
    const tools = buildAdminAiTools({
      permissions: ['products_write'],
      locale: 'en',
      runtime: { kind: 'evaluation' },
    });
    const input = { title: 'Evaluation drill', price: 12_345 };
    const createProduct = tools.create_product as {
      description: string;
      execute: (value: unknown) => Promise<unknown> | unknown;
    };

    expect(createProduct.description).toContain('Create one product');
    await expect(createProduct.execute(input)).resolves.toEqual({
      kind: 'evaluation_noop',
      applied: false,
      reason: 'Read-only evaluation: no application state was changed.',
      receivedInput: input,
    });
  });
});
