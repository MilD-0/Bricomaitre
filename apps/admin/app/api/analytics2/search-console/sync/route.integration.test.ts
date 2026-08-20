import { beforeEach, describe, expect, it, vi } from 'vitest';

const { syncMock, requireMutationMock } = vi.hoisted(() => ({
  syncMock: vi.fn(),
  requireMutationMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ hasDb: () => true }));
vi.mock('../../../../../lib/rbac', () => ({ requireMutationAccess: requireMutationMock }));
vi.mock('../../../../../lib/search-console', async () => {
  const actual = await vi.importActual<typeof import('../../../../../lib/search-console')>(
    '../../../../../lib/search-console',
  );
  return { ...actual, syncSearchConsole: syncMock };
});

import { POST } from './route';

describe('POST /api/analytics2/search-console/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireMutationMock.mockResolvedValue(null);
    syncMock.mockResolvedValue({ since: '2026-08-10', until: '2026-08-17', totals: 8 });
  });

  it('runs the incremental Search Console synchronization under stats mutation access', async () => {
    const response = await POST(
      new Request('http://localhost/api/analytics2/search-console/sync', { method: 'POST' }),
    );
    expect(response.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith({
      since: undefined,
      until: undefined,
      trigger: 'analytics2',
      inspectionLimit: 10,
    });
  });

  it('rejects incomplete and reversed explicit ranges before provider access', async () => {
    const incomplete = await POST(
      new Request('http://localhost/api/analytics2/search-console/sync', {
        method: 'POST',
        body: JSON.stringify({ since: '2026-08-01' }),
      }),
    );
    const reversed = await POST(
      new Request('http://localhost/api/analytics2/search-console/sync', {
        method: 'POST',
        body: JSON.stringify({ since: '2026-08-10', until: '2026-08-01' }),
      }),
    );
    expect(incomplete.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect(syncMock).not.toHaveBeenCalled();
  });
});
