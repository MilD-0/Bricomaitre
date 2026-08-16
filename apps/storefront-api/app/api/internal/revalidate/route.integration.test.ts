import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { signInternalRequest } from '@bric/runtime/internal-signing';

import { POST } from './route';

const { revalidateServerTagsMock } = vi.hoisted(() => ({
  revalidateServerTagsMock: vi.fn(),
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: {
    assets: 'assets',
    products: 'products',
    productsMeta: 'products-meta',
    storefrontSettings: 'storefront-settings',
    landingPages: 'landing-pages',
  },
  revalidateServerTags: revalidateServerTagsMock,
}));

describe('app/api/internal/revalidate/route', () => {
  beforeEach(() => {
    process.env.STOREFRONT_REVALIDATE_SECRET = 'revalidate-secret';
    revalidateServerTagsMock.mockReset();
  });

  it('rejects unsigned requests', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/internal/revalidate', {
        method: 'POST',
        body: JSON.stringify({ scope: 'assets' }),
        headers: { 'content-type': 'application/json' },
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.any(String) }),
    );
  });

  it('revalidates storefront asset tags for signed requests', async () => {
    const body = JSON.stringify({ scope: 'assets' });
    const timestamp = String(Date.now());
    const signature = signInternalRequest(body, 'revalidate-secret', timestamp);

    const response = await POST(
      new NextRequest('http://localhost/api/internal/revalidate', {
        method: 'POST',
        body,
        headers: {
          'content-type': 'application/json',
          'x-revalidate-timestamp': timestamp,
          'x-revalidate-signature': signature,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateServerTagsMock).toHaveBeenCalledWith('assets');
    await expect(response.json()).resolves.toEqual({ ok: true, revalidated: ['assets'] });
  });

  it('revalidates storefront settings independently', async () => {
    const body = JSON.stringify({ scope: 'settings' });
    const timestamp = String(Date.now());
    const signature = signInternalRequest(body, 'revalidate-secret', timestamp);
    const response = await POST(
      new NextRequest('http://localhost/api/internal/revalidate', {
        method: 'POST',
        body,
        headers: {
          'x-revalidate-timestamp': timestamp,
          'x-revalidate-signature': signature,
        },
      }),
    );

    expect(revalidateServerTagsMock).toHaveBeenCalledWith('storefront-settings');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revalidated: ['storefront-settings'],
    });
  });

  it.each([
    ['products', 'products'],
    ['product-meta', 'products-meta'],
  ])('revalidates %s independently', async (scope, expectedTag) => {
    const body = JSON.stringify({ scope });
    const timestamp = String(Date.now());
    const signature = signInternalRequest(body, 'revalidate-secret', timestamp);
    const response = await POST(
      new NextRequest('http://localhost/api/internal/revalidate', {
        method: 'POST',
        body,
        headers: {
          'x-revalidate-timestamp': timestamp,
          'x-revalidate-signature': signature,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(revalidateServerTagsMock).toHaveBeenCalledWith(expectedTag);
    await expect(response.json()).resolves.toEqual({ ok: true, revalidated: [expectedTag] });
  });
});
