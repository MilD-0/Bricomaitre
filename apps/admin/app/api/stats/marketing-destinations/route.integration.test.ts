import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ access: vi.fn(), hasDb: vi.fn(), diagnostics: vi.fn() }));

vi.mock('../../../../lib/rbac', () => ({ requireOpsAccess: mocks.access }));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb }));
vi.mock('../../../../lib/marketing-diagnostics', () => ({
  getMarketingDestinationDiagnostics: mocks.diagnostics,
}));

describe('GET /api/stats/marketing-destinations', () => {
  beforeEach(() => {
    mocks.access.mockReset().mockResolvedValue(null);
    mocks.hasDb.mockReset().mockReturnValue(true);
    mocks.diagnostics.mockReset().mockResolvedValue({
      destinations: [{ destination: 'google', accepted: 4 }],
      recentFailures: [],
    });
  });

  it('enforces operations access', async () => {
    mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    expect((await GET()).status).toBe(403);
    expect(mocks.diagnostics).not.toHaveBeenCalled();
  });

  it('returns per-destination delivery health without payload or customer data', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { destinations: [{ destination: 'google', accepted: 4 }], recentFailures: [] },
    });
  });
});
