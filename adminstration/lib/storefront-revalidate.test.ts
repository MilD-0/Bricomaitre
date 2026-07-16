import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';

import { getStorefrontNewBaseUrl, revalidateStorefrontProducts, revalidateStorefrontSettings } from './storefront-revalidate';

const originalBaseUrl = process.env.STOREFRONT_NEW_BASE_URL;
const originalSecret = process.env.STOREFRONT_REVALIDATE_SECRET;

describe('storefront product revalidation', () => {
  beforeEach(() => {
    delete process.env.STOREFRONT_NEW_BASE_URL;
    delete process.env.STOREFRONT_REVALIDATE_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalBaseUrl === undefined) {
      delete process.env.STOREFRONT_NEW_BASE_URL;
    } else {
      process.env.STOREFRONT_NEW_BASE_URL = originalBaseUrl;
    }
    if (originalSecret === undefined) {
      delete process.env.STOREFRONT_REVALIDATE_SECRET;
    } else {
      process.env.STOREFRONT_REVALIDATE_SECRET = originalSecret;
    }
  });

  it('is disabled until the new storefront URL is configured', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(getStorefrontNewBaseUrl()).toBeNull();
    await revalidateStorefrontProducts();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts a signed, immediate product invalidation request', async () => {
    process.env.STOREFRONT_NEW_BASE_URL = 'https://storefront-new.example.com/';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await revalidateStorefrontProducts();

    expect(getStorefrontNewBaseUrl()).toBe('https://storefront-new.example.com');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://storefront-new.example.com/api/internal/revalidate');
    expect(init).toMatchObject({
      method: 'POST',
      body: '{"scope":"products"}',
      cache: 'no-store',
    });
    const headers = new Headers(init.headers);
    expect(verifyInternalRequestSignature({
      payload: String(init.body),
      secret: 'test-secret',
      timestamp: headers.get('x-revalidate-timestamp'),
      signature: headers.get('x-revalidate-signature'),
    })).toEqual({ ok: true });
  });

  it('fails safely when the URL is enabled without the shared secret', async () => {
    process.env.STOREFRONT_NEW_BASE_URL = 'https://storefront-new.example.com';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await revalidateStorefrontProducts();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      '[admin] storefront product revalidation skipped because STOREFRONT_REVALIDATE_SECRET is not configured',
    );
  });

  it('keeps storefront failures non-blocking', async () => {
    process.env.STOREFRONT_NEW_BASE_URL = 'https://storefront-new.example.com';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(revalidateStorefrontProducts()).resolves.toBeUndefined();

    expect(warning).toHaveBeenCalledWith(
      '[admin] storefront product revalidation request failed',
      expect.objectContaining({ baseUrl: 'https://storefront-new.example.com' }),
    );
  });

  it('revalidates settings in the canonical API and the new storefront', async () => {
    process.env.STOREFRONT_NEW_BASE_URL = 'https://storefront-new.example.com';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await revalidateStorefrontSettings();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3001/api/internal/revalidate',
      'https://storefront-new.example.com/api/internal/revalidate',
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.body === '{"scope":"settings"}')).toBe(true);
  });
});
