import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ load: vi.fn(), fresh: vi.fn(), stored: vi.fn() }));
vi.mock('@bric/db/client', () => ({ getDb: () => 'database', hasDb: () => true }));
vi.mock('./admin-ecotrack-shipment-state', async (original) => ({
  ...(await original<object>()),
  loadShipmentRowByOrderId: mocks.load,
  ensureFreshShipmentRow: mocks.fresh,
}));
vi.mock('./admin-ecotrack-shipment-view', async (original) => ({
  ...(await original<object>()),
  buildEcotrackOrderDetailsFromRows: mocks.stored,
}));

import { loadEcotrackOrderDetail } from './admin-ecotrack-orders-read';

beforeEach(() => vi.resetAllMocks());

it('builds stored detail without entering provider refresh even for a stale record', async () => {
  const row = { order: { id: 91 }, lastStatusSyncedAt: new Date('2020-01-01') };
  const detail = { orderId: 91, status: { isStatusStale: true } };
  mocks.load.mockResolvedValue(row);
  mocks.stored.mockResolvedValue([detail]);
  expect(await loadEcotrackOrderDetail(91, undefined, { refresh: false })).toEqual(detail);
  expect(mocks.stored).toHaveBeenCalledWith('database', [row]);
  expect(mocks.fresh).not.toHaveBeenCalled();
});

it('keeps live freshness behavior and does not refresh missing shipments', async () => {
  const row = { order: { id: 91 } };
  const actor = { email: 'operator@example.com' };
  mocks.load.mockResolvedValueOnce(row).mockResolvedValueOnce(null);
  mocks.fresh.mockResolvedValue({ orderId: 91 });
  expect(await loadEcotrackOrderDetail(91, actor)).toEqual({ orderId: 91 });
  expect(mocks.fresh).toHaveBeenCalledWith('database', row, { actor });
  expect(await loadEcotrackOrderDetail(92, undefined, { refresh: false })).toBeNull();
  expect(mocks.fresh).toHaveBeenCalledTimes(1);
  expect(mocks.stored).not.toHaveBeenCalled();
});
