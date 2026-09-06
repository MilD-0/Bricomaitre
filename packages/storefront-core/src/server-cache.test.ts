import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ unstableCache: vi.fn(), revalidateTag: vi.fn() }));

vi.mock('next/cache', () => ({
  unstable_cache: mocks.unstableCache,
  revalidateTag: mocks.revalidateTag,
}));

import { createServerCache, revalidateServerTags } from './server-cache';

describe('server cache', () => {
  beforeEach(() => {
    mocks.unstableCache.mockReset();
    mocks.revalidateTag.mockReset();
  });

  it('creates a persistent tagged cache with the requested lifetime', () => {
    const cached = vi.fn();
    mocks.unstableCache.mockReturnValue(cached);
    const load = vi.fn();

    expect(
      createServerCache({
        keyParts: ['storefront-homepage'],
        revalidate: 120,
        tags: ['assets', 'products'],
        load,
      }),
    ).toBe(cached);
    expect(mocks.unstableCache).toHaveBeenCalledWith(load, ['storefront-homepage'], {
      revalidate: 120,
      tags: ['assets', 'products'],
    });
  });

  it('deduplicates tags during invalidation', () => {
    revalidateServerTags('products', 'assets', 'products');

    expect(mocks.revalidateTag.mock.calls).toEqual([
      ['products', { expire: 0 }],
      ['assets', { expire: 0 }],
    ]);
  });
});
