vi.mock('next/cache', () => ({ unstable_cache: (load: (...args: unknown[]) => unknown) => load }));

import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock, requireMutationAccessMock, readEcotrackCatalogMock } = vi.hoisted(
  () => ({
    hasDbMock: vi.fn(),
    getDbMock: vi.fn(),
    requireMutationAccessMock: vi.fn(),
    readEcotrackCatalogMock: vi.fn(),
  }),
);

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../lib/ecotrack', () => ({
  readEcotrackCatalog: readEcotrackCatalogMock,
}));

vi.mock('../../../../lib/server-cache', () => ({
  CACHE_TAGS: { ecotrack: 'ecotrack' },
}));

describe('app/api/ecotrack/catalog/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    readEcotrackCatalogMock.mockReset();

    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ tag: 'db' });
    requireMutationAccessMock.mockImplementation(async () => ({
      response: null,
      session: { user: { isAllowed: true, permissions: [] } },
    }));
  });

  it('returns the RBAC denial response', async () => {
    requireMutationAccessMock.mockImplementation(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('returns 503 when the database is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(503);
  });

  it('returns the ECOTRACK catalog', async () => {
    readEcotrackCatalogMock.mockResolvedValue({
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

    expect(response.status).toBe(200);
    expect(requireMutationAccessMock).toHaveBeenCalledWith('orders');
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
