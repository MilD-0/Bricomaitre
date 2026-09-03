import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontProductBuildFeedMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontProductBuildFeedMock: vi.fn(),
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
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
}));

describe('app/storefront/products/build-feed/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontProductBuildFeedMock.mockReset();
  });

  it('returns an unavailable response when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Storefront database is unavailable.',
    });
  });

  it('returns the minimal product build feed', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontProductBuildFeedMock.mockResolvedValue([
      { id: 10, slug: 'impact-driver', updatedAt: '2026-04-06T00:00:00.000Z' },
    ]);

    const response = await GET();

    expect(readStorefrontProductBuildFeedMock).toHaveBeenCalledWith({ tag: 'db' });
    await expect(response.json()).resolves.toEqual({
      items: [{ id: 10, slug: 'impact-driver', updatedAt: '2026-04-06T00:00:00.000Z' }],
    });
  });
});
