import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const { getStableArtifactUrlMock } = vi.hoisted(() => ({
  getStableArtifactUrlMock: vi.fn(),
}));

vi.mock('../../../../../lib/export-artifacts', () => ({
  getStableArtifactUrl: getStableArtifactUrlMock,
}));

describe('app/api/products/catalog-feed/route', () => {
  const originalToken = process.env.PRODUCT_CATALOG_FEED_TOKEN;

  beforeEach(() => {
    getStableArtifactUrlMock.mockReset();
    getStableArtifactUrlMock.mockReturnValue('https://cdn.example.com/exports/products/catalog-feed/latest.csv');
    delete process.env.PRODUCT_CATALOG_FEED_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.PRODUCT_CATALOG_FEED_TOKEN;
      return;
    }

    process.env.PRODUCT_CATALOG_FEED_TOKEN = originalToken;
  });

  it('redirects to the stable catalog feed artifact url', async () => {
    const response = await GET(new NextRequest('http://localhost/api/products/catalog-feed'));

    expect(response.status).toBe(307);
    expect(getStableArtifactUrlMock).toHaveBeenCalledWith('exports/products/catalog-feed/latest.csv');
    expect(response.headers.get('location')).toBe('https://cdn.example.com/exports/products/catalog-feed/latest.csv');
  });

  it('requires a matching token when feed protection is configured', async () => {
    process.env.PRODUCT_CATALOG_FEED_TOKEN = 'secret-token';

    const response = await GET(new NextRequest('http://localhost/api/products/catalog-feed'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('allows access with the configured token', async () => {
    process.env.PRODUCT_CATALOG_FEED_TOKEN = 'secret-token';

    const response = await GET(new NextRequest('http://localhost/api/products/catalog-feed?token=secret-token'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://cdn.example.com/exports/products/catalog-feed/latest.csv');
  });
});
