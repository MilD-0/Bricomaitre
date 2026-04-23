import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const { hasDbMock, requireAdministrationAccessMock, listPaidClickVisitsMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireAdministrationAccessMock: vi.fn(),
  listPaidClickVisitsMock: vi.fn(),
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireAdministrationAccess: requireAdministrationAccessMock,
}));

vi.mock('../../../../../lib/paid-clicks', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/paid-clicks')>('../../../../../lib/paid-clicks');

  return {
    ...actual,
    listPaidClickVisits: listPaidClickVisitsMock,
  };
});

describe('app/api/stats/paid-clicks/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    requireAdministrationAccessMock.mockReset();
    listPaidClickVisitsMock.mockReset();

    hasDbMock.mockReturnValue(true);
    requireAdministrationAccessMock.mockResolvedValue(null);
  });

  it('returns paid-click visits for an admin-authorized caller', async () => {
    listPaidClickVisitsMock.mockResolvedValue({ data: [{ id: 'visit-1' }], nextCursor: null, summary: { total: 1 } });

    const response = await GET(new NextRequest('http://localhost/api/stats/paid-clicks?range=30d'));

    expect(response.status).toBe(200);
    expect(requireAdministrationAccessMock).toHaveBeenCalled();
    expect(listPaidClickVisitsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        range: '30d',
        variant: 'all',
        paidSource: 'all',
        outcome: 'all',
        hasOrder: 'all',
        search: '',
        limit: 25,
      }),
    );
    await expect(response.json()).resolves.toEqual({ data: [{ id: 'visit-1' }], nextCursor: null, summary: { total: 1 } });
  });

  it('returns the RBAC denial response', async () => {
    requireAdministrationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/stats/paid-clicks?range=30d'));

    expect(response.status).toBe(403);
  });
});
