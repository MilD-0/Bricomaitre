import { beforeEach, expect, it, vi } from 'vitest';
import { ORDER_STATUS } from './orders';
import { dispatchPostedEcotrackOrder } from './admin-ecotrack-orders-actions';
import { getActionFlags } from './admin-ecotrack-shipment-view';

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  fresh: vi.fn(),
  load: vi.fn(),
  detail: vi.fn(),
  claim: vi.fn(),
  record: vi.fn(),
  apply: vi.fn(),
  capture: vi.fn(),
  uncertain: vi.fn(),
}));
vi.mock('@bric/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@bric/storefront-core/ecotrack-client', async (original) => ({
  ...(await original<object>()),
  dispatchEcotrackOrder: mocks.dispatch,
}));
vi.mock('./admin-ecotrack-shipment-state', async (original) => ({
  ...(await original<object>()),
  ensureFreshShipmentRow: mocks.fresh,
}));
vi.mock('./admin-ecotrack-shipment-view', async (original) => ({
  ...(await original<object>()),
  loadShipmentRowByOrderId: mocks.load,
  buildEcotrackOrderDetailFromRow: mocks.detail,
}));
vi.mock('./ecotrack-shipment-evidence', async (original) => ({
  ...(await original<object>()),
  providerRequestOptions: () => ({}),
}));
vi.mock('./ecotrack-mutation-apply', () => ({ applySavedEcotrackMutation: mocks.apply }));
vi.mock('./ecotrack-mutations', async (original) => ({
  ...(await original<object>()),
  claimEcotrackMutation: mocks.claim,
  recordEcotrackMutationResult: mocks.record,
  markEcotrackMutationUncertain: mocks.uncertain,
}));
vi.mock('./sentry', () => ({ captureAdminException: mocks.capture }));

const row = {
  order: { id: 7, updatedAt: new Date(), inHouseStatus: ORDER_STATUS.POSTED },
  trackingNumber: 'EMD7',
  currentStatus: 'prete_a_expedier',
  deletedAt: null,
  provider: 'emir',
};
const operation = { id: 'accepted-dispatch', createdAt: new Date() };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue(row);
  mocks.fresh.mockResolvedValue(undefined);
  mocks.claim.mockResolvedValue(operation);
  mocks.dispatch.mockResolvedValue({ success: true, payload: { success: true } });
  mocks.record.mockResolvedValue(operation);
  mocks.apply.mockImplementation(async () => {
    mocks.load.mockResolvedValue({
      ...row,
      order: { ...row.order, inHouseStatus: ORDER_STATUS.DISPATCHED },
    });
  });
});

it('returns fresh carrier status and actions after accepted dispatch', async () => {
  const refreshed = {
    status: { currentStatus: 'en_ramassage' },
    ...getActionFlags('en_ramassage', null, ORDER_STATUS.DISPATCHED),
  };
  mocks.fresh.mockResolvedValueOnce(undefined).mockResolvedValueOnce(refreshed);
  const result = await dispatchPostedEcotrackOrder(7, { askCollection: true }, {});
  expect(result).toEqual(refreshed);
  expect(result).toMatchObject({ canDispatch: false, canEdit: false, canDelete: false });
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(mocks.dispatch).toHaveBeenCalledOnce();
  expect(mocks.fresh).toHaveBeenCalledTimes(2);
});

it('keeps accepted dispatch successful with safe actions if the subsequent status read fails', async () => {
  mocks.fresh
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('status unavailable'));
  mocks.detail.mockImplementation(async (_db, current) => ({
    status: { currentStatus: current.currentStatus, isStatusStale: true },
    ...getActionFlags(current.currentStatus, current.deletedAt, current.order.inHouseStatus),
  }));
  const result = await dispatchPostedEcotrackOrder(7, { askCollection: false }, {});
  expect(result).toMatchObject({
    canDispatch: false,
    canEdit: false,
    canDelete: false,
    status: { isStatusStale: true },
  });
  expect(mocks.dispatch).toHaveBeenCalledOnce();
  expect(mocks.apply).toHaveBeenCalledOnce();
  expect(mocks.uncertain).not.toHaveBeenCalled();
  expect(mocks.capture).toHaveBeenCalledOnce();
});

it('uses fresh carrier-ready evidence even when the local order is Dispatched', () => {
  expect(
    getActionFlags('prete_a_expedier', null, ORDER_STATUS.DISPATCHED, new Date()),
  ).toMatchObject({
    canEdit: true,
    canDelete: true,
    canDispatch: true,
  });
  for (const observedAt of [null, new Date(0)]) {
    expect(
      getActionFlags('prete_a_expedier', null, ORDER_STATUS.DISPATCHED, observedAt),
    ).toMatchObject({
      canEdit: false,
      canDelete: false,
      canDispatch: false,
    });
  }
});
