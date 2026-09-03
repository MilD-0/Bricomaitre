import { describe, expect, it, vi } from 'vitest';

import {
  saveAdminShoppingListDraft,
  ShoppingListDraftConflictError,
} from './shopping-list-drafts.server';

const payload = {
  sourceMode: 'selected' as const,
  orderIds: [32, 31, 31],
  title: 'Supplier run',
  draftItems: [],
  generatedItems: [],
  orders: [],
};

function row(revision: number) {
  return {
    id: 1,
    scopeKey: 'selected:31,32',
    revision,
    ...payload,
    orderIds: [31, 32],
    ordersSnapshot: [],
    createdBy: 'admin@example.com',
    createdByName: 'Admin',
    updatedBy: 'admin@example.com',
    updatedByName: 'Admin',
    createdAt: new Date('2026-09-04T00:00:00.000Z'),
    updatedAt: new Date('2026-09-04T00:00:00.000Z'),
  };
}

describe('shopping-list draft optimistic concurrency', () => {
  it('creates a new scope only when no draft already exists', async () => {
    const returning = vi.fn().mockResolvedValue([row(0)]);
    const onConflictDoNothing = vi.fn(() => ({ returning }));
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const db = { insert: vi.fn(() => ({ values })) };

    await expect(
      saveAdminShoppingListDraft(
        db as never,
        { ...payload, revision: null },
        { email: 'admin@example.com', name: 'Admin' },
        new Date('2026-09-04T00:00:00.000Z'),
      ),
    ).resolves.toMatchObject({ scopeKey: 'selected:31,32', revision: 0 });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ scopeKey: 'selected:31,32', orderIds: [31, 32] }),
    );
    expect(onConflictDoNothing).toHaveBeenCalledWith(expect.any(Object));
  });

  it('increments the exact current revision and rejects stale saves', async () => {
    const returning = vi
      .fn()
      .mockResolvedValueOnce([row(4)])
      .mockResolvedValueOnce([]);
    const where = vi.fn(() => ({ returning }));
    const set = vi.fn(() => ({ where }));
    const db = { update: vi.fn(() => ({ set })) };

    await expect(
      saveAdminShoppingListDraft(db as never, { ...payload, revision: 3 }),
    ).resolves.toMatchObject({ revision: 4 });
    await expect(
      saveAdminShoppingListDraft(db as never, { ...payload, revision: 3 }),
    ).rejects.toBeInstanceOf(ShoppingListDraftConflictError);
    expect(where).toHaveBeenCalledTimes(2);
  });
});
