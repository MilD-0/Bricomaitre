import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import { actionLogs, assetBanners, featuredProductGroups } from '@bric/db/schema';
import { ActionHistoryEntityNotFoundError } from '../lib/action-history';
import { deleteAdminAsset, updateAdminAssetStates } from '../lib/asset-mutations';
import { revalidateStorefrontAssets } from '../lib/storefront-revalidate';

vi.mock('../lib/storefront-revalidate', () => ({ revalidateStorefrontAssets: vi.fn() }));
afterAll(async () => {
  await getPool().end();
});

it('rolls back a mixed existing/missing asset batch and records no nonexistent deletion', async () => {
  const db = getDb();
  const [banner] = await db
    .insert(assetBanners)
    .values({
      title: randomUUID(),
      titleAr: 'اختبار',
      imageUrl: 'https://cdn.example.com/test.jpg',
      active: true,
    })
    .returning();
  const missingId = -12345;
  const [removed] = await db
    .insert(assetBanners)
    .values({
      title: randomUUID(),
      titleAr: 'اختبار',
      imageUrl: 'https://cdn.example.com/test.jpg',
    })
    .returning();
  await db.delete(assetBanners).where(eq(assetBanners.id, removed!.id));
  const [group] = await db
    .insert(featuredProductGroups)
    .values({ name: randomUUID(), active: false })
    .returning();
  try {
    await expect(
      updateAdminAssetStates(db, {
        items: [
          { kind: 'banner', id: banner!.id, active: false },
          { kind: 'banner', id: removed!.id, active: false },
        ],
      }),
    ).rejects.toBeInstanceOf(ActionHistoryEntityNotFoundError);
    expect(
      (await db.query.assetBanners.findFirst({ where: eq(assetBanners.id, banner!.id) }))?.active,
    ).toBe(true);
    expect(
      await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'assetBanners'), eq(actionLogs.entityId, banner!.id))),
    ).toHaveLength(0);
    await expect(deleteAdminAsset(db, 'banner', missingId)).rejects.toBeInstanceOf(
      ActionHistoryEntityNotFoundError,
    );
    expect(
      await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'assetBanners'), eq(actionLogs.entityId, missingId))),
    ).toHaveLength(0);
    expect(revalidateStorefrontAssets).not.toHaveBeenCalled();
    await expect(
      updateAdminAssetStates(db, {
        items: [
          { kind: 'banner', id: banner!.id, active: false },
          { kind: 'featured-group', id: group!.id, active: true, prioritizeRecommendations: true },
        ],
      }),
    ).resolves.toMatchObject({ ok: true, updatedCount: 2 });
    expect(
      (await db.query.assetBanners.findFirst({ where: eq(assetBanners.id, banner!.id) }))?.active,
    ).toBe(false);
    expect(
      await db.query.featuredProductGroups.findFirst({
        where: eq(featuredProductGroups.id, group!.id),
      }),
    ).toMatchObject({ active: true, prioritizeRecommendations: true });
    expect(
      await db
        .select()
        .from(actionLogs)
        .where(and(eq(actionLogs.entityType, 'assetBanners'), eq(actionLogs.entityId, banner!.id))),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(actionLogs)
        .where(
          and(
            eq(actionLogs.entityType, 'featuredProductGroups'),
            eq(actionLogs.entityId, group!.id),
          ),
        ),
    ).toHaveLength(1);
    expect(revalidateStorefrontAssets).toHaveBeenCalledOnce();
  } finally {
    await db
      .delete(actionLogs)
      .where(
        and(eq(actionLogs.entityType, 'featuredProductGroups'), eq(actionLogs.entityId, group!.id)),
      );
    await db.delete(featuredProductGroups).where(eq(featuredProductGroups.id, group!.id));
    await db
      .delete(actionLogs)
      .where(and(eq(actionLogs.entityType, 'assetBanners'), eq(actionLogs.entityId, banner!.id)));
    await db.delete(assetBanners).where(eq(assetBanners.id, banner!.id));
  }
});
