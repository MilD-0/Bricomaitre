import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ revalidateTag: vi.fn() }));

vi.mock('next/cache', () => ({
  revalidateTag: mocks.revalidateTag,
}));

import { revalidateServerTags } from './server-cache';

describe('server cache', () => {
  beforeEach(() => {
    mocks.revalidateTag.mockReset();
  });

  it('deduplicates tags during invalidation', () => {
    revalidateServerTags('products', 'assets', 'products');

    expect(mocks.revalidateTag.mock.calls).toEqual([
      ['products', { expire: 0 }],
      ['assets', { expire: 0 }],
    ]);
  });
});
