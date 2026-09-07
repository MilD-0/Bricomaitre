import { describe, expect, it, vi, beforeEach } from 'vitest';

import { GET } from './route';

const { authMock, loadDailyOrderStatusOverviewMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  loadDailyOrderStatusOverviewMock: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@/lib/admin-orders-data', () => ({
  loadDailyOrderStatusOverview: loadDailyOrderStatusOverviewMock,
}));

describe('app/api/orders/overview/route', () => {
  beforeEach(() => {
    authMock.mockReset();
    loadDailyOrderStatusOverviewMock.mockReset();
  });

  it('requires orders access', async () => {
    authMock.mockResolvedValue({ user: { isAllowed: true, permissions: [], role: 'user' } });

    const response = await GET(new Request('http://localhost/api/orders/overview'));

    expect(response.status).toBe(403);
    expect(loadDailyOrderStatusOverviewMock).not.toHaveBeenCalled();
  });

  it('returns the daily order status overview for orders users', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, permissions: ['orders_write'], role: 'user' },
    });
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

    const response = await GET(new Request('http://localhost/api/orders/overview'));

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
    expect(loadDailyOrderStatusOverviewMock).toHaveBeenCalledWith({
      includeProfitProjection: false,
      profitProjectionBasis: 'confirmed',
    });
  });

  it('loads profit projections from posted order transitions when requested', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, permissions: ['orders_write', 'analytics_manage'], role: 'admin' },
    });
    loadDailyOrderStatusOverviewMock.mockResolvedValue({
      available: false,
      reportDay: null,
      timezone: 'Africa/Algiers',
    });

    const response = await GET(
      new Request('http://localhost/api/orders/overview?projectionBasis=posted'),
    );

    expect(response.status).toBe(200);
    expect(loadDailyOrderStatusOverviewMock).toHaveBeenCalledWith({
      includeProfitProjection: true,
      profitProjectionBasis: 'posted',
    });
  });

  it('loads an explicitly bounded seven-day overview for the selected orders design', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, permissions: ['orders_write', 'analytics_manage'], role: 'admin' },
    });
    loadDailyOrderStatusOverviewMock.mockResolvedValue({
      available: false,
      reportDay: null,
      timezone: 'Africa/Algiers',
    });

    const response = await GET(
      new Request('http://localhost/api/orders/overview?projectionBasis=posted&reportDays=7'),
    );

    expect(response.status).toBe(200);
    expect(loadDailyOrderStatusOverviewMock).toHaveBeenCalledWith({
      includeProfitProjection: true,
      profitProjectionBasis: 'posted',
      reportDays: 7,
    });
  });

  it('rejects malformed or out-of-range report-day requests', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, permissions: ['orders_write'], role: 'admin' },
    });

    for (const reportDays of ['0', '8', '2.5', 'all']) {
      const response = await GET(
        new Request(`http://localhost/api/orders/overview?reportDays=${reportDays}`),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid report days' });
    }
    expect(loadDailyOrderStatusOverviewMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported profit projection basis', async () => {
    authMock.mockResolvedValue({
      user: { isAllowed: true, permissions: ['orders_write'], role: 'admin' },
    });

    const response = await GET(
      new Request('http://localhost/api/orders/overview?projectionBasis=delivered'),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid projection basis' });
    expect(loadDailyOrderStatusOverviewMock).not.toHaveBeenCalled();
  });
});
