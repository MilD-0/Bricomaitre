import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

import { GET } from '../route';

const { hasDbMock, getDbMock, captureAdminExceptionMock, lookupMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  captureAdminExceptionMock: vi.fn(),
  lookupMock: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ default: { lookup: lookupMock }, lookup: lookupMock }));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@/lib/sentry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/sentry')>('@/lib/sentry');
  return {
    ...actual,
    captureAdminException: captureAdminExceptionMock,
  };
});

describe('app/api/products/meta-image/[id]/route', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    captureAdminExceptionMock.mockReset();
    lookupMock.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    hasDbMock.mockReturnValue(true);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns 400 for an invalid product id', async () => {
    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/nope'), {
      params: Promise.resolve({ id: 'nope' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid product id' });
  });

  it('returns 404 when the product has no primary image', async () => {
    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({ images: [] }),
        },
      },
    });

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Image not found' });
  });

  it('flattens transparent images onto white and returns jpeg bytes', async () => {
    const transparentPng = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({ images: ['https://cdn.example.com/lamp.png'] }),
        },
      },
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(transparentPng, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    ) as typeof fetch;

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const pixels = await sharp(imageBuffer).ensureAlpha().raw().toBuffer();
    for (let index = 0; index < pixels.length; index += 4) {
      expect([...pixels.slice(index, index + 4)]).toEqual([255, 255, 255, 255]);
    }
  });

  it('returns non-transparent images unchanged', async () => {
    const jpegBuffer = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: { r: 12, g: 34, b: 56 },
      },
    })
      .jpeg()
      .toBuffer();

    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({ images: ['https://cdn.example.com/lamp.jpg'] }),
        },
      },
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response(jpegBuffer, {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      }),
    ) as typeof fetch;

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(jpegBuffer);
  });

  it('returns 502 when the upstream image fetch fails', async () => {
    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({ images: ['https://cdn.example.com/lamp.png'] }),
        },
      },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('bad gateway', { status: 502 })) as typeof fetch;

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to fetch product image' });
  });

  it('rejects private image sources without making a network request', async () => {
    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({ images: ['https://127.0.0.1/internal.png'] }),
        },
      },
    });
    global.fetch = vi.fn() as typeof fetch;

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects hostnames that resolve to private addresses without making a network request', async () => {
    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ images: ['https://internal.example.test/image.png'] }),
        },
      },
    });
    lookupMock.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    global.fetch = vi.fn() as typeof fetch;

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects oversized upstream images before buffering them', async () => {
    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({ images: ['https://cdn.example.com/huge.png'] }),
        },
      },
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response('small-placeholder', {
        headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) },
      }),
    ) as typeof fetch;

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(502);
    expect(captureAdminExceptionMock).toHaveBeenCalled();
  });

  it('captures processing errors and returns 502', async () => {
    getDbMock.mockReturnValue({
      query: {
        products: {
          findFirst: vi.fn().mockResolvedValue({ images: ['https://cdn.example.com/lamp.png'] }),
        },
      },
    });
    global.fetch = vi.fn().mockResolvedValue(
      new Response('not-an-image', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
    ) as typeof fetch;

    const response = await GET(new NextRequest('http://localhost/api/products/meta-image/5'), {
      params: Promise.resolve({ id: '5' }),
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to process product image' });
    expect(captureAdminExceptionMock).toHaveBeenCalled();
  });
});
