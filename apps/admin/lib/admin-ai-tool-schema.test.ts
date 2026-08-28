import { zodSchema } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  adminAiAccessGrantSchema,
  adminAiAccessRevocationSchema,
  adminAiRoleDefinitionSchema,
} from './admin-ai-administration';
import {
  adminAiActionHistoryInspectionSchema,
  adminAiActionHistoryRecoverySchema,
} from './admin-ai-action-history';
import { adminAiAssetCrudSchema } from './admin-ai-assets';
import {
  adminAiAnalyticsCostsMutationSchema,
  adminAiAnalyticsDayOverridesMutationSchema,
  adminAiAnalyticsSettingsPatchSchema,
  adminAiAnalyticsSyncSchema,
} from './admin-ai-analytics-actions';
import {
  adminAiBulletinDeleteSchema,
  adminAiBulletinPostSchema,
  adminAiBulletinPostUpdateSchema,
  adminAiBulletinReplySchema,
  adminAiBulletinReactionSchema,
} from './admin-ai-bulletin';
import {
  adminAiInventoryAdjustmentSchema,
  adminAiInventoryReceiptSchema,
  adminAiInventoryScanSchema,
  adminAiInventoryStateSchema,
} from './admin-ai-inventory';
import {
  adminAiEcotrackPostingPreviewSchema,
  adminAiEcotrackPostingStartSchema,
  adminAiEcotrackRequirementsSchema,
} from './admin-ai-ecotrack';
import {
  adminAiEcotrackShipmentActionSchema,
  adminAiEcotrackShipmentChangeSchema,
  adminAiEcotrackShipmentInspectionSchema,
} from './admin-ai-ecotrack-shipments';
import {
  adminAiLandingPageCreateSchema,
  adminAiLandingPageEditSchema,
} from './admin-ai-landing-pages';
import {
  adminAiOrderCreateSchema,
  adminAiOrderDeleteSchema,
  adminAiOrderDetailsMutationSchema,
  adminAiOrderDetailsToolSchema,
  adminAiOrderStatusMutationSchema,
} from './admin-ai-orders';
import {
  adminAiArchivedProductInspectionSchema,
  adminAiProductArchiveSchema,
  adminAiProductCreateSchema,
  adminAiProductRestoreSchema,
  adminAiProductUpdateSchema,
} from './admin-ai-products';
import { adminAiProposalReviewSchema } from './admin-ai-proposal-review';
import {
  storefrontAnnouncementMutationSchema,
  storefrontSettingsToolSchema,
} from './admin-ai-storefront';
import { adminAiTaxonomyMutationSchema } from './admin-ai-taxonomy';
import {
  adminAiShoppingListApplySchema,
  adminAiShoppingListScopeSchema,
} from './admin-ai-shopping-list';
import { adminAiOrderExportScopeSchema } from './admin-ai-order-exports';
import { adminAiOrderTrackingLinksSchema } from './admin-ai-order-tracking';
import { adminAiInventoryInspectionSchema } from './admin-ai-domain';
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
import { adminAssetStateMutationSchema } from './asset-mutations';

describe('Admin AI production tool schemas', () => {
  it('serializes production mutations to provider-compatible JSON Schema', () => {
    for (const schema of [
      adminAiOrderStatusMutationSchema,
      adminAiOrderCreateSchema,
      adminAiOrderDeleteSchema,
      adminAiOrderDetailsMutationSchema,
      adminAiOrderDetailsToolSchema,
      adminAiShoppingListScopeSchema,
      adminAiShoppingListApplySchema,
      adminAiOrderExportScopeSchema,
      adminAiOrderTrackingLinksSchema,
      adminAiEcotrackPostingPreviewSchema,
      adminAiEcotrackPostingStartSchema,
      adminAiEcotrackRequirementsSchema,
      adminAiEcotrackShipmentInspectionSchema,
      adminAiEcotrackShipmentActionSchema,
      adminAiEcotrackShipmentChangeSchema,
      adminAiInventoryAdjustmentSchema,
      adminAiInventoryInspectionSchema,
      adminAiCatalogProductLookupSchema,
      adminAiCatalogProductInspectionSchema,
      adminAiArchivedCatalogProductInspectionSchema,
      adminAiCatalogQuerySchema,
      adminAiBrandQuerySchema,
      adminAiCategoryQuerySchema,
      adminAiAnalyticsSettingsPatchSchema,
      adminAiAnalyticsCostsMutationSchema,
      adminAiAnalyticsDayOverridesMutationSchema,
      adminAiAnalyticsSyncSchema,
      adminAiInventoryScanSchema,
      adminAiInventoryReceiptSchema,
      adminAiInventoryStateSchema,
      adminAiLandingPageCreateSchema,
      adminAiLandingPageEditSchema,
      adminAssetStateMutationSchema,
      adminAiAssetCrudSchema,
      adminAiProposalReviewSchema,
      adminAiAccessGrantSchema,
      adminAiAccessRevocationSchema,
      adminAiRoleDefinitionSchema,
      adminAiActionHistoryInspectionSchema,
      adminAiActionHistoryRecoverySchema,
      storefrontAnnouncementMutationSchema,
      adminAiBulletinPostSchema,
      adminAiBulletinReplySchema,
      adminAiBulletinReactionSchema,
      adminAiBulletinPostUpdateSchema,
      adminAiBulletinDeleteSchema,
      adminAiProductCreateSchema,
      adminAiProductUpdateSchema,
      adminAiProductArchiveSchema,
      adminAiArchivedProductInspectionSchema,
      adminAiProductRestoreSchema,
      adminAiTaxonomyMutationSchema,
      storefrontSettingsToolSchema,
    ]) {
      const serialized = JSON.stringify(zodSchema(schema).jsonSchema);
      expect(serialized).not.toContain('(?');
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
