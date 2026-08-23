import { zodSchema } from 'ai';
import { describe, expect, it } from 'vitest';

import { adminAiAccessGrantSchema, adminAiRoleDefinitionSchema } from './admin-ai-administration';
import { adminAiAssetCrudSchema } from './admin-ai-assets';
import {
  adminAiBulletinDeleteSchema,
  adminAiBulletinPostSchema,
  adminAiBulletinPostUpdateSchema,
  adminAiBulletinReplySchema,
} from './admin-ai-bulletin';
import { adminAiInventoryAdjustmentSchema } from './admin-ai-inventory';
import {
  adminAiLandingPageCreateSchema,
  adminAiLandingPageEditSchema,
} from './admin-ai-landing-pages';
import {
  adminAiOrderDetailsMutationSchema,
  adminAiOrderStatusMutationSchema,
} from './admin-ai-orders';
import {
  adminAiProductArchiveSchema,
  adminAiProductCreateSchema,
  adminAiProductUpdateSchema,
} from './admin-ai-products';
import { adminAiProposalReviewSchema } from './admin-ai-proposal-review';
import {
  storefrontAnnouncementMutationSchema,
  storefrontSettingsPatchSchema,
} from './admin-ai-storefront';
import { adminAiTaxonomyMutationSchema } from './admin-ai-taxonomy';
import { adminAssetStateMutationSchema } from './asset-mutations';

describe('Admin AI production tool schemas', () => {
  it('serializes production mutations to provider-compatible JSON Schema', () => {
    for (const schema of [
      adminAiOrderStatusMutationSchema,
      adminAiOrderDetailsMutationSchema,
      adminAiInventoryAdjustmentSchema,
      adminAiLandingPageCreateSchema,
      adminAiLandingPageEditSchema,
      adminAssetStateMutationSchema,
      adminAiAssetCrudSchema,
      adminAiProposalReviewSchema,
      adminAiAccessGrantSchema,
      adminAiRoleDefinitionSchema,
      storefrontAnnouncementMutationSchema,
      adminAiBulletinPostSchema,
      adminAiBulletinReplySchema,
      adminAiBulletinPostUpdateSchema,
      adminAiBulletinDeleteSchema,
      adminAiProductCreateSchema,
      adminAiProductUpdateSchema,
      adminAiProductArchiveSchema,
      adminAiTaxonomyMutationSchema,
      storefrontSettingsPatchSchema,
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
