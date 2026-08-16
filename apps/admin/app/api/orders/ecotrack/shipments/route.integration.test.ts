import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const {
  hasDbMock,
  authMock,
  requireMutationAccessMock,
  canMutateResourceMock,
  loadEcotrackOrdersPageDataMock,
} = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  authMock: vi.fn(),
  requireMutationAccessMock: vi.fn(),
  canMutateResourceMock: vi.fn(),
  loadEcotrackOrdersPageDataMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
  canMutateResource: canMutateResourceMock,
}));

vi.mock('../../../../../lib/admin-ecotrack-orders-data', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../../lib/admin-ecotrack-orders-data')
  >('../../../../../lib/admin-ecotrack-orders-data');

  return {
    ...actual,
    loadEcotrackOrdersPageData: loadEcotrackOrdersPageDataMock,
  };
});

describe('app/api/orders/ecotrack/shipments/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    authMock.mockReset();
    requireMutationAccessMock.mockReset();
    canMutateResourceMock.mockReset();
    loadEcotrackOrdersPageDataMock.mockReset();

    hasDbMock.mockReturnValue(true);
    authMock.mockResolvedValue({ user: { permissions: ['orders:write'] } });
    requireMutationAccessMock.mockResolvedValue(null);
    canMutateResourceMock.mockReturnValue(true);
    loadEcotrackOrdersPageDataMock.mockResolvedValue({
      writable: true,
      items: [],
      pagination: {
        page: 1,
        limit: 25,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await GET(new Request('http://localhost/api/orders/ecotrack/shipments'));

    expect(response.status).toBe(403);
  });

  it('loads cached shipments without blocking on upstream freshness', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/orders/ecotrack/shipments?page=2&status=en_livraison&staleOnly=true',
      ),
    );

    expect(response.status).toBe(200);
    expect(loadEcotrackOrdersPageDataMock).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 25,
        search: '',
        status: 'en_livraison',
        staleOnly: true,
        sort: [],
        sortKey: 'createdAt',
        sortDirection: 'desc',
        sortRules: [{ key: 'createdAt', direction: 'desc' }],
      },
      true,
    );
  });

  it('returns 400 for malformed list queries', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/orders/ecotrack/shipments?page=0'),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty('error');
    expect(loadEcotrackOrdersPageDataMock).not.toHaveBeenCalled();
  });
});
