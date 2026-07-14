import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const getCatalogMeta = vi.hoisted(() => vi.fn());
vi.mock('@/lib/storefront-api', () => ({ getStorefrontCatalogMeta: getCatalogMeta }));

describe('GET /api/catalog/meta', () => {
  beforeEach(() => getCatalogMeta.mockReset());

  it('returns only a bounded set of featured navigation categories', async () => {
    getCatalogMeta.mockResolvedValue({
      brands: [],
      categories: [
        { id: 1, name: 'Hidden', nameAr: null, featured: false },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: index + 2,
          name: `Category ${index + 1}`,
          nameAr: `صنف ${index + 1}`,
          featured: true,
        })),
      ],
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: Array.from({ length: 4 }, (_, index) => ({
        id: index + 2,
        name: `Category ${index + 1}`,
        nameAr: `صنف ${index + 1}`,
      })),
    });
  });

  it('degrades to an empty navigation when catalog metadata is unavailable', async () => {
    getCatalogMeta.mockResolvedValue({
      get categories() { throw new Error('unavailable'); },
    });
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ items: [] });
  });
});
