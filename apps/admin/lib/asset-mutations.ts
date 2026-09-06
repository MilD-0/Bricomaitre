import { asc, eq, inArray, sql } from 'drizzle-orm';
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

import {
  ActionHistoryConflictError,
  ActionHistoryEntityNotFoundError,
  mutateEntityWithHistory,
  mutateEntityWithHistoryTransaction,
  type ActionActor,
} from './action-history';
import {
  assetBannerSchema,
  assetBannerInputSchema,
  assetReorderSchema,
  featuredProductGroupSchema,
  featuredProductGroupInputSchema,
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

const assetStorage = {
  banner: { table: assetBanners, entityType: 'assetBanners' },
  'featured-group': { table: featuredProductGroups, entityType: 'featuredProductGroups' },
  'product-card': { table: productCards, entityType: 'productCards' },
} as const;

type AssetKind = z.output<typeof adminAssetKindSchema>;

function assetPayload(kind: AssetKind, state: Record<string, unknown>) {
  const shape =
    kind === 'banner'
      ? assetBannerInputSchema.shape
      : kind === 'featured-group'
        ? featuredProductGroupInputSchema.shape
        : productCardSchema.shape;
  const payload = Object.fromEntries(Object.keys(shape).map((key) => [key, state[key]]));
  if (kind === 'featured-group') {
    const groups = state as unknown as {
      productSelections: { productId: number }[];
      brandSelections: { brandId: number }[];
      categorySelections: { categoryId: number }[];
    };
    payload.productIds = groups.productSelections.map(({ productId }) => productId);
    payload.brandIds = groups.brandSelections.map(({ brandId }) => brandId);
    payload.categoryIds = groups.categorySelections.map(({ categoryId }) => categoryId);
  }
  return payload;
}

export function replaceAdminAsset(
  db: Database,
  kind: AssetKind,
  id: number,
  input: unknown,
  actor?: ActionActor,
) {
  return writeAdminAsset(db, kind, id, () => input, actor);
}

export async function patchAdminAsset(
  db: Database,
  kind: AssetKind,
  id: number,
  changes: Record<string, unknown>,
  actor?: ActionActor,
) {
  const resolvedKind = adminAssetKindSchema.parse(kind);
  const stateOnly = Object.keys(changes).every(
    (key) => key === 'active' || key === 'prioritizeRecommendations',
  );
  if (stateOnly) {
    const {
      kind: _kind,
      id: _id,
      ...values
    } = adminAssetStateItemSchema.parse({ kind, id, ...changes });
    const { table, entityType } = assetStorage[resolvedKind];
    const result = await mutateEntityWithHistory(db, {
      entityType,
      entityId: id,
      operation: 'update',
      actor,
      execute: async (tx, beforeState) => {
        const previous = assetPayload(resolvedKind, beforeState!);
        await tx
          .update(table)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(table.id, id));
        return { previous, data: { ...previous, ...values } };
      },
    });
    await revalidateStorefrontAssets();
    return { kind: resolvedKind, id, ...result };
  }
  return writeAdminAsset(
    db,
    resolvedKind,
    id,
    (previous) => {
      const merged = { ...previous, ...changes };
      return resolvedKind === 'banner'
        ? {
            ...merged,
            imageUrlLandscape: merged.imageUrlLandscape ?? previous.imageUrl,
            imageUrlPortrait: merged.imageUrlPortrait ?? previous.imageUrl,
            ...(changes.imageUrlLandscape !== undefined
              ? { imageUrl: changes.imageUrlLandscape }
              : {}),
          }
        : merged;
    },
    actor,
  );
}

async function writeAdminAsset(
  db: Database,
  kind: AssetKind,
  id: number,
  resolveInput: (previous: Record<string, unknown>) => unknown,
  actor?: ActionActor,
) {
  const resolvedKind = adminAssetKindSchema.parse(kind);
  const result = await mutateEntityWithHistory(db, {
    entityType: assetStorage[resolvedKind].entityType,
    entityId: id,
    operation: 'update',
    actor,
    execute: async (tx, beforeState) => {
      const previous = assetPayload(resolvedKind, beforeState!);
      const input = resolveInput(previous);
      if (resolvedKind === 'banner') {
        const data = assetBannerSchema.parse(input);
        await tx
          .update(assetBanners)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(assetBanners.id, id));
        return { previous, data };
      }
      if (resolvedKind === 'featured-group') {
        const data = featuredProductGroupSchema.parse(input);
        const {
          productIds: _products,
          brandIds: _brands,
          categoryIds: _categories,
          ...values
        } = data;
        await tx
          .update(featuredProductGroups)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(featuredProductGroups.id, id));
        await syncFeaturedGroupSelections(tx, id, data);
        return { previous, data };
      }
      const data = productCardSchema.parse(input);
      await tx
        .update(productCards)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(productCards.id, id));
      return { previous, data };
    },
  });
  await revalidateStorefrontAssets();
  return { kind: resolvedKind, id, ...result };
}

export async function deleteAdminAsset(
  db: Database,
  kind: z.input<typeof adminAssetKindSchema>,
  id: number,
  actor?: ActionActor,
) {
  const resolvedKind = adminAssetKindSchema.parse(kind);
  const previous = await mutateEntityWithHistory(db, {
    entityType:
      resolvedKind === 'banner'
        ? 'assetBanners'
        : resolvedKind === 'featured-group'
          ? 'featuredProductGroups'
          : 'productCards',
    entityId: id,
    operation: 'delete',
    actor,
    execute: async (tx, beforeState) => {
      const previous = assetPayload(resolvedKind, beforeState!);
      if (resolvedKind === 'banner') {
        await tx.delete(assetBanners).where(eq(assetBanners.id, id));
        return previous;
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
        return previous;
      }
      await tx.delete(productCards).where(eq(productCards.id, id));
      return previous;
    },
  });
  await revalidateStorefrontAssets();
  return { kind: resolvedKind, id, deleted: true as const, previous };
}

export async function updateAdminAssetStates(
  db: Database,
  input: z.input<typeof adminAssetStateMutationSchema>,
  actor?: ActionActor,
) {
  const { items } = adminAssetStateMutationSchema.parse(input);
  await db.transaction(async (tx) => {
    for (const item of items) {
      const values = {
        active: item.active,
        ...(item.kind === 'featured-group'
          ? { prioritizeRecommendations: item.prioritizeRecommendations }
          : {}),
        updatedAt: new Date(),
      };
      if (item.kind === 'banner') {
        await mutateEntityWithHistoryTransaction(tx, {
          entityType: 'assetBanners',
          entityId: item.id,
          operation: 'update',
          actor,
          execute: (tx) => tx.update(assetBanners).set(values).where(eq(assetBanners.id, item.id)),
        });
      } else if (item.kind === 'featured-group') {
        await mutateEntityWithHistoryTransaction(tx, {
          entityType: 'featuredProductGroups',
          entityId: item.id,
          operation: 'update',
          actor,
          execute: (tx) =>
            tx
              .update(featuredProductGroups)
              .set(values)
              .where(eq(featuredProductGroups.id, item.id)),
        });
      } else {
        await mutateEntityWithHistoryTransaction(tx, {
          entityType: 'productCards',
          entityId: item.id,
          operation: 'update',
          actor,
          execute: (tx) => tx.update(productCards).set(values).where(eq(productCards.id, item.id)),
        });
      }
    }
  });
  await revalidateStorefrontAssets();
  return { ok: true, updatedCount: items.length, items };
}

export async function reorderAdminAssets(
  db: Database,
  input: z.input<typeof assetReorderSchema>,
  actor?: ActionActor,
  requireCompleteOrder = false,
) {
  const value = assetReorderSchema.parse(input);
  const { table, entityType } = assetStorage[value.kind];
  const ids = value.items.map(({ id }) => id);
  if (new Set(ids).size !== ids.length)
    throw new ActionHistoryConflictError('Each asset ID must appear exactly once.');
  const before = await db.transaction(async (tx) => {
    const current = await tx
      .select({ id: table.id, sortOrder: table.sortOrder })
      .from(table)
      .where(requireCompleteOrder ? undefined : inArray(table.id, ids))
      .orderBy(asc(table.id))
      .for('update');
    const currentIds = new Set(current.map(({ id }) => id));
    const unknownIds = ids.filter((id) => !currentIds.has(id));
    const missingIds = requireCompleteOrder
      ? current.filter(({ id }) => !ids.includes(id)).map(({ id }) => id)
      : [];
    if (requireCompleteOrder && (missingIds.length || unknownIds.length)) {
      throw new ActionHistoryConflictError(
        `Reorder must contain every current ${value.kind} ID exactly once. Missing: ${missingIds.join(', ') || 'none'}. Unknown: ${unknownIds.join(', ') || 'none'}.`,
      );
    }
    if (unknownIds.length) throw new ActionHistoryEntityNotFoundError(entityType, unknownIds[0]!);
    for (const { id, sortOrder } of [...value.items].sort((left, right) => left.id - right.id)) {
      await mutateEntityWithHistoryTransaction(tx, {
        entityType,
        entityId: id,
        operation: 'update',
        actor,
        execute: (executor) =>
          executor.update(table).set({ sortOrder, updatedAt: new Date() }).where(eq(table.id, id)),
      });
    }
    return current
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
      .map(({ id }) => id);
  });
  await revalidateStorefrontAssets();
  return { ok: true, kind: value.kind, items: value.items, before };
}
