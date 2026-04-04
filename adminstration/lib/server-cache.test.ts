import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cacheLifeMock, cacheTagMock, revalidateTagMock } = vi.hoisted(() => ({
  cacheLifeMock: vi.fn(),
  cacheTagMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
  revalidateTag: revalidateTagMock,
}));

import { applyServerCache, revalidateServerTags } from './server-cache';

describe('server-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies cache life and tags when the runtime is available', () => {
    const profile = { stale: 60, revalidate: 300, expire: 3600 } as const;
    applyServerCache(profile, 'products', 'products-meta');

    expect(cacheLifeMock).toHaveBeenCalledWith(profile);
    expect(cacheTagMock).toHaveBeenCalledWith('products', 'products-meta');
  });

  it('swallows runtime errors when cache helpers are unavailable', () => {
    cacheLifeMock.mockImplementation(() => {
      throw new Error('outside next runtime');
    });

    expect(() => applyServerCache({ stale: 60, revalidate: 300, expire: 3600 }, 'products')).not.toThrow();
    expect(cacheTagMock).not.toHaveBeenCalled();
  });

  it('revalidates unique tags using the max profile', () => {
    revalidateServerTags('products', 'stats', 'products');

    expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    expect(revalidateTagMock).toHaveBeenNthCalledWith(1, 'products', 'max');
    expect(revalidateTagMock).toHaveBeenNthCalledWith(2, 'stats', 'max');
  });
});
