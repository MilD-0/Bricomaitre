import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontCategoriesMock, applyServerCacheMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontCategoriesMock: vi.fn(),
  applyServerCacheMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/catalog', () => ({
  readStorefrontCategories: readStorefrontCategoriesMock,
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: {
    productsMeta: 'products-meta',
  },
  applyServerCache: applyServerCacheMock,
}));

describe('app/storefront/categories/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontCategoriesMock.mockReset();
    applyServerCacheMock.mockReset();
  });

  it('returns an empty list when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET();

    await expect(res.json()).resolves.toEqual({ items: [] });
  });

  it('returns active categories for the storefront', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontCategoriesMock.mockResolvedValue([
      {
        id: 4,
        name: 'Lighting',
        slug: 'lighting',
        nameEn: 'Lighting',
        nameAr: 'إضاءة',
        image: null,
        parentId: null,
        properties: [],
        featured: false,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
    ]);

    const res = await GET();

    expect(applyServerCacheMock).toHaveBeenCalledWith({ stale: 300, revalidate: 3600, expire: 86400 }, 'products-meta');
    expect(readStorefrontCategoriesMock).toHaveBeenCalledWith({ tag: 'db' });
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 4,
          name: 'Lighting',
          slug: 'lighting',
          nameEn: 'Lighting',
          nameAr: 'إضاءة',
          image: null,
          parentId: null,
          properties: [],
          featured: false,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
    });
  });
});
