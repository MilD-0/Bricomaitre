import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  AdminMutationIdempotencyConflictError,
  runIdempotentAdminMutation,
} from './admin-mutation-idempotency';

function requestHash(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function database(options: {
  claimed: boolean;
  existing?: { requestHash: string; response: unknown };
}) {
  const returningClaim = vi
    .fn()
    .mockResolvedValue(options.claimed ? [{ requestId: 'request-1' }] : []);
  const insertedValues = vi.fn(() => ({
    onConflictDoNothing: vi.fn(() => ({ returning: returningClaim })),
  }));
  const selectLimit = vi.fn().mockResolvedValue(options.existing ? [options.existing] : []);
  const updatedWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updatedWhere }));
  const tx = {
    insert: vi.fn(() => ({ values: insertedValues })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: selectLimit })),
      })),
    })),
    update: vi.fn(() => ({ set: updateSet })),
  };
  const db = { transaction: vi.fn((callback) => callback(tx)) };
  return { db, tx, insertedValues, updateSet };
}

describe('admin mutation idempotency', () => {
  const payload = { mode: 'increase', items: [{ productId: 12, quantity: 2 }] };

  it('claims a request and commits its response in the same transaction', async () => {
    const fixture = database({ claimed: true });
    const execute = vi.fn().mockResolvedValue({ complete: true });

    await expect(
      runIdempotentAdminMutation(fixture.db as never, {
        scope: 'inventory-apply',
        requestId: 'request-1',
        payload,
        execute,
      }),
    ).resolves.toEqual({ value: { complete: true }, replayed: false });

    expect(execute).toHaveBeenCalledWith(fixture.tx);
    expect(fixture.insertedValues).toHaveBeenCalledWith({
      scope: 'inventory-apply',
      requestId: 'request-1',
      requestHash: requestHash(payload),
    });
    expect(fixture.updateSet).toHaveBeenCalledWith({
      response: { complete: true },
      completedAt: expect.any(Date),
    });
  });

  it('replays a completed response without executing the mutation again', async () => {
    const fixture = database({
      claimed: false,
      existing: { requestHash: requestHash(payload), response: { complete: true } },
    });
    const execute = vi.fn();

    await expect(
      runIdempotentAdminMutation(fixture.db as never, {
        scope: 'inventory-apply',
        requestId: 'request-1',
        payload,
        execute,
      }),
    ).resolves.toEqual({ value: { complete: true }, replayed: true });
    expect(execute).not.toHaveBeenCalled();
    expect(fixture.updateSet).not.toHaveBeenCalled();
  });

  it('rejects request-ID reuse with a different payload or incomplete response', async () => {
    for (const existing of [
      { requestHash: requestHash({ different: true }), response: { complete: true } },
      { requestHash: requestHash(payload), response: null },
    ]) {
      const fixture = database({ claimed: false, existing });
      await expect(
        runIdempotentAdminMutation(fixture.db as never, {
          scope: 'inventory-apply',
          requestId: 'request-1',
          payload,
          execute: vi.fn(),
        }),
      ).rejects.toBeInstanceOf(AdminMutationIdempotencyConflictError);
    }
  });
});
