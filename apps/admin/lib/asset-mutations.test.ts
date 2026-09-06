import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), revalidate: vi.fn() }));

vi.mock('./action-history', () => ({ mutateEntityWithHistory: mocks.mutate }));
vi.mock('./storefront-revalidate', () => ({ revalidateStorefrontAssets: mocks.revalidate }));

import {
  adminAssetStateMutationSchema,
  createAdminAsset,
  deleteAdminAsset,
  replaceAdminAsset,
} from './asset-mutations';

describe('canonical asset mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutate.mockResolvedValue(undefined);
    mocks.revalidate.mockResolvedValue(undefined);
  });

  it('creates a validated banner at the next canonical position with history', async () => {
    const from = vi.fn().mockResolvedValue([{ value: 6 }]);
    const db = { select: vi.fn(() => ({ from })) };
    mocks.mutate.mockResolvedValue([{ id: 15 }]);

    await expect(
      createAdminAsset(
        db as never,
        'banner',
        {
          title: 'Atelier mobile',
          titleAr: 'ورشة متنقلة',
          imageUrlLandscape: 'https://cdn.example.com/banner-wide.jpg',
          imageUrlPortrait: 'https://cdn.example.com/banner-tall.jpg',
          productId: 12,
          active: false,
        },
        { email: 'admin@example.com' },
      ),
    ).resolves.toMatchObject({ kind: 'banner', id: 15, sortOrder: 6, data: { active: false } });
    expect(mocks.mutate).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'assetBanners',
        operation: 'create',
        actor: { email: 'admin@example.com' },
      }),
    );
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it('fully replaces and deletes exact inspected assets through canonical history', async () => {
    const db = { marker: 'database' };
    await expect(
      replaceAdminAsset(
        db as never,
        'featured-group',
        7,
        {
          name: 'Sélection atelier',
          nameAr: 'اختيار الورشة',
          cta: null,
          ctaAr: null,
          link: null,
          productIds: [12, 18],
          brandIds: [],
          categoryIds: [],
          prioritizeRecommendations: true,
          active: true,
        },
        { email: 'admin@example.com' },
      ),
    ).resolves.toMatchObject({ kind: 'featured-group', id: 7 });
    await expect(
      deleteAdminAsset(db as never, 'product-card', 9, { email: 'admin@example.com' }),
    ).resolves.toEqual({ kind: 'product-card', id: 9, deleted: true });

    expect(mocks.mutate).toHaveBeenNthCalledWith(
      1,
      db,
      expect.objectContaining({
        entityType: 'featuredProductGroups',
        entityId: 7,
        operation: 'update',
      }),
    );
    expect(mocks.mutate).toHaveBeenNthCalledWith(
      2,
      db,
      expect.objectContaining({ entityType: 'productCards', entityId: 9, operation: 'delete' }),
    );
    expect(mocks.revalidate).toHaveBeenCalledTimes(2);
  });

  it('rejects unsupported placement changes before mutation', () => {
    expect(
      adminAssetStateMutationSchema.safeParse({
        items: [{ kind: 'product-card', id: 8, prioritizeRecommendations: true }],
      }).success,
    ).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
