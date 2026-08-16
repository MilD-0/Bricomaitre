import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const {
  hasDbMock,
  getDbMock,
  readStorefrontCatalogCountsMock,
  getStorefrontApiDeployTokenMock,
  isValidDeployTokenMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontCatalogCountsMock: vi.fn(),
  getStorefrontApiDeployTokenMock: vi.fn(),
  isValidDeployTokenMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/catalog', () => ({
  readStorefrontCatalogCounts: readStorefrontCatalogCountsMock,
}));

vi.mock('../../../../lib/internal-deploy', () => ({
  getStorefrontApiDeployToken: getStorefrontApiDeployTokenMock,
  isValidDeployToken: isValidDeployTokenMock,
}));

describe('app/api/internal/catalog-counts/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontCatalogCountsMock.mockReset();
    getStorefrontApiDeployTokenMock.mockReset();
    isValidDeployTokenMock.mockReset();
    getStorefrontApiDeployTokenMock.mockReturnValue('deploy-token');
  });

  it('returns 503 when the deploy token is not configured', async () => {
    getStorefrontApiDeployTokenMock.mockReturnValue('');

    const response = await GET(new NextRequest('http://localhost/api/internal/catalog-counts'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'deploy token is not configured' });
  });

  it('rejects requests with an invalid deploy token', async () => {
    isValidDeployTokenMock.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/internal/catalog-counts'));

    expect(isValidDeployTokenMock).toHaveBeenCalledWith(null);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' });
  });

  it('returns zero counts when DB is unavailable', async () => {
    isValidDeployTokenMock.mockReturnValue(true);
    hasDbMock.mockReturnValue(false);

    const response = await GET(
      new NextRequest('http://localhost/api/internal/catalog-counts', {
        headers: { 'x-deploy-token': 'deploy-token' },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      productCount: 0,
      brandCount: 0,
      categoryCount: 0,
    });
  });

  it('returns catalog counts from the shared service', async () => {
    isValidDeployTokenMock.mockReturnValue(true);
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontCatalogCountsMock.mockResolvedValue({
      productCount: 321,
      brandCount: 20,
      categoryCount: 40,
    });

    const response = await GET(
      new NextRequest('http://localhost/api/internal/catalog-counts', {
        headers: { 'x-deploy-token': 'deploy-token' },
      }),
    );

    expect(readStorefrontCatalogCountsMock).toHaveBeenCalledWith({ tag: 'db' });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      productCount: 321,
      brandCount: 20,
      categoryCount: 40,
    });
  });
});
