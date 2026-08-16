import { revalidateTag } from 'next/cache';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signInternalRequest } from '@bric/runtime/internal-signing';

import { POST } from './route';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

const originalSecret = process.env.STOREFRONT_REVALIDATE_SECRET;

describe('app/api/internal/revalidate/route', () => {
  beforeEach(() => {
    process.env.STOREFRONT_REVALIDATE_SECRET = 'revalidate-secret';
    vi.mocked(revalidateTag).mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.STOREFRONT_REVALIDATE_SECRET;
    } else {
      process.env.STOREFRONT_REVALIDATE_SECRET = originalSecret;
    }
  });

  it('fails closed when the shared secret is not configured', async () => {
    delete process.env.STOREFRONT_REVALIDATE_SECRET;

    const response = await POST(
      new NextRequest('http://localhost/api/internal/revalidate', {
        method: 'POST',
        body: JSON.stringify({ scope: 'products' }),
      }),
    );

    expect(response.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects unsigned requests', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/internal/revalidate', {
        method: 'POST',
        body: JSON.stringify({ scope: 'products' }),
      }),
    );

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('immediately expires global and deduplicated product tags', async () => {
    const body = JSON.stringify({
      scope: 'products',
      tokens: ['desk-lamp', 'legacy-lamp', 'desk-lamp'],
    });
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
    expect(revalidateTag).toHaveBeenNthCalledWith(1, 'storefront-products', { expire: 0 });
    expect(revalidateTag).toHaveBeenNthCalledWith(2, 'storefront-product:desk-lamp', {
      expire: 0,
    });
    expect(revalidateTag).toHaveBeenNthCalledWith(3, 'storefront-product:legacy-lamp', {
      expire: 0,
    });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revalidated: [
        'storefront-products',
        'storefront-product:desk-lamp',
        'storefront-product:legacy-lamp',
      ],
    });
  });

  it('rejects signed unsupported scopes', async () => {
    const body = JSON.stringify({ scope: 'customers' });
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

    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('immediately expires the settings tag without product tags', async () => {
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

    expect(revalidateTag).toHaveBeenCalledOnce();
    expect(revalidateTag).toHaveBeenCalledWith('storefront-settings', { expire: 0 });
    await expect(response.json()).resolves.toEqual({
      ok: true,
      revalidated: ['storefront-settings'],
    });
  });

  it.each([
    ['assets', 'storefront-assets'],
    ['product-meta', 'storefront-product-meta'],
    ['landing-pages', 'storefront-landing-pages'],
  ] as const)('immediately expires the %s cache scope', async (scope, tag) => {
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
    expect(revalidateTag).toHaveBeenCalledOnce();
    expect(revalidateTag).toHaveBeenCalledWith(tag, { expire: 0 });
    await expect(response.json()).resolves.toEqual({ ok: true, revalidated: [tag] });
  });
});
