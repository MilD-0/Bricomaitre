import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), reporting: vi.fn() }));
vi.mock('./action-history', () => ({
  mutateEntityWithHistory: mocks.mutate,
  mutateEntityWithHistoryTransaction: mocks.mutate,
}));
vi.mock('./ecotrack-mutations', () => ({ assertNoUnresolvedEcotrackMutation: vi.fn() }));
vi.mock('./admin-orders-data', () => ({
  loadOrderDetail: async () => ({ id: 91 }),
}));
vi.mock('./reporting-refresh-trigger', () => ({
  triggerAdminReportingRefresh: mocks.reporting,
}));

import {
  AdminOrderHasActiveEcotrackShipmentError,
  deleteAdminOrder,
} from './admin-order-lifecycle';

it('refuses permanent local deletion while an EcoTrack shipment is active', async () => {
  const db = {
    query: {
      ecotrackOrderStates: { findFirst: async () => ({ trackingNumber: 'TRK-91' }) },
    },
    select: () => ({ from: () => ({ where: () => ({ for: async () => [{ id: 91 }] }) }) }),
    transaction: async (callback: (tx: unknown) => unknown) => callback(db),
  };
  await expect(
    deleteAdminOrder(db as never, 91, { email: 'admin@example.com' }),
  ).rejects.toBeInstanceOf(AdminOrderHasActiveEcotrackShipmentError);
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.reporting).not.toHaveBeenCalled();
});
