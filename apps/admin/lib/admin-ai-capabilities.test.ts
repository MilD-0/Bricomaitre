import { describe, expect, it } from 'vitest';

import {
  adminAiCapabilityInstructions,
  capabilitiesForAdminAi,
  suggestionKeysForAdminAi,
} from './admin-ai-capabilities';
import { resolveAdminAiSurfaceContext } from './admin-ai-context';

describe('admin AI capability registry', () => {
  it('shows only permission-backed capabilities for the current surface', () => {
    const context = resolveAdminAiSurfaceContext('/en/stats/website');
    expect(capabilitiesForAdminAi(context, []).map((item) => item.id)).toEqual(['surface_help']);
    expect(capabilitiesForAdminAi(context, ['analytics_manage']).map((item) => item.id)).toEqual([
      'surface_help',
      'analytics_workspace',
      'background_work',
    ]);
    expect(suggestionKeysForAdminAi(context, ['analytics_manage'])).toEqual([
      'summarizeCurrentAnalytics',
      'explainAnalyticsChange',
    ]);
  });

  it('describes canonical read coverage without crossing domain permissions', () => {
    const orderContext = resolveAdminAiSurfaceContext('/en/orders');
    expect(capabilitiesForAdminAi(orderContext, ['orders_write']).map((item) => item.id)).toEqual(
      expect.arrayContaining(['catalog_lookup', 'order_inspection', 'background_work']),
    );
    expect(capabilitiesForAdminAi(orderContext, [])).toEqual([
      expect.objectContaining({ id: 'surface_help' }),
    ]);
    expect(suggestionKeysForAdminAi(orderContext, [])).toEqual(['helpCurrentSurface']);
    expect(suggestionKeysForAdminAi(orderContext, ['orders_write'])).toEqual([
      'inspectSelectedOrders',
      'helpCurrentSurface',
    ]);

    const bulletinContext = resolveAdminAiSurfaceContext('/en/bulletin');
    expect(capabilitiesForAdminAi(bulletinContext, []).map((item) => item.id)).toEqual([
      'surface_help',
      'bulletin_inspection',
    ]);
  });

  it('does not advertise background jobs to settings-only administrators', () => {
    const context = resolveAdminAiSurfaceContext('/en/administration');
    expect(suggestionKeysForAdminAi(context, ['settings_manage'])).toEqual([
      'inspectAdministration',
      'helpCurrentSurface',
    ]);
    expect(suggestionKeysForAdminAi(context, ['settings_manage', 'ops_view'])).toEqual([
      'inspectAdministration',
      'inspectBackgroundWork',
      'helpCurrentSurface',
    ]);
  });

  it('offers complete storefront configuration operations on the storefront administration view', () => {
    const context = resolveAdminAiSurfaceContext('/en/administration/storefront');
    expect(capabilitiesForAdminAi(context, ['settings_manage']).map((item) => item.id)).toEqual(
      expect.arrayContaining(['administration_inspection', 'storefront_configuration']),
    );
    expect(suggestionKeysForAdminAi(context, ['settings_manage'])).toEqual([
      'inspectStorefrontConfiguration',
      'inspectAdministration',
      'helpCurrentSurface',
    ]);
  });

  it('offers a native Bulletin summary instead of generic surface help alone', () => {
    const context = resolveAdminAiSurfaceContext('/en/bulletin');
    expect(suggestionKeysForAdminAi(context, [])).toEqual([
      'summarizeBulletin',
      'helpCurrentSurface',
    ]);
  });

  it('uses selected product context for focused proposal suggestions', () => {
    const context = {
      ...resolveAdminAiSurfaceContext('/en/products'),
      selection: { entityType: 'product' as const, ids: [12, 18], focusedId: 12 },
    };
    expect(suggestionKeysForAdminAi(context, ['products_write'])).toEqual([
      'improveSelectedProducts',
      'auditCatalog',
      'categorizeCatalog',
    ]);
    expect(adminAiCapabilityInstructions(context, ['products_write'])).toContain(
      'product_content_proposals',
    );
    expect(adminAiCapabilityInstructions(context, [])).not.toContain('product_content_proposals');
  });
});
