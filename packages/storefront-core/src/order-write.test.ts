import { describe, expect, it, vi } from 'vitest';

import { orderLineItems, orderStatusHistory, orders } from '@bric/db/schema';

import { InvalidOrderStatusTransitionError } from './orders-support';
import { updateCanonicalOrder } from './order-write';

function createTransaction(current: Record<string, unknown>) {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: unknown; values: unknown }> = [];
  const deletes: unknown[] = [];
  const tx = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ for: vi.fn().mockResolvedValue([current]) })),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            updates.push({ table, values });
            return [{ ...current, ...values }];
          }),
        })),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn(async (values: unknown) => {
        inserts.push({ table, values });
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(async () => {
        deletes.push(table);
      }),
    })),
  };
  return { tx, updates, inserts, deletes };
}

function currentOrder(status = 2) {
  return {
    id: 7,
    confirmed: status,
    noAnswerCount: 0,
    confirmedAt: null,
    confirmedBy: null,
    confirmedByName: null,
  };
}

describe('canonical order updates', () => {
  it('serializes valid status transitions and writes exactly one history event', async () => {
    const { tx, updates, inserts } = createTransaction(currentOrder());
    const now = new Date('2026-08-18T10:00:00.000Z');

    const result = await updateCanonicalOrder(tx as never, {
      orderId: 7,
      status: { value: 11, noAnswerCount: 0 },
      actor: { email: 'ops@example.com', name: 'Ops' },
      now,
    });

    expect(result.statusChanged).toBe(true);
    expect(updates).toEqual([
      expect.objectContaining({
        table: orders,
        values: expect.objectContaining({
          confirmed: 11,
          noAnswerCount: 0,
          confirmedAt: now,
          confirmedBy: 'ops@example.com',
        }),
      }),
    ]);
    expect(inserts).toEqual([
      {
        table: orderStatusHistory,
        values: expect.objectContaining({ orderId: 7, status: 11, changedAt: now }),
      },
    ]);
  });

  it('rejects terminal-state reversals before writing anything', async () => {
    const { tx, updates, inserts } = createTransaction(currentOrder(4));

    await expect(
      updateCanonicalOrder(tx as never, {
        orderId: 7,
        status: { value: 2 },
      }),
    ).rejects.toBeInstanceOf(InvalidOrderStatusTransitionError);
    expect(updates).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it('regenerates commercial snapshots and persists canonical totals with an explicit override', async () => {
    const { tx, updates, inserts, deletes } = createTransaction(currentOrder());
    const line = {
      productId: 9,
      contentId: '9',
      rawValue: '9',
      title: 'Drill',
      originalUnitPrice: 1500,
      effectiveUnitPrice: 1400,
      unitPurchasePrice: 900,
      quantity: 1,
      discountAmount: 100,
      lineTotal: 1400,
      thumbnailUrl: null,
    };

    await updateCanonicalOrder(tx as never, {
      orderId: 7,
      commercial: {
        cartProducts: ['9'],
        lines: [line],
        promo: null,
        productSubtotal: 1400,
        originalProductSubtotal: 1500,
        discountAmount: 100,
      },
      deliveryFee: 400,
      totals: { productSubtotal: 1400, deliveryFee: 400, subtotalOverride: 1300 },
    });

    expect(updates[0]?.values).toMatchObject({
      cartProducts: ['9'],
      productSubtotal: '1400.00',
      price: '1300.00',
      totalAmount: '1700.00',
    });
    expect(deletes).toEqual([orderLineItems]);
    expect(inserts).toContainEqual(
      expect.objectContaining({
        table: orderLineItems,
        values: [expect.objectContaining({ titleSnapshot: 'Drill', lineTotal: '1400.00' })],
      }),
    );
  });
});
