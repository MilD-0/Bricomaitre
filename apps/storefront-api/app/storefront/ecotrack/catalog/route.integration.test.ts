import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, readStorefrontEcotrackCatalogMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  readStorefrontEcotrackCatalogMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/storefront-core/ecotrack-catalog', () => ({
  readStorefrontEcotrackCatalog: readStorefrontEcotrackCatalogMock,
}));

vi.mock('@bric/storefront-core/server-cache', () => ({
  CACHE_TAGS: { ecotrackCatalog: 'ecotrack-catalog' },
  createServerCache: ({ load }: { load: (...args: unknown[]) => unknown }) => load,
}));

describe('app/storefront/ecotrack/catalog/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    readStorefrontEcotrackCatalogMock.mockReset();
  });

  it('returns an unavailable response when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Storefront database is unavailable.',
    });
  });

  it('returns the public ecotrack catalog for the storefront', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    readStorefrontEcotrackCatalogMock.mockResolvedValue({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [
        { communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true },
      ],
      serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '400', stopDeskFee: '350' }],
      weightFees: [
        {
          serviceType: 'livraison',
          homeSurcharge: '50',
          stopDeskSurcharge: '50',
          perAdditionalKg: '1.00',
          startsAtKg: '5.00',
        },
      ],
      lastSync: { id: 1, status: 'success' },
    });

    const response = await GET();

    expect(readStorefrontEcotrackCatalogMock).toHaveBeenCalledWith({ tag: 'db' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe(
      'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    );
    await expect(response.json()).resolves.toEqual({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [
        { communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true },
      ],
      serviceFees: [{ serviceType: 'livraison', wilayaId: 16, homeFee: '400', stopDeskFee: '350' }],
      weightFees: [
        {
          serviceType: 'livraison',
          homeSurcharge: '50',
          stopDeskSurcharge: '50',
          perAdditionalKg: '1.00',
          startsAtKg: '5.00',
        },
      ],
      lastSync: { id: 1, status: 'success' },
    });
  });
});
