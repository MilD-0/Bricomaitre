import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import proxy from '../proxy';

const mocks = vi.hoisted(() => ({
  meta: vi.fn(),
  intl: vi.fn(),
}));

vi.mock('next-intl/middleware', () => ({ default: () => mocks.intl }));
vi.mock('@/lib/storefront-api', () => ({ fetchStorefrontCatalogMeta: mocks.meta }));

describe('storefront request proxy', () => {
  beforeEach(() => {
    mocks.meta.mockReset().mockResolvedValue({
      categories: [{ id: 3, slug: 'lighting' }],
      brands: [{ id: 2, slug: 'bric-pro' }],
    });
    mocks.intl.mockReset().mockReturnValue(new Response(null, { status: 200 }));
  });

  it('returns an HTTP 308 before rendering legacy taxonomy filters', async () => {
    const response = await proxy(new NextRequest('https://bricomaitre.com/fr/products?category=3'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://bricomaitre.com/fr/categories/lighting');
    expect(mocks.intl).not.toHaveBeenCalled();
  });

  it('leaves compound discovery and normal routes to locale middleware', async () => {
    const response = await proxy(
      new NextRequest('https://bricomaitre.com/fr/products?category=3&q=lampe'),
    );
    await proxy(new NextRequest('https://bricomaitre.com/fr/categories/lighting'));
    expect(mocks.intl).toHaveBeenCalledTimes(2);
    expect(mocks.meta).not.toHaveBeenCalled();
    expect(response.headers.get('Content-Security-Policy')).toMatch(
      /script-src 'self' 'nonce-[a-f0-9]+' 'strict-dynamic'/,
    );
    expect(response.headers.get('Content-Security-Policy')).not.toMatch(
      /script-src[^;]*'unsafe-inline'/,
    );
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-nonce');
  });

  it('rejects forged Next Action requests before application routing', async () => {
    const response = await proxy(
      new NextRequest('https://bricomaitre.com/fr/products', {
        headers: { 'Next-Action': 'unknown-action-id' },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Unsupported request protocol' });
    expect(mocks.intl).not.toHaveBeenCalled();
    expect(mocks.meta).not.toHaveBeenCalled();
  });
});
