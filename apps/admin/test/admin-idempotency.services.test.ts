import { randomUUID } from 'node:crypto';
import { getDb, getPool } from '@bric/db/client';
import { adminMutationIdempotency, products } from '@bric/db/schema';
import { eq } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import {
  AdminMutationIdempotencyConflictError,
  type AdminMutationTransaction,
  runIdempotentAdminMutation,
} from '../lib/admin-mutation-idempotency';

afterAll(() => getPool().end());

it('commits one concurrent request, replays its result and releases failed claims with their writes', async () => {
  const db = getDb();
  const scope = `idempotency-${randomUUID()}`;
  const payload = { title: 'Concurrent creation', slug: scope, price: '100' };
  const request = {
    scope,
    requestId: 'create',
    payload,
    execute: async (tx: AdminMutationTransaction) => {
      const [product] = await tx.insert(products).values(payload).returning({ id: products.id });
      return { id: product!.id };
    },
  };
  try {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => runIdempotentAdminMutation(db, request)),
    );
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => result.value.id)).size).toBe(1);
    expect(await db.select().from(products).where(eq(products.slug, scope))).toHaveLength(1);
    await expect(
      runIdempotentAdminMutation(db, { ...request, payload: { ...payload, price: '200' } }),
    ).rejects.toBeInstanceOf(AdminMutationIdempotencyConflictError);
    await db.delete(products).where(eq(products.slug, scope));
    await db.delete(adminMutationIdempotency).where(eq(adminMutationIdempotency.scope, scope));

    await expect(
      runIdempotentAdminMutation(db, {
        ...request,
        execute: async (tx) => {
          await request.execute(tx);
          throw new Error('Mutation failed after writing');
        },
      }),
    ).rejects.toThrow('Mutation failed after writing');
    expect(await db.select().from(products).where(eq(products.slug, scope))).toHaveLength(0);
    expect(
      await db
        .select()
        .from(adminMutationIdempotency)
        .where(eq(adminMutationIdempotency.scope, scope)),
    ).toHaveLength(0);
    expect((await runIdempotentAdminMutation(db, request)).replayed).toBe(false);
    expect((await runIdempotentAdminMutation(db, request)).replayed).toBe(true);
    expect(await db.select().from(products).where(eq(products.slug, scope))).toHaveLength(1);
  } finally {
    await db.delete(products).where(eq(products.slug, scope));
    await db.delete(adminMutationIdempotency).where(eq(adminMutationIdempotency.scope, scope));
  }
});
