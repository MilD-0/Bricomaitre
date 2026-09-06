import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { getDb } from '@bric/db/client';
import {
  assetBanners,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  featuredProductGroupProducts,
  featuredProductGroups,
  productCards,
} from '@bric/db/schema';

import { mutateEntityWithHistory, type ActionActor } from './action-history';
import {
  assetBannerSchema,
  assetReorderSchema,
  featuredProductGroupSchema,
  productCardSchema,
} from './assets';
import { revalidateStorefrontAssets } from './storefront-revalidate';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export const adminAssetKindSchema = z.enum(['banner', 'featured-group', 'product-card']);

async function syncFeaturedGroupSelections(
  tx: Transaction,
  groupId: number,
  value: z.output<typeof featuredProductGroupSchema>,
) {
  await Promise.all([
    tx
      .delete(featuredProductGroupProducts)
      .where(eq(featuredProductGroupProducts.groupId, groupId)),
    tx.delete(featuredProductGroupBrands).where(eq(featuredProductGroupBrands.groupId, groupId)),
    tx
      .delete(featuredProductGroupCategories)
      .where(eq(featuredProductGroupCategories.groupId, groupId)),
  ]);
  if (value.productIds.length > 0)
    await tx
      .insert(featuredProductGroupProducts)
      .values(value.productIds.map((productId) => ({ groupId, productId })));
  if (value.brandIds.length > 0)
    await tx
      .insert(featuredProductGroupBrands)
      .values(value.brandIds.map((brandId) => ({ groupId, brandId })));
  if (value.categoryIds.length > 0)
    await tx
      .insert(featuredProductGroupCategories)
      .values(value.categoryIds.map((categoryId) => ({ groupId, categoryId })));
}

async function nextAssetSortOrder(
  db: Database,
  column:
    | typeof assetBanners.sortOrder
    | typeof featuredProductGroups.sortOrder
    | typeof productCards.sortOrder,
  table: typeof assetBanners | typeof featuredProductGroups | typeof productCards,
) {
  const [row] = await db
    .select({ value: sql<number>`coalesce(max(${column}), -1) + 1` })
    .from(table);
  return row?.value ?? 0;
}

const adminAssetStateItemSchema = z
  .object({
    kind: z.enum(['banner', 'featured-group', 'product-card']),
    id: z.number().int().positive(),
    active: z.boolean().optional(),
    prioritizeRecommendations: z.boolean().optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.active === undefined && item.prioritizeRecommendations === undefined) {
      context.addIssue({ code: 'custom', message: 'Provide at least one asset state change.' });
    }
    if (item.kind !== 'featured-group' && item.prioritizeRecommendations !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['prioritizeRecommendations'],
        message: 'Only featured groups support storefront top placement.',
      });
    }
  });

export const adminAssetStateMutationSchema = z
  .object({ items: z.array(adminAssetStateItemSchema).min(1).max(50) })
  .strict();

export async function createAdminAsset(
  db: Database,
  kind: z.input<typeof adminAssetKindSchema>,
  input: unknown,
  actor?: ActionActor,
) {
  const resolvedKind = adminAssetKindSchema.parse(kind);
  if (resolvedKind === 'banner') {
    const data = assetBannerSchema.parse(input);
    const sortOrder = await nextAssetSortOrder(db, assetBanners.sortOrder, assetBanners);
    const rows = await mutateEntityWithHistory(db, {
      entityType: 'assetBanners',
      operation: 'create',
      actor,
      execute: (tx) =>
        tx
          .insert(assetBanners)
          .values({ ...data, sortOrder })
          .returning({ id: assetBanners.id }),
      resolveEntityId: (result) => result[0]?.id,
    });
    await revalidateStorefrontAssets();
    return { kind: resolvedKind, id: rows[0]?.id, sortOrder, data };
  }
  if (resolvedKind === 'featured-group') {
    const data = featuredProductGroupSchema.parse(input);
    const sortOrder = await nextAssetSortOrder(
      db,
      featuredProductGroups.sortOrder,
      featuredProductGroups,
    );
    const rows = await mutateEntityWithHistory(db, {
      entityType: 'featuredProductGroups',
      operation: 'create',
      actor,
      execute: async (tx) => {
        const result = await tx
          .insert(featuredProductGroups)
          .values({
            name: data.name,
            nameAr: data.nameAr,
            cta: data.cta,
            ctaAr: data.ctaAr,
            link: data.link,
            active: data.active,
            sortOrder,
            prioritizeRecommendations: data.prioritizeRecommendations,
          })
          .returning({ id: featuredProductGroups.id });
        const groupId = result[0]?.id;
        if (!groupId) throw new Error('Unable to create featured group.');
        await syncFeaturedGroupSelections(tx, groupId, data);
        return result;
      },
      resolveEntityId: (result) => result[0]?.id,
    });
    await revalidateStorefrontAssets();
    return { kind: resolvedKind, id: rows[0]?.id, sortOrder, data };
  }
  const data = productCardSchema.parse(input);
  const sortOrder = await nextAssetSortOrder(db, productCards.sortOrder, productCards);
  const rows = await mutateEntityWithHistory(db, {
    entityType: 'productCards',
    operation: 'create',
    actor,
    execute: (tx) =>
      tx
        .insert(productCards)
        .values({ ...data, sortOrder })
        .returning({ id: productCards.id }),
    resolveEntityId: (result) => result[0]?.id,
  });
  await revalidateStorefrontAssets();
  return { kind: resolvedKind, id: rows[0]?.id, sortOrder, data };
}

export async function replaceAdminAsset(
  db: Database,
  kind: z.input<typeof adminAssetKindSchema>,
  id: number,
  input: unknown,
  actor?: ActionActor,
) {
  const resolvedKind = adminAssetKindSchema.parse(kind);
  if (resolvedKind === 'banner') {
    const data = assetBannerSchema.parse(input);
    await mutateEntityWithHistory(db, {
      entityType: 'assetBanners',
      entityId: id,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(assetBanners)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(assetBanners.id, id)),
    });
    await revalidateStorefrontAssets();
    return { kind: resolvedKind, id, data };
  }
  if (resolvedKind === 'featured-group') {
    const data = featuredProductGroupSchema.parse(input);
    await mutateEntityWithHistory(db, {
      entityType: 'featuredProductGroups',
      entityId: id,
      operation: 'update',
      actor,
      execute: async (tx) => {
        await tx
          .update(featuredProductGroups)
          .set({
            name: data.name,
            nameAr: data.nameAr,
            cta: data.cta,
            ctaAr: data.ctaAr,
            link: data.link,
            active: data.active,
            prioritizeRecommendations: data.prioritizeRecommendations,
            updatedAt: new Date(),
          })
          .where(eq(featuredProductGroups.id, id));
        await syncFeaturedGroupSelections(tx, id, data);
      },
    });
    await revalidateStorefrontAssets();
    return { kind: resolvedKind, id, data };
  }
  const data = productCardSchema.parse(input);
  await mutateEntityWithHistory(db, {
    entityType: 'productCards',
    entityId: id,
    operation: 'update',
    actor,
    execute: (tx) =>
      tx
        .update(productCards)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(productCards.id, id)),
  });
  await revalidateStorefrontAssets();
  return { kind: resolvedKind, id, data };
}

export async function deleteAdminAsset(
  db: Database,
  kind: z.input<typeof adminAssetKindSchema>,
  id: number,
  actor?: ActionActor,
) {
  const resolvedKind = adminAssetKindSchema.parse(kind);
  await mutateEntityWithHistory(db, {
    entityType:
      resolvedKind === 'banner'
        ? 'assetBanners'
        : resolvedKind === 'featured-group'
          ? 'featuredProductGroups'
          : 'productCards',
    entityId: id,
    operation: 'delete',
    actor,
    execute: async (tx) => {
      if (resolvedKind === 'banner') {
        await tx.delete(assetBanners).where(eq(assetBanners.id, id));
        return;
      }
      if (resolvedKind === 'featured-group') {
        await Promise.all([
          tx
            .delete(featuredProductGroupProducts)
            .where(eq(featuredProductGroupProducts.groupId, id)),
          tx.delete(featuredProductGroupBrands).where(eq(featuredProductGroupBrands.groupId, id)),
          tx
            .delete(featuredProductGroupCategories)
            .where(eq(featuredProductGroupCategories.groupId, id)),
        ]);
        await tx.delete(featuredProductGroups).where(eq(featuredProductGroups.id, id));
        return;
      }
      await tx.delete(productCards).where(eq(productCards.id, id));
    },
  });
  await revalidateStorefrontAssets();
  return { kind: resolvedKind, id, deleted: true as const };
}

export async function updateAdminAssetStates(
  db: Database,
  input: z.input<typeof adminAssetStateMutationSchema>,
  actor?: ActionActor,
) {
  const { items } = adminAssetStateMutationSchema.parse(input);
  const updated = [];

  for (const item of items) {
    const values = {
      active: item.active,
      ...(item.kind === 'featured-group'
        ? { prioritizeRecommendations: item.prioritizeRecommendations }
        : {}),
      updatedAt: new Date(),
    };
    if (item.kind === 'banner') {
      await mutateEntityWithHistory(db, {
        entityType: 'assetBanners',
        entityId: item.id,
        operation: 'update',
        actor,
        execute: (tx) => tx.update(assetBanners).set(values).where(eq(assetBanners.id, item.id)),
      });
    } else if (item.kind === 'featured-group') {
      await mutateEntityWithHistory(db, {
        entityType: 'featuredProductGroups',
        entityId: item.id,
        operation: 'update',
        actor,
        execute: (tx) =>
          tx.update(featuredProductGroups).set(values).where(eq(featuredProductGroups.id, item.id)),
      });
    } else {
      await mutateEntityWithHistory(db, {
        entityType: 'productCards',
        entityId: item.id,
        operation: 'update',
        actor,
        execute: (tx) => tx.update(productCards).set(values).where(eq(productCards.id, item.id)),
      });
    }
    updated.push(item);
  }

  await revalidateStorefrontAssets();
  return { ok: true, updatedCount: updated.length, items: updated };
}

export async function reorderAdminAssets(db: Database, input: z.input<typeof assetReorderSchema>) {
  const value = assetReorderSchema.parse(input);
  const table =
    value.kind === 'banner'
      ? assetBanners
      : value.kind === 'featured-group'
        ? featuredProductGroups
        : productCards;
  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of [...value.items].sort((left, right) => left.id - right.id)) {
      const [updated] = await tx
        .update(table)
        .set({ sortOrder, updatedAt: new Date() })
        .where(eq(table.id, id))
        .returning({ id: table.id });
      if (!updated) throw new Error(`Asset ${id} was not found.`);
    }
  });
  await revalidateStorefrontAssets();
  return { ok: true, kind: value.kind, items: value.items };
}
