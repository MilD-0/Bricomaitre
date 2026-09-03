import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { adminMutationIdempotency } from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;
export type AdminMutationTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class AdminMutationIdempotencyConflictError extends Error {
  constructor() {
    super('This request ID has already been used for a different operation.');
    this.name = 'AdminMutationIdempotencyConflictError';
  }
}

function hashRequest(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function runIdempotentAdminMutation<T>(
  db: Database,
  input: {
    scope: string;
    requestId: string;
    payload: unknown;
    execute: (tx: AdminMutationTransaction) => Promise<T>;
  },
) {
  const requestHash = hashRequest(input.payload);

  return db.transaction(async (tx) => {
    const [claim] = await tx
      .insert(adminMutationIdempotency)
      .values({ scope: input.scope, requestId: input.requestId, requestHash })
      .onConflictDoNothing({
        target: [adminMutationIdempotency.scope, adminMutationIdempotency.requestId],
      })
      .returning({ requestId: adminMutationIdempotency.requestId });

    if (!claim) {
      const [existing] = await tx
        .select({
          requestHash: adminMutationIdempotency.requestHash,
          response: adminMutationIdempotency.response,
        })
        .from(adminMutationIdempotency)
        .where(
          and(
            eq(adminMutationIdempotency.scope, input.scope),
            eq(adminMutationIdempotency.requestId, input.requestId),
          ),
        )
        .limit(1);

      if (!existing || existing.requestHash !== requestHash || existing.response == null) {
        throw new AdminMutationIdempotencyConflictError();
      }

      return { value: existing.response as T, replayed: true as const };
    }

    const value = await input.execute(tx);
    await tx
      .update(adminMutationIdempotency)
      .set({ response: value, completedAt: new Date() })
      .where(
        and(
          eq(adminMutationIdempotency.scope, input.scope),
          eq(adminMutationIdempotency.requestId, input.requestId),
        ),
      );

    return { value, replayed: false as const };
  });
}
