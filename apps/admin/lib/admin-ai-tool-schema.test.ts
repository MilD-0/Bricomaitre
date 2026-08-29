import { zodSchema } from 'ai';
import { describe, expect, it } from 'vitest';

import { adminAiStatsQuerySchema } from './admin-ai-ai-stats';
import {
  adminAiAnalyticsCostsMutationSchema,
  adminAiAnalyticsDayOverridesMutationSchema,
  adminAiAnalyticsSettingsPatchSchema,
  adminAiAnalyticsSyncSchema,
} from './admin-ai-analytics-actions';
import {
  adminAiAssetCrudSchema,
  adminAiAssetInspectionSchema,
  adminAiAssetReorderSchema,
} from './admin-ai-assets';
import {
  adminAiArchivedCatalogProductInspectionSchema,
  adminAiCatalogProductInspectionSchema,
  adminAiCatalogProductLookupSchema,
} from './admin-ai-catalog';
import {
  adminAiBrandQuerySchema,
  adminAiCatalogQuerySchema,
  adminAiCategoryQuerySchema,
} from './admin-ai-catalog-query';
import {
  adminAiEcotrackShipmentActionSchema,
  adminAiEcotrackShipmentChangeSchema,
  adminAiEcotrackShipmentInspectionSchema,
} from './admin-ai-ecotrack-shipments';
import {
  adminAiEcotrackPostingPreviewSchema,
  adminAiEcotrackPostingStartSchema,
  adminAiEcotrackRequirementsSchema,
} from './admin-ai-ecotrack';
import {
  adminAiInventoryAdjustmentSchema,
  adminAiInventoryReceiptSchema,
  adminAiInventoryScanSchema,
  adminAiInventoryStateSchema,
} from './admin-ai-inventory';
import {
  adminAiLandingPageJobStatusSchema,
  adminAiLandingPageWorkSchema,
} from './admin-ai-landing-page-jobs';
import {
  adminAiLandingPageInspectionSchema,
  adminAiLandingPagePublicationSchema,
} from './admin-ai-landing-pages';
import { adminAiOrderExportScopeSchema } from './admin-ai-order-exports';
import { adminAiOrderInspectionSchema, adminAiOrderQuerySchema } from './admin-ai-order-query';
import { adminAiOrderTrackingLinksSchema } from './admin-ai-order-tracking';
import {
  adminAiOrderCreateSchema,
  adminAiOrderDeleteSchema,
  adminAiOrderDetailsToolSchema,
  adminAiOrderStatusMutationSchema,
} from './admin-ai-orders';
import { adminAiPresentationPlanSchema } from './admin-ai-presentation';
import {
  adminAiCatalogCategorizationSchema,
  adminAiProductContentGenerationSchema,
  adminAiProductJobStatusSchema,
} from './admin-ai-product-jobs';
import {
  adminAiProductArchiveSchema,
  adminAiProductRestoreSchema,
  adminAiProductUpdateSchema,
} from './admin-ai-products';
import { adminAiGuidanceRequestSchema } from './admin-ai-runtime';
import {
  adminAiShoppingListApplySchema,
  adminAiShoppingListInspectionSchema,
  adminAiShoppingListScopeSchema,
} from './admin-ai-shopping-list';
import {
  storefrontAnnouncementMutationSchema,
  storefrontSettingsToolSchema,
} from './admin-ai-storefront';
import { adminAiTaxonomyMutationSchema } from './admin-ai-taxonomy';
import { adminAiAnalyticsQuerySchema } from './ai-analytics';
import { productPayloadSchema } from './products';

describe('Admin AI production tool schemas', () => {
  it('serializes the live tool inputs to provider-compatible JSON Schema', () => {
    for (const schema of [
      adminAiGuidanceRequestSchema,
      adminAiCatalogProductLookupSchema,
      adminAiBrandQuerySchema,
      adminAiCategoryQuerySchema,
      adminAiCatalogQuerySchema,
      adminAiCatalogProductInspectionSchema,
      adminAiArchivedCatalogProductInspectionSchema,
      productPayloadSchema,
      adminAiProductUpdateSchema,
      adminAiProductArchiveSchema,
      adminAiProductRestoreSchema,
      adminAiInventoryAdjustmentSchema,
      adminAiInventoryScanSchema,
      adminAiInventoryReceiptSchema,
      adminAiInventoryStateSchema,
      adminAiProductContentGenerationSchema,
      adminAiProductJobStatusSchema,
      adminAiCatalogCategorizationSchema,
      adminAiTaxonomyMutationSchema,
      adminAiAssetInspectionSchema,
      adminAiAssetCrudSchema,
      adminAiAssetReorderSchema,
      adminAiLandingPageInspectionSchema,
      adminAiLandingPageWorkSchema,
      adminAiLandingPagePublicationSchema,
      adminAiLandingPageJobStatusSchema,
      adminAiOrderQuerySchema,
      adminAiOrderInspectionSchema,
      adminAiEcotrackShipmentInspectionSchema,
      adminAiShoppingListInspectionSchema,
      adminAiShoppingListScopeSchema,
      adminAiShoppingListApplySchema,
      adminAiOrderTrackingLinksSchema,
      adminAiOrderExportScopeSchema,
      adminAiOrderCreateSchema,
      adminAiOrderStatusMutationSchema,
      adminAiOrderDetailsToolSchema,
      adminAiOrderDeleteSchema,
      adminAiEcotrackRequirementsSchema,
      adminAiEcotrackPostingPreviewSchema,
      adminAiEcotrackPostingStartSchema,
      adminAiEcotrackShipmentActionSchema,
      adminAiEcotrackShipmentChangeSchema,
      adminAiAnalyticsQuerySchema,
      adminAiStatsQuerySchema,
      adminAiAnalyticsSettingsPatchSchema,
      adminAiAnalyticsCostsMutationSchema,
      adminAiAnalyticsDayOverridesMutationSchema,
      adminAiAnalyticsSyncSchema,
      storefrontSettingsToolSchema,
      storefrontAnnouncementMutationSchema,
      adminAiPresentationPlanSchema.omit({ kind: true }),
    ]) {
      const serialized = JSON.stringify(zodSchema(schema).jsonSchema);
      expect(serialized).not.toMatch(/\(\?[=!<]/u);
    }
  });

  it('tells the model that inventory quantity is a delta rather than a final level', () => {
    const jsonSchema = zodSchema(adminAiInventoryAdjustmentSchema).jsonSchema as {
      properties: {
        items: { items: { properties: { quantity: { description?: string } } } };
      };
    };

    expect(jsonSchema.properties.items.items.properties.quantity.description).toContain('delta');
    expect(jsonSchema.properties.items.items.properties.quantity.description).toContain('never');
  });
});
