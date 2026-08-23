import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-order-update', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-order-update')>()),
  updateAdminOrder: mocks.update,
}));

import { adminAiOrderStatusMutationSchema, updateAdminOrderStatuses } from './admin-ai-orders';
import { AdminOrderNotFoundError, AdminOrderStatusTransitionError } from './admin-order-update';

function order(confirmed: number, history: number[], noAnswerCount = 0) {
  return {
    confirmed,
    noAnswerCount,
    statusHistory: history.map((status, index) => ({ id: index + 1, status })),
  };
}

describe('admin AI order status updates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses semantic statuses while executing the canonical order workflow with actor history', async () => {
    mocks.update.mockResolvedValueOnce(order(2, [0, 2]));
    await expect(
      updateAdminOrderStatuses(
        { items: [{ orderId: 91, status: 'confirmed' }] },
        { email: 'admin@example.com', name: 'Admin' },
      ),
    ).resolves.toEqual({
      ok: true,
      items: [
        {
          orderId: 91,
          previousStatus: 0,
          status: 2,
          statusLabel: 'confirmed',
          noAnswerCount: 0,
        },
      ],
      skipped: [],
    });
    expect(mocks.update).toHaveBeenCalledWith(
      'database',
      91,
      { confirmed: 2 },
      { email: 'admin@example.com', name: 'Admin' },
    );
  });

  it('requires an exact counter for no-answer updates', () => {
    expect(
      adminAiOrderStatusMutationSchema.safeParse({
        items: [{ orderId: 91, status: 'no_answer' }],
      }).success,
    ).toBe(false);
    expect(
      adminAiOrderStatusMutationSchema.safeParse({
        items: [{ orderId: 91, status: 'no_answer', noAnswerCount: 2 }],
      }).success,
    ).toBe(true);
  });

  it('reports missing and invalid transitions without hiding successful rows', async () => {
    mocks.update
      .mockResolvedValueOnce(order(6, [0, 6]))
      .mockRejectedValueOnce(new AdminOrderNotFoundError(92))
      .mockRejectedValueOnce(new AdminOrderStatusTransitionError(8, 2));
    await expect(
      updateAdminOrderStatuses({
        items: [
          { orderId: 91, status: 'cancelled' },
          { orderId: 92, status: 'confirmed' },
          { orderId: 93, status: 'confirmed' },
        ],
      }),
    ).resolves.toEqual({
      ok: false,
      items: [
        {
          orderId: 91,
          previousStatus: 0,
          status: 6,
          statusLabel: 'cancelled',
          noAnswerCount: 0,
        },
      ],
      skipped: [
        { orderId: 92, reason: 'missing' },
        { orderId: 93, reason: 'invalid_transition', from: 8, to: 2 },
      ],
    });
  });
});
