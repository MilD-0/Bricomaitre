import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

const { hasDbMock, getDbMock, requireMutationAccessMock, buildEcotrackPostingPreviewMock } =
  vi.hoisted(() => ({
    hasDbMock: vi.fn(),
    getDbMock: vi.fn(),
    requireMutationAccessMock: vi.fn(),
    buildEcotrackPostingPreviewMock: vi.fn(),
  }));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../lib/ecotrack', () => ({
  buildEcotrackPostingPreview: buildEcotrackPostingPreviewMock,
}));

describe('app/api/orders/ecotrack/preview/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
    requireMutationAccessMock.mockReset();
    buildEcotrackPostingPreviewMock.mockReset();

    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({ db: true });
    requireMutationAccessMock.mockResolvedValue(null);
    buildEcotrackPostingPreviewMock.mockResolvedValue({
      totalRequested: 2,
      eligible: [{ orderId: 11 }],
      skipped: [{ orderId: 12, reason: 'already_posted' }],
      invalid: [],
    });
  });

  it('returns RBAC denial', async () => {
    requireMutationAccessMock.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/preview', {
        method: 'POST',
        body: JSON.stringify({ mode: 'selected', orderIds: [11] }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it('returns 503 when DB is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/preview', {
        method: 'POST',
        body: JSON.stringify({ mode: 'selected', orderIds: [11] }),
      }),
    );

    expect(response.status).toBe(503);
  });

  it('returns preview counts', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/orders/ecotrack/preview', {
        method: 'POST',
        body: JSON.stringify({ mode: 'selected', orderIds: [11, '12', 12] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(buildEcotrackPostingPreviewMock).toHaveBeenCalledWith(
      { db: true },
      'selected',
      [11, 12],
    );
    await expect(response.json()).resolves.toEqual({
      totalRequested: 2,
      eligible: [{ orderId: 11 }],
      skipped: [{ orderId: 12, reason: 'already_posted' }],
      invalid: [],
    });
  });
});
