import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { marker: 'db' },
  loadOrderDetail: vi.fn(),
  ensureToken: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('./admin-orders-data', () => ({ loadOrderDetail: mocks.loadOrderDetail }));
vi.mock('./admin-order-tracking', () => ({
  ensureAdminOrderPublicToken: mocks.ensureToken,
}));

import { issueAdminAiOrderTrackingLinks } from './admin-ai-order-tracking';

describe('admin AI order tracking links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadOrderDetail.mockImplementation(async (orderId: number) => {
      if (orderId === 404) return null;
      return {
        id: orderId,
        fullName: orderId === 31 ? 'Ada Lovelace' : 'Grace Hopper',
        publicToken: orderId === 31 ? 'existing-token' : null,
      };
    });
    mocks.ensureToken.mockImplementation(async (_db, orderId: number) =>
      orderId === 31 ? 'existing-token' : 'issued-token',
    );
  });

  it('reuses existing tokens, issues missing ones, and reports missing orders', async () => {
    const result = await issueAdminAiOrderTrackingLinks({ orderIds: [31, 32, 404, 31] }, 'ar');

    expect(mocks.ensureToken).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      locale: 'ar',
      items: [
        {
          orderId: 31,
          customerName: 'Ada Lovelace',
          action: 'existing',
          trackingUrl: 'https://bricomaitre.com/ar/thank-you?token=existing-token',
        },
        {
          orderId: 32,
          customerName: 'Grace Hopper',
          action: 'issued',
          trackingUrl: 'https://bricomaitre.com/ar/thank-you?token=issued-token',
        },
      ],
      failed: [{ orderId: 404, reason: 'order_not_found' }],
      successCount: 2,
      failureCount: 1,
    });
  });
});
