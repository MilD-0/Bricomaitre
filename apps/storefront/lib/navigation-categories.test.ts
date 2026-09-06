import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('fetchNavigationMeta', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('shares one successful catalog metadata request across navigation consumers', async () => {
    const payload = {
      categories: [{ id: 1, name: 'Outils', nameAr: 'أدوات', slug: 'outils', parentId: null }],
      brands: [{ id: 2, name: 'Wadfow', slug: 'wadfow' }],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchNavigationMeta } = await import('./navigation-categories');

    const [desktop, mobile] = await Promise.all([fetchNavigationMeta(), fetchNavigationMeta()]);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(desktop).toEqual(payload);
    expect(mobile).toEqual(payload);
  });

  it('keeps category navigation when a full catalog has more than 128 brands', async () => {
    const payload = {
      categories: [{ id: 1, name: 'Outils', nameAr: null, slug: 'outils', parentId: null }],
      brands: Array.from({ length: 1562 }, (_, index) => ({
        id: index + 1,
        name: `Brand ${index}`,
        slug: null,
      })),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))));
    const { fetchNavigationMeta } = await import('./navigation-categories');
    expect(await fetchNavigationMeta()).toEqual(payload);
  });

  it.each([503, 200])('does not permanently cache a bad metadata response (%s)', async (status) => {
    const payload = { categories: [], brands: [{ id: 1, name: 'Brand', slug: null }] };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response('{}', { status }))
        .mockResolvedValueOnce(new Response(JSON.stringify(payload))),
    );
    const { fetchNavigationMeta } = await import('./navigation-categories');
    await expect(fetchNavigationMeta()).rejects.toThrow();
    expect(await fetchNavigationMeta()).toEqual(payload);
  });

  it('clears a failed request so a later navigation can retry', async () => {
    const payload = { categories: [], brands: [{ id: 2, name: 'Wadfow', slug: 'wadfow' }] };
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchNavigationMeta } = await import('./navigation-categories');

    await expect(fetchNavigationMeta()).rejects.toThrow('offline');
    await expect(fetchNavigationMeta()).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
