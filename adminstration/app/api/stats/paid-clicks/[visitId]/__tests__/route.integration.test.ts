import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const { hasDbMock, requireAdministrationAccessMock, getPaidClickVisitDetailMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  requireAdministrationAccessMock: vi.fn(),
  getPaidClickVisitDetailMock: vi.fn(),
}));

vi.mock('../../../../../../db/client', () => ({
  hasDb: hasDbMock,
}));

vi.mock('../../../../../../lib/rbac', () => ({
  requireAdministrationAccess: requireAdministrationAccessMock,
}));

vi.mock('../../../../../../lib/paid-clicks', () => ({
  getPaidClickVisitDetail: getPaidClickVisitDetailMock,
}));

describe('app/api/stats/paid-clicks/[visitId]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    requireAdministrationAccessMock.mockReset();
    getPaidClickVisitDetailMock.mockReset();

    hasDbMock.mockReturnValue(true);
    requireAdministrationAccessMock.mockResolvedValue(null);
  });

  it('returns visit details for an admin-authorized caller', async () => {
    getPaidClickVisitDetailMock.mockResolvedValue({ id: 'visit-1', paidSource: 'meta' });

    const response = await GET(new NextRequest('http://localhost/api/stats/paid-clicks/visit-1'), {
      params: Promise.resolve({ visitId: 'visit-1' }),
    });

    expect(response.status).toBe(200);
    expect(requireAdministrationAccessMock).toHaveBeenCalled();
    expect(getPaidClickVisitDetailMock).toHaveBeenCalledWith('visit-1');
    await expect(response.json()).resolves.toEqual({ id: 'visit-1', paidSource: 'meta' });
  });

  it('returns the RBAC denial response', async () => {
    requireAdministrationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/stats/paid-clicks/visit-1'), {
      params: Promise.resolve({ visitId: 'visit-1' }),
    });

    expect(response.status).toBe(403);
  });
});
