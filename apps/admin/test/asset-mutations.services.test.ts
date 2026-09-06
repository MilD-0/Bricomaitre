import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  assetBanners,
  brands,
  categories,
  featuredProductGroups,
  featuredProductGroupProducts,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  productCards,
  products,
} from '@bric/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { ActionHistoryEntityNotFoundError } from '../lib/action-history-state';
import {
  createAdminAsset,
  replaceAdminAsset,
  deleteAdminAsset,
  updateAdminAssetStates,
} from '../lib/asset-mutations';

afterAll(async () => {
  await getPool().end();
});

it('persists all asset kinds and featured selections, rolls back a failed state batch, and deletes with recovery history', async () => {
  const db = getDb();
  const marker = randomUUID();
  const actor = { email: `assets-${marker}@example.invalid` };
  const [product] = await db
    .insert(products)
    .values({ title: 'Asset product', slug: marker, price: '100' })
    .returning();
  const [brand] = await db.insert(brands).values({ name: marker, slug: marker }).returning();
  const [category] = await db.insert(categories).values({ name: marker, slug: marker }).returning();
  const banner = await createAdminAsset(
    db,
    'banner',
    {
      title: 'Banner',
      titleAr: 'لافتة',
      imageUrlLandscape: 'https://cdn.example.com/wide.jpg',
      imageUrlPortrait: 'https://cdn.example.com/tall.jpg',
      productId: product!.id,
    },
    actor,
  );
  const groupPayload = {
    name: 'Group',
    nameAr: 'مجموعة',
    productIds: [product!.id],
    brandIds: [brand!.id],
    categoryIds: [category!.id],
    prioritizeRecommendations: true,
  };
  const group = await createAdminAsset(db, 'featured-group', groupPayload, actor);
  const card = await createAdminAsset(
    db,
    'product-card',
    {
      productId: product!.id,
      titleFr: 'Carte',
      titleAr: 'بطاقة',
      descriptionFr: 'Description',
      descriptionAr: 'وصف',
      characteristicsFr: ['A', 'B', 'C'],
      characteristicsAr: ['أ', 'ب', 'ج'],
    },
    actor,
  );
  try {
    expect(
      (await db.select().from(assetBanners).where(eq(assetBanners.id, banner.id!)))[0],
    ).toMatchObject({
      productId: product!.id,
      imageUrl: 'https://cdn.example.com/wide.jpg',
    });
    expect(
      (await db.select().from(productCards).where(eq(productCards.id, card.id!)))[0],
    ).toMatchObject({ productId: product!.id, characteristicsAr: ['أ', 'ب', 'ج'] });
    expect(
      await db
        .select()
        .from(featuredProductGroupProducts)
        .where(eq(featuredProductGroupProducts.groupId, group.id!)),
    ).toMatchObject([{ productId: product!.id }]);
    expect(
      await db
        .select()
        .from(featuredProductGroupBrands)
        .where(eq(featuredProductGroupBrands.groupId, group.id!)),
    ).toMatchObject([{ brandId: brand!.id }]);
    expect(
      await db
        .select()
        .from(featuredProductGroupCategories)
        .where(eq(featuredProductGroupCategories.groupId, group.id!)),
    ).toMatchObject([{ categoryId: category!.id }]);
    const beforeFailedBatch = await db
      .select()
      .from(actionLogs)
      .where(eq(actionLogs.createdBy, actor.email));
    await expect(
      updateAdminAssetStates(
        db,
        {
          items: [
            { kind: 'banner', id: banner.id!, active: false },
            { kind: 'product-card', id: 2147483647, active: false },
          ],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ActionHistoryEntityNotFoundError);
    expect(
      (await db.select().from(assetBanners).where(eq(assetBanners.id, banner.id!)))[0]!.active,
    ).toBe(true);
    expect(await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email))).toEqual(
      beforeFailedBatch,
    );
    await expect(
      updateAdminAssetStates(
        db,
        { items: [{ kind: 'product-card', id: card.id!, prioritizeRecommendations: true }] },
        actor,
      ),
    ).rejects.toThrow('Only featured groups');
    await updateAdminAssetStates(
      db,
      {
        items: [
          { kind: 'banner', id: banner.id!, active: false },
          { kind: 'featured-group', id: group.id!, prioritizeRecommendations: false },
        ],
      },
      actor,
    );
    expect(
      (await db.select().from(assetBanners).where(eq(assetBanners.id, banner.id!)))[0]!.active,
    ).toBe(false);
    expect(
      (
        await db.select().from(featuredProductGroups).where(eq(featuredProductGroups.id, group.id!))
      )[0]!.prioritizeRecommendations,
    ).toBe(false);
    await replaceAdminAsset(
      db,
      'featured-group',
      group.id!,
      { ...groupPayload, productIds: [], categoryIds: [] },
      actor,
    );
    expect(
      await db
        .select()
        .from(featuredProductGroupProducts)
        .where(eq(featuredProductGroupProducts.groupId, group.id!)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(featuredProductGroupCategories)
        .where(eq(featuredProductGroupCategories.groupId, group.id!)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(featuredProductGroupBrands)
        .where(eq(featuredProductGroupBrands.groupId, group.id!)),
    ).toHaveLength(1);
    await deleteAdminAsset(db, 'featured-group', group.id!, actor);
    expect(
      await db.select().from(featuredProductGroups).where(eq(featuredProductGroups.id, group.id!)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(featuredProductGroupBrands)
        .where(eq(featuredProductGroupBrands.groupId, group.id!)),
    ).toEqual([]);
    expect(
      await db.select().from(actionLogs).where(eq(actionLogs.createdBy, actor.email)),
    ).toContainEqual(
      expect.objectContaining({
        operation: 'delete',
        entityType: 'featuredProductGroups',
        beforeState: expect.objectContaining({
          brandSelections: [expect.objectContaining({ brandId: brand!.id })],
        }),
      }),
    );
  } finally {
    await db.delete(assetBanners).where(eq(assetBanners.id, banner.id!));
    await db.delete(productCards).where(eq(productCards.id, card.id!));
    await db.delete(featuredProductGroups).where(eq(featuredProductGroups.id, group.id!));
    await db.delete(products).where(eq(products.id, product!.id));
    await db.delete(brands).where(eq(brands.id, brand!.id));
    await db.delete(categories).where(eq(categories.id, category!.id));
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  }
});
