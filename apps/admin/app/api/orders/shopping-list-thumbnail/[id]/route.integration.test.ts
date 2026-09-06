import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  product: vi.fn(),
  safe: vi.fn(),
  object: vi.fn(),
}));
vi.mock('../../../../../lib/rbac', () => ({ requireMutationAccess: mocks.access }));
vi.mock('@bric/db/client', () => ({
  getDb: () => ({ query: { products: { findFirst: mocks.product } } }),
}));
vi.mock('../../../../../lib/remote-url-safety', () => ({ isSafeRemoteHttpsUrl: mocks.safe }));
vi.mock('../../../../../lib/s3-upload', () => ({
  readPrivateS3Object: mocks.object,
  buildCloudfrontUrl: (origin: string, key: string) => `${origin.replace(/\/$/, '')}/${key}`,
}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => unknown) => fn }));
const url = 'http://localhost/api/orders/shopping-list-thumbnail/1';
const get = () => GET(new NextRequest(url), { params: Promise.resolve({ id: '1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ response: null });
  mocks.product.mockResolvedValue({ images: ['https://images.example.com/drill.png'] });
  mocks.safe.mockResolvedValue(true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('requires order access before looking up the known product image', async () => {
  mocks.access.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
  expect((await get()).status).toBe(403);
  expect(mocks.product).not.toHaveBeenCalled();
});

it('keeps a useful photograph at bounded print dimensions and caches privately', async () => {
  const original = await sharp({
    create: { width: 2000, height: 1000, channels: 4, background: '#267b65' },
  })
    .png()
    .toBuffer();
  const fetch = vi.fn().mockResolvedValue(new Response(original));
  vi.stubGlobal('fetch', fetch);
  const response = await get();
  const bytes = Buffer.from(await response.arrayBuffer());
  const image = await sharp(bytes).metadata();
  expect(response.status).toBe(200);
  expect(image).toMatchObject({ width: 120, height: 60, format: 'jpeg', hasAlpha: false });
  expect(bytes.length).toBeLessThan(20_000);
  expect(response.headers.get('cache-control')).toBe('private, max-age=3600');
  expect(fetch).toHaveBeenCalledWith(
    'https://images.example.com/drill.png',
    expect.objectContaining({ redirect: 'error' }),
  );
});

it('reads configured local media through S3 without an arbitrary network request', async () => {
  vi.stubEnv('AWS_CLOUDFRONT_DOMAIN', 'http://127.0.0.1:4900');
  mocks.product.mockResolvedValue({ images: ['http://127.0.0.1:4900/products/drill.png'] });
  const bytes = await sharp({ create: { width: 20, height: 10, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  mocks.object.mockResolvedValue({
    Body: { transformToWebStream: () => new Response(bytes).body },
  });
  const response = await get();
  expect(response.status).toBe(200);
  expect(mocks.object).toHaveBeenCalledWith('products/drill.png', {
    abortSignal: expect.any(AbortSignal),
  });
  expect(mocks.safe).not.toHaveBeenCalled();
});

it('rejects unavailable, nonpublic and oversized image sources', async () => {
  mocks.product.mockResolvedValueOnce({ images: [] });
  expect((await get()).status).toBe(404);
  mocks.safe.mockResolvedValueOnce(false);
  expect((await get()).status).toBe(404);
  const fetch = vi
    .fn()
    .mockResolvedValue(
      new Response('bytes', { headers: { 'content-length': String(10 * 1024 * 1024 + 1) } }),
    );
  vi.stubGlobal('fetch', fetch);
  expect((await get()).status).toBe(404);
  fetch.mockResolvedValueOnce(new Response('not an image'));
  expect((await get()).status).toBe(404);
});
