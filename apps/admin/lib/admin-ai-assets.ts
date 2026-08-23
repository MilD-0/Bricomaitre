import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { createAdminAsset, deleteAdminAsset, replaceAdminAsset } from './asset-mutations';
import { assetBannerSchema, featuredProductGroupSchema, productCardSchema } from './assets';
import type { ActionActor } from './action-history';

const assetCreateTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('banner'), data: assetBannerSchema }),
  z.strictObject({ kind: z.literal('featured-group'), data: featuredProductGroupSchema }),
  z.strictObject({ kind: z.literal('product-card'), data: productCardSchema }),
]);

const assetReplacementTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('banner'),
    id: z.number().int().positive(),
    data: assetBannerSchema,
  }),
  z.strictObject({
    kind: z.literal('featured-group'),
    id: z.number().int().positive(),
    data: featuredProductGroupSchema,
  }),
  z.strictObject({
    kind: z.literal('product-card'),
    id: z.number().int().positive(),
    data: productCardSchema,
  }),
]);

export const adminAiAssetCrudSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create'), asset: assetCreateTargetSchema }),
  z.strictObject({ operation: z.literal('replace'), asset: assetReplacementTargetSchema }),
  z.strictObject({
    operation: z.literal('delete'),
    asset: z.strictObject({
      kind: z.enum(['banner', 'featured-group', 'product-card']),
      id: z.number().int().positive(),
    }),
  }),
]);

export async function manageAdminAiAsset(
  rawInput: z.input<typeof adminAiAssetCrudSchema>,
  actor?: ActionActor,
) {
  const input = adminAiAssetCrudSchema.parse(rawInput);
  const db = getDb();
  if (input.operation === 'create') {
    const created = await createAdminAsset(db, input.asset.kind, input.asset.data, actor);
    return { ok: true, operation: input.operation, ...created };
  }
  if (input.operation === 'replace') {
    const replaced = await replaceAdminAsset(
      db,
      input.asset.kind,
      input.asset.id,
      input.asset.data,
      actor,
    );
    return { ok: true, operation: input.operation, ...replaced };
  }
  const deleted = await deleteAdminAsset(db, input.asset.kind, input.asset.id, actor);
  return { ok: true, operation: input.operation, ...deleted };
}
