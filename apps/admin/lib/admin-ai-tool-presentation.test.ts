import { describe, expect, it } from 'vitest';

import {
  ADMIN_AI_PRESENTED_TOOL_NAMES,
  adminAiToolPresentation,
} from './admin-ai-tool-presentation';

describe('admin assistant tool presentation', () => {
  it('gives every non-analytics assistant tool a specific human result label', () => {
    const toolNames = [
      'find_products',
      'inspect_products',
      'update_products',
      'find_brands',
      'find_categories',
      'inspect_orders',
      'update_order_status',
      'update_order_details',
      'inspect_inventory',
      'adjust_inventory',
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
      'update_bulletin_post',
      'delete_bulletin_content',
      'inspect_administration',
      'set_access_grant',
      'set_role_definition',
      'inspect_storefront_configuration',
      'update_storefront_settings',
      'update_storefront_announcement',
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
    }
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

  it('links assets and administration results to their exact owning workspace', () => {
    expect(
      adminAiToolPresentation('manage_assets', { kind: 'featured-group', id: 8 }, 'fr').href,
    ).toBe('/fr/assets/featured-groups');
    expect(adminAiToolPresentation('set_access_grant', {}, 'en').href).toBe(
      '/en/administration/users',
    );
    expect(adminAiToolPresentation('set_role_definition', {}, 'en').href).toBe(
      '/en/administration/roles',
    );
  });

  it('keeps unknown future tools readable without inventing a destination', () => {
    expect(adminAiToolPresentation('future_tool', { id: 1 }, 'en')).toEqual({
      labelKey: 'result',
    });
  });
});
