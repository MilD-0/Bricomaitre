import type { getDb } from '@bric/db/client';
import { ecotrackMutations, orders } from '@bric/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { ActionActor } from './action-history';

type Database = ReturnType<typeof getDb>;
export type CarrierTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type CarrierMutation = typeof ecotrackMutations.$inferSelect;
export type CarrierMutationKind =
  'post' | 'update' | 'recreate' | 'delete' | 'dispatch' | 'maj' | 'return';
export const ECOTRACK_MUTATION_TIMEOUT_MS = 120_000;
const unresolvedStates = ['pending', 'succeeded', 'uncertain'];

export class EcotrackMutationConflictError extends Error {
  constructor(
    readonly orderId: number,
    message = 'A carrier operation needs recovery before this order can change. Open the carrier recovery action.',
  ) {
    super(message);
    this.name = 'EcotrackMutationConflictError';
  }
}

export async function loadUnresolvedEcotrackMutation(
  db: Database | CarrierTransaction,
  orderId: number,
) {
  const [operation] = await db
    .select({ id: ecotrackMutations.id })
    .from(ecotrackMutations)
    .where(
      and(
        eq(ecotrackMutations.orderId, orderId),
        inArray(ecotrackMutations.state, unresolvedStates),
      ),
    )
    .limit(1);
  return operation ?? null;
}

/** Call after locking the order so claims, edits, deletion and recovery serialize. */
export async function assertNoUnresolvedEcotrackMutation(tx: CarrierTransaction, orderId: number) {
  if (await loadUnresolvedEcotrackMutation(tx, orderId))
    throw new EcotrackMutationConflictError(orderId);
}

export async function claimEcotrackMutation(
  db: Database,
  input: {
    orderId: number;
    orderUpdatedAt: Date;
    kind: CarrierMutationKind;
    provider: 'delivro' | 'emir';
    trackingNumber?: string | null;
    request: Record<string, unknown>;
    actor: ActionActor;
  },
) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .for('update');
    if (!order || order.updatedAt.getTime() !== input.orderUpdatedAt.getTime()) {
      throw new EcotrackMutationConflictError(
        input.orderId,
        'This order changed. Refresh it before sending a carrier request.',
      );
    }
    await assertNoUnresolvedEcotrackMutation(tx, input.orderId);
    const [operation] = await tx
      .insert(ecotrackMutations)
      .values({
        ...input,
        id: randomUUID(),
        request: JSON.parse(JSON.stringify(input.request)),
      })
      .returning();
    return operation!;
  });
}

export async function recordEcotrackMutationResult(
  db: Database,
  operation: CarrierMutation,
  response: Record<string, unknown>,
  succeeded: boolean,
) {
  const [saved] = await db
    .update(ecotrackMutations)
    .set({
      response,
      state: succeeded ? 'succeeded' : 'rejected',
      updatedAt: new Date(),
      error: null,
    })
    .where(
      and(
        eq(ecotrackMutations.id, operation.id),
        inArray(ecotrackMutations.state, ['pending', 'uncertain']),
      ),
    )
    .returning();
  if (!saved) throw new EcotrackMutationConflictError(operation.orderId);
  return saved;
}

export async function markEcotrackMutationUncertain(
  db: Database,
  operation: CarrierMutation,
  error: unknown,
) {
  await db
    .update(ecotrackMutations)
    .set({
      state: 'uncertain',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date(),
    })
    .where(and(eq(ecotrackMutations.id, operation.id), eq(ecotrackMutations.state, 'pending')));
}

export async function applyEcotrackMutation<T>(
  db: Database,
  operation: CarrierMutation,
  apply: (tx: CarrierTransaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, operation.orderId))
      .for('update');
    const [current] = await tx
      .select()
      .from(ecotrackMutations)
      .where(eq(ecotrackMutations.id, operation.id))
      .for('update');
    if (current?.state === 'applied') return null;
    if (
      !order ||
      current?.state !== 'succeeded' ||
      order.updatedAt.getTime() !== operation.orderUpdatedAt.getTime()
    ) {
      throw new EcotrackMutationConflictError(
        operation.orderId,
        'The carrier response is saved, but the local order needs reconciliation. Open carrier recovery.',
      );
    }
    const result = await apply(tx);
    await tx
      .update(ecotrackMutations)
      .set({ state: 'applied', error: null, updatedAt: new Date() })
      .where(eq(ecotrackMutations.id, operation.id));
    return result;
  });
}
