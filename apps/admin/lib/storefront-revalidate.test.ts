const { revalidateLocalMeta } = vi.hoisted(() => ({ revalidateLocalMeta: vi.fn() }));
vi.mock('./server-cache', () => ({
  CACHE_TAGS: { productsMeta: 'products-meta' },
  revalidateServerTags: revalidateLocalMeta,
}));
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyInternalRequestSignature } from '@bric/runtime/internal-signing';

import {
  buildStorefrontLandingPagePreviewUrl,
  getStorefrontBaseUrl,
  revalidateStorefrontAssets,
  revalidateStorefrontProductMeta,
  revalidateStorefrontProducts,
  revalidateStorefrontSettings,
} from './storefront-revalidate';

const originalBaseUrl = process.env.STOREFRONT_BASE_URL;
const originalSecret = process.env.STOREFRONT_REVALIDATE_SECRET;

describe('storefront product revalidation', () => {
  beforeEach(() => {
    revalidateLocalMeta.mockClear();
    delete process.env.STOREFRONT_BASE_URL;
    delete process.env.STOREFRONT_REVALIDATE_SECRET;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (originalBaseUrl === undefined) {
      delete process.env.STOREFRONT_BASE_URL;
    } else {
      process.env.STOREFRONT_BASE_URL = originalBaseUrl;
    }
    if (originalSecret === undefined) {
      delete process.env.STOREFRONT_REVALIDATE_SECRET;
    } else {
      process.env.STOREFRONT_REVALIDATE_SECRET = originalSecret;
    }
  });

  it('uses the local storefront URL by default', () => {
    expect(getStorefrontBaseUrl()).toBe('http://localhost:3002');
  });

  it('builds a short-lived signed URL for the saved landing-page revision', () => {
    process.env.STOREFRONT_BASE_URL = 'http://storefront:3002';
    vi.stubEnv('NEXT_PUBLIC_STOREFRONT_BASE_URL', 'https://public.example.com/');
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';

    const previewUrl = new URL(
      buildStorefrontLandingPagePreviewUrl(
        { locale: 'fr', slug: 'perceuse-20v', revision: 4 },
        { nowMs: 1_787_817_600_000 },
      ),
    );

    expect(`${previewUrl.origin}${previewUrl.pathname}`).toBe(
      'https://public.example.com/fr/landing-preview/perceuse-20v',
    );
    expect(previewUrl.searchParams.get('previewRevision')).toBe('4');
    expect(
      verifyInternalRequestSignature({
        payload: 'landing-page-preview-v1:fr:perceuse-20v:4',
        secret: 'test-secret',
        timestamp: previewUrl.searchParams.get('previewTimestamp'),
        signature: previewUrl.searchParams.get('previewSignature'),
        nowMs: 1_787_817_600_000,
      }),
    ).toEqual({ ok: true });
  });

  it('posts signed product invalidation requests to the canonical API and storefront', async () => {
    process.env.STOREFRONT_BASE_URL = 'https://storefront.example.com/';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await revalidateStorefrontProducts();

    expect(getStorefrontBaseUrl()).toBe('https://storefront.example.com');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3001/api/internal/revalidate',
      'https://storefront.example.com/api/internal/revalidate',
    ]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      fetchMock.mock.calls.every(([, requestInit]) => requestInit.body === '{"scope":"products"}'),
    ).toBe(true);
    expect(init).toMatchObject({
      method: 'POST',
      body: '{"scope":"products"}',
      cache: 'no-store',
    });
    const headers = new Headers(init.headers);
    expect(
      verifyInternalRequestSignature({
        payload: String(init.body),
        secret: 'test-secret',
        timestamp: headers.get('x-revalidate-timestamp'),
        signature: headers.get('x-revalidate-signature'),
      }),
    ).toEqual({ ok: true });
  });

  it('does not expire the storefront consumer before canonical invalidation finishes', async () => {
    process.env.STOREFRONT_BASE_URL = 'http://storefront:3002';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    let finishCanonical!: () => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishCanonical = () => resolve(new Response(null, { status: 200 }));
          }),
      )
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const invalidation = revalidateStorefrontProducts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishCanonical();
    await invalidation;
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3001/api/internal/revalidate',
      'http://storefront:3002/api/internal/revalidate',
    ]);
  });

  it('posts a signed product metadata invalidation for category and brand changes', async () => {
    process.env.STOREFRONT_BASE_URL = 'https://storefront.example.com';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await revalidateStorefrontProductMeta();
    expect(revalidateLocalMeta).toHaveBeenCalledWith('products-meta');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3001/api/internal/revalidate',
      'https://storefront.example.com/api/internal/revalidate',
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.body === '{"scope":"product-meta"}')).toBe(
      true,
    );
  });

  it('fails safely when the URL is enabled without the shared secret', async () => {
    process.env.STOREFRONT_BASE_URL = 'https://storefront.example.com';
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
    process.env.STOREFRONT_BASE_URL = 'https://storefront.example.com';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(revalidateStorefrontProducts()).resolves.toBeUndefined();

    expect(warning).toHaveBeenCalledWith(
      '[admin] storefront product revalidation request failed',
      expect.objectContaining({ baseUrl: 'https://storefront.example.com' }),
    );
  });

  it('revalidates settings in the canonical API and storefront', async () => {
    process.env.STOREFRONT_BASE_URL = 'https://storefront.example.com';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await revalidateStorefrontSettings();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3001/api/internal/revalidate',
      'https://storefront.example.com/api/internal/revalidate',
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.body === '{"scope":"settings"}')).toBe(
      true,
    );
  });

  it('revalidates homepage assets in the API and storefront', async () => {
    process.env.STOREFRONT_BASE_URL = 'https://storefront.example.com';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'test-secret';
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await revalidateStorefrontAssets();

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:3001/api/internal/revalidate',
      'https://storefront.example.com/api/internal/revalidate',
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init.body === '{"scope":"assets"}')).toBe(true);
  });
});
