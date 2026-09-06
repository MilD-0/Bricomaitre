import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const getCatalogMeta = vi.hoisted(() => vi.fn());
vi.mock('@/lib/storefront-api', () => ({ getStorefrontCatalogMeta: getCatalogMeta }));

describe('GET /api/catalog/meta', () => {
  beforeEach(() => getCatalogMeta.mockReset());

  it('returns every active category and brand for progressive navigation menus', async () => {
    getCatalogMeta.mockResolvedValue({
      brands: Array.from({ length: 22 }, (_, index) => ({
        id: index + 40,
        name: `Brand ${index + 1}`,
        slug: `brand-${index + 1}`,
      })),
      categories: [
        { id: 1, name: 'Hidden', nameAr: null, parentId: null, featured: false },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: index + 2,
          name: `Category ${index + 1}`,
          nameAr: `صنف ${index + 1}`,
          slug: `category-${index + 1}`,
          parentId: index === 0 ? 1 : null,
          featured: index % 2 === 0,
        })),
      ],
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      categories: [
        { id: 1, name: 'Hidden', nameAr: null, slug: undefined, parentId: null },
        ...Array.from({ length: 6 }, (_, index) => ({
          id: index + 2,
          name: `Category ${index + 1}`,
          nameAr: `صنف ${index + 1}`,
          slug: `category-${index + 1}`,
          parentId: index === 0 ? 1 : null,
        })),
      ],
      brands: Array.from({ length: 22 }, (_, index) => ({
        id: index + 40,
        name: `Brand ${index + 1}`,
        slug: `brand-${index + 1}`,
      })),
    });
  });

  it('lets a later navigation retry after an upstream outage', async () => {
    const payload = {
      categories: [{ id: 1, name: 'Outils', nameAr: null, slug: 'outils', parentId: null }],
      brands: [],
    };
    getCatalogMeta.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(payload);
    const responses: Response[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const response = await GET();
        responses.push(response);
        return response;
      }),
    );
    try {
      const { fetchNavigationMeta } = await import('@/lib/navigation-categories');
      await expect(fetchNavigationMeta()).rejects.toThrow('Navigation metadata unavailable');
      expect(responses[0]?.status).toBe(503);
      await expect(fetchNavigationMeta()).resolves.toEqual(payload);
      expect(getCatalogMeta).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
