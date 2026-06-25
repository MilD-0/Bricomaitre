import { describe, expect, it, vi, beforeEach } from 'vitest';

import { GET } from './route';

const { authMock, loadDailyOrderStatusOverviewMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  loadDailyOrderStatusOverviewMock: vi.fn(),
}));

vi.mock('../../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../../lib/admin-orders-data', () => ({
  loadDailyOrderStatusOverview: loadDailyOrderStatusOverviewMock,
}));

describe('app/api/orders/overview/route', () => {
  beforeEach(() => {
    authMock.mockReset();
    loadDailyOrderStatusOverviewMock.mockReset();
  });

  it('requires orders access', async () => {
    authMock.mockResolvedValue({ user: { isAllowed: true, permissions: [], role: 'user' } });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(loadDailyOrderStatusOverviewMock).not.toHaveBeenCalled();
  });

  it('returns the daily order status overview for orders users', async () => {
    authMock.mockResolvedValue({ user: { isAllowed: true, permissions: ['orders_write'], role: 'user' } });
    loadDailyOrderStatusOverviewMock.mockResolvedValue({
      available: true,
      reportDay: '2026-05-24',
      timezone: 'Africa/Algiers',
      newOrders: 2,
      confirmationStatusChanges: 4,
      confirmedToday: 1,
      noAnswerOrders: 2,
      adminCancelled: 0,
      carrierCancelled: 1,
      shipmentUpdates: 3,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      overview: {
        available: true,
        reportDay: '2026-05-24',
        timezone: 'Africa/Algiers',
        newOrders: 2,
        confirmationStatusChanges: 4,
        confirmedToday: 1,
        noAnswerOrders: 2,
        adminCancelled: 0,
        carrierCancelled: 1,
        shipmentUpdates: 3,
      },
    });
  });
});
