import { describe, expect, it, vi } from 'vitest';

import {
  claimStorefrontOrderIdempotency,
  clearStorefrontOrderIdempotency,
} from './order-idempotency';
import { deleteExpiredOrderIdempotencyBatch } from './maintenance';

function createDb(options: {
  insertResults: unknown[][];
  selected?: unknown[];
  deleteResults?: unknown[][];
}) {
  const returningInsert = vi.fn();
  for (const result of options.insertResults) returningInsert.mockResolvedValueOnce(result);
  const returningDelete = vi.fn();
  for (const result of options.deleteResults ?? []) returningDelete.mockResolvedValueOnce(result);
  const whereDelete = vi.fn(() => ({ returning: returningDelete }));
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({ returning: returningInsert })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(options.selected ?? []) })),
      })),
    })),
    delete: vi.fn(() => ({ where: whereDelete })),
  };
  return { db, returningDelete, whereDelete };
}

describe('durable storefront order idempotency', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('claims a new request atomically', async () => {
    const { db } = createDb({ insertResults: [[{ keyHash: 'hash' }]] });

    await expect(
      claimStorefrontOrderIdempotency(db as never, {
        keyHash: 'hash',
        fingerprint: 'fingerprint',
        processingTtlSeconds: 120,
        now,
      }),
    ).resolves.toEqual({ kind: 'started' });
  });

  it('returns the committed order for a matching completed claim', async () => {
    const { db } = createDb({
      insertResults: [[]],
      selected: [
        {
          keyHash: 'hash',
          fingerprint: 'fingerprint',
          orderId: 42,
          metaResponse: { eventId: 'purchase-42' },
          expiresAt: new Date('2026-08-16T12:00:00.000Z'),
        },
      ],
    });

    await expect(
      claimStorefrontOrderIdempotency(db as never, {
        keyHash: 'hash',
        fingerprint: 'fingerprint',
        processingTtlSeconds: 120,
        now,
      }),
    ).resolves.toEqual({
      kind: 'completed',
      orderId: 42,
      metaResponse: { eventId: 'purchase-42' },
    });
  });

  it('reclaims an expired processing record once', async () => {
    const { db, returningDelete } = createDb({
      insertResults: [[], [{ keyHash: 'hash' }]],
      selected: [
        {
          keyHash: 'hash',
          fingerprint: 'fingerprint',
          orderId: null,
          metaResponse: null,
          expiresAt: new Date('2026-08-15T11:59:00.000Z'),
        },
      ],
      deleteResults: [[{ keyHash: 'hash' }]],
    });

    await expect(
      claimStorefrontOrderIdempotency(db as never, {
        keyHash: 'hash',
        fingerprint: 'fingerprint',
        processingTtlSeconds: 120,
        now,
      }),
    ).resolves.toEqual({ kind: 'started' });
    expect(returningDelete).toHaveBeenCalledOnce();
  });

  it('clears only an uncommitted matching claim', async () => {
    const { db, whereDelete } = createDb({ insertResults: [] });

    await clearStorefrontOrderIdempotency(db as never, {
      keyHash: 'hash',
      fingerprint: 'fingerprint',
    });

    expect(whereDelete).toHaveBeenCalledOnce();
  });

  it('deletes expired durable records in bounded maintenance batches', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ keyHash: 'one' }, { keyHash: 'two' }] });

    await expect(
      deleteExpiredOrderIdempotencyBatch({ execute } as never, {
        now,
        limit: 2,
      }),
    ).resolves.toBe(2);
    expect(execute).toHaveBeenCalledOnce();
  });
});
