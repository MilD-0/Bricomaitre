import { beforeEach, describe, expect, it, vi } from 'vitest';

const { unstableCacheMock, revalidateTagMock } = vi.hoisted(() => ({
  unstableCacheMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_cache: unstableCacheMock,
  revalidateTag: revalidateTagMock,
}));

import { createServerCache, revalidateServerTags } from './server-cache';

describe('server-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a persistent tagged cache', () => {
    const cached = vi.fn();
    const load = vi.fn();
    unstableCacheMock.mockReturnValue(cached);
    expect(
      createServerCache({ keyParts: ['products'], revalidate: 300, tags: ['products'], load }),
    ).toBe(cached);
    expect(unstableCacheMock).toHaveBeenCalledWith(load, ['products'], {
      revalidate: 300,
      tags: ['products'],
    });
  });

  it('expires unique tags before the next read', () => {
    revalidateServerTags('products', 'stats', 'products');

    expect(revalidateTagMock).toHaveBeenCalledTimes(2);
    expect(revalidateTagMock).toHaveBeenNthCalledWith(1, 'products', { expire: 0 });
    expect(revalidateTagMock).toHaveBeenNthCalledWith(2, 'stats', { expire: 0 });
  });
});
