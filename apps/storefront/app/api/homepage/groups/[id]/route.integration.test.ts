import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { homepageFixtureResponse } from '@/test/fixtures/homepage';
import { GET } from './route';

const fetchGroup = vi.hoisted(() => vi.fn());
vi.mock('@/lib/storefront-api', () => ({
  fetchStorefrontHomepageFeaturedGroupProducts: fetchGroup,
}));

const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe('GET /api/homepage/groups/[id]', () => {
  beforeEach(() => fetchGroup.mockReset());

  it('proxies a cacheable featured group page', async () => {
    fetchGroup.mockResolvedValue({
      items: [{ ...homepageFixtureResponse.topProducts[0], id: 3 }],
      total: 18,
    });
    const response = await GET(
      new NextRequest('http://localhost/api/homepage/groups/4?page=2&limit=12'),
      context('4'),
    );
    expect(response.status).toBe(200);
    expect(fetchGroup).toHaveBeenCalledWith(4, { page: 2, limit: 12 });
    expect(response.headers.get('cache-control')).toContain('stale-while-revalidate');
  });

  it('rejects an invalid group id', async () => {
    const invalid = await GET(
      new NextRequest('http://localhost/api/homepage/groups/nope'),
      context('nope'),
    );
    expect(invalid.status).toBe(400);
  });

  it.each(['page=nope', 'page=0', 'limit=25'])(
    'rejects an invalid page query: %s',
    async (query) => {
      const invalid = await GET(
        new NextRequest(`http://localhost/api/homepage/groups/4?${query}`),
        context('4'),
      );
      expect(invalid.status).toBe(400);
      await expect(invalid.json()).resolves.toEqual({ error: 'Invalid product page query.' });
      expect(fetchGroup).not.toHaveBeenCalled();
    },
  );
});
