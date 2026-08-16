import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontBrandsMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontBrandsMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/catalog', () => ({
  readStorefrontBrands: readStorefrontBrandsMock,
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: {
    productsMeta: 'products-meta',
  },
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
}));

describe('app/storefront/brands/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontBrandsMock.mockReset();
  });

  it('returns an empty list when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const res = await GET();

    await expect(res.json()).resolves.toEqual({ items: [] });
  });

  it('returns active brands for the storefront', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontBrandsMock.mockResolvedValue([
      {
        id: 3,
        name: 'Acme',
        slug: 'acme',
        image: null,
        featured: true,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
      },
    ]);

    const res = await GET();

    expect(readStorefrontBrandsMock).toHaveBeenCalledWith({ tag: 'db' });
    await expect(res.json()).resolves.toEqual({
      items: [
        {
          id: 3,
          name: 'Acme',
          slug: 'acme',
          image: null,
          featured: true,
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-02T00:00:00.000Z',
        },
      ],
    });
  });
});
