import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import { actionLogs, assetBanners } from '@bric/db/schema';
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
  } finally {
    await db
      .delete(actionLogs)
      .where(and(eq(actionLogs.entityType, 'assetBanners'), eq(actionLogs.entityId, banner!.id)));
    await db.delete(assetBanners).where(eq(assetBanners.id, banner!.id));
  }
});
