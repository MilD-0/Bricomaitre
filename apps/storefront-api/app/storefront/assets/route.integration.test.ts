import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontAssetsMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontAssetsMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/assets', () => ({
  readStorefrontAssets: readStorefrontAssetsMock,
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: {
    assets: 'assets',
  },
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
}));

describe('app/storefront/assets/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontAssetsMock.mockReset();
  });

  it('returns an unavailable response when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET();

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: 'Storefront database is unavailable.' });
  });

  it('returns storefront assets from the shared service', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontAssetsMock.mockResolvedValue({
      banners: [
        {
          id: 1,
          title: 'Hero',
          titleAr: 'البطولة',
          imageUrl: 'https://cdn.example.com/banner.jpg',
          imageUrlPortrait: null,
          imageUrlLandscape: 'https://cdn.example.com/banner.jpg',
          productId: 9,
          sortOrder: 0,
          active: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      featuredGroups: [
        {
          id: 2,
          name: 'Top picks',
          nameAr: 'أفضل الاختيارات',
          cta: 'Voir Plus',
          ctaAr: 'اكتشف المزيد',
          link: '/products?featured=1',
          sortOrder: 0,
          prioritizeRecommendations: true,
          active: true,
          productIds: [9],
          brandIds: [3],
          categoryIds: [4],
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      productCards: [
        {
          id: 5,
          productId: 9,
          titleAr: 'عنوان',
          titleFr: 'Titre',
          descriptionAr: 'وصف',
          descriptionFr: 'Description',
          characteristicsAr: ['1', '2', '3'],
          characteristicsFr: ['1', '2', '3'],
          sortOrder: 0,
          active: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
    });

    const res = await GET();

    expect(readStorefrontAssetsMock).toHaveBeenCalledWith({ tag: 'db' });
    await expect(res.json()).resolves.toEqual({
      banners: [
        {
          id: 1,
          title: 'Hero',
          titleAr: 'البطولة',
          imageUrl: 'https://cdn.example.com/banner.jpg',
          imageUrlPortrait: null,
          imageUrlLandscape: 'https://cdn.example.com/banner.jpg',
          productId: 9,
          sortOrder: 0,
          active: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      featuredGroups: [
        {
          id: 2,
          name: 'Top picks',
          nameAr: 'أفضل الاختيارات',
          cta: 'Voir Plus',
          ctaAr: 'اكتشف المزيد',
          link: '/products?featured=1',
          sortOrder: 0,
          prioritizeRecommendations: true,
          active: true,
          productIds: [9],
          brandIds: [3],
          categoryIds: [4],
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
      productCards: [
        {
          id: 5,
          productId: 9,
          titleAr: 'عنوان',
          titleFr: 'Titre',
          descriptionAr: 'وصف',
          descriptionFr: 'Description',
          characteristicsAr: ['1', '2', '3'],
          characteristicsFr: ['1', '2', '3'],
          sortOrder: 0,
          active: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
    });
  });
});
