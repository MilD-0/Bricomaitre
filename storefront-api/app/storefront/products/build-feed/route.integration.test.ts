import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontProductBuildFeedMock, applyServerCacheMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontProductBuildFeedMock: vi.fn(),
  applyServerCacheMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/catalog', () => ({
  readStorefrontProductBuildFeed: readStorefrontProductBuildFeedMock,
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: {
    products: 'products',
  },
  applyServerCache: applyServerCacheMock,
}));

describe('app/storefront/products/build-feed/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontProductBuildFeedMock.mockReset();
    applyServerCacheMock.mockReset();
  });

  it('returns an empty build feed when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });
  });

  it('returns the minimal product build feed', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontProductBuildFeedMock.mockResolvedValue([
      { id: 10, slug: 'impact-driver', updatedAt: '2026-04-06T00:00:00.000Z' },
    ]);

    const response = await GET();

    expect(applyServerCacheMock).toHaveBeenCalledWith({ stale: 60, revalidate: 300, expire: 3600 }, 'products');
    expect(readStorefrontProductBuildFeedMock).toHaveBeenCalledWith({ tag: 'db' });
    await expect(response.json()).resolves.toEqual({
      items: [{ id: 10, slug: 'impact-driver', updatedAt: '2026-04-06T00:00:00.000Z' }],
    });
  });
});
