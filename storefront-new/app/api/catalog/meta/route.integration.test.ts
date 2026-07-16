import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const getCatalogMeta = vi.hoisted(() => vi.fn());
vi.mock('@/lib/storefront-api', () => ({ getStorefrontCatalogMeta: getCatalogMeta }));

describe('GET /api/catalog/meta', () => {
  beforeEach(() => getCatalogMeta.mockReset());

  it('returns every active category and brand for progressive navigation menus', async () => {
    getCatalogMeta.mockResolvedValue({
      brands: Array.from({ length: 22 }, (_, index) => ({ id: index + 40, name: `Brand ${index + 1}`, slug: `brand-${index + 1}` })),
      categories: [
        { id: 1, name: 'Hidden', nameAr: null, featured: false },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: index + 2,
          name: `Category ${index + 1}`,
          nameAr: `صنف ${index + 1}`,
          slug: `category-${index + 1}`,
          featured: index % 2 === 0,
        })),
      ],
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      categories: [
        { id: 1, name: 'Hidden', nameAr: null, slug: undefined },
        ...Array.from({ length: 6 }, (_, index) => ({ id: index + 2, name: `Category ${index + 1}`, nameAr: `صنف ${index + 1}`, slug: `category-${index + 1}` })),
      ],
      brands: Array.from({ length: 22 }, (_, index) => ({ id: index + 40, name: `Brand ${index + 1}`, slug: `brand-${index + 1}` })),
    });
  });

  it('degrades to an empty navigation when catalog metadata is unavailable', async () => {
    getCatalogMeta.mockResolvedValue({
      get categories() { throw new Error('unavailable'); },
    });
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ categories: [], brands: [] });
  });
});
