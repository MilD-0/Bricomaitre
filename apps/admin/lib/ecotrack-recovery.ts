import { getDb } from '@bric/db/client';
import { ecotrackMutations, orders } from '@bric/db/schema';
import { getEcotrackTrackingInfo } from '@bric/storefront-core/ecotrack-client';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { ActionActor } from './action-history';
import { applySavedEcotrackMutation } from './ecotrack-mutation-apply';
import { ECOTRACK_MUTATION_TIMEOUT_MS, EcotrackMutationConflictError } from './ecotrack-mutations';
import { getEcotrackProviderEnv } from './ecotrack-provider';
import type { OrderRecord } from './orders';

export const ecotrackRecoveryRequestSchema = z.discriminatedUnion('action', [
  z.object({ operationId: z.uuid(), action: z.literal('apply_saved') }),
  z.object({
    operationId: z.uuid(),
    action: z.enum(['confirm_applied', 'confirm_not_applied']),
    trackingNumber: z.string().trim().max(160).optional(),
  }),
]);

export async function listEcotrackRecoveries(db = getDb()) {
  const rows = await db
    .select()
    .from(ecotrackMutations)
    .where(inArray(ecotrackMutations.state, ['pending', 'succeeded', 'uncertain']))
    .orderBy(asc(ecotrackMutations.createdAt));
  return rows.map((row) => {
    const record = row.request.record as OrderRecord | undefined;
    const payload = row.request.payload as Record<string, unknown> | undefined;
    return {
      id: row.id,
      orderId: row.orderId,
      kind: row.kind,
      provider: row.provider,
      trackingNumber: row.trackingNumber,
      state: row.state,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      canResolve: Date.now() >= row.createdAt.getTime() + ECOTRACK_MUTATION_TIMEOUT_MS,
      customer: record?.fullName ?? null,
      amount: record?.totalAmount ?? null,
      destination: record
        ? [record.state, record.city, record.homeAddress].filter(Boolean).join(', ')
        : null,
      phone: record?.phoneNumber1 ?? null,
      content: typeof row.request.content === 'string' ? row.request.content : null,
      products: typeof payload?.produit === 'string' ? payload.produit : null,
    };
  });
}
export type EcotrackRecoveryItem = Awaited<ReturnType<typeof listEcotrackRecoveries>>[number];

/** A timed-out mutation is never resent. An operator verifies its outcome at the carrier. */
export async function recoverEcotrackMutation(
  input: z.infer<typeof ecotrackRecoveryRequestSchema>,
  actor: ActionActor,
  db = getDb(),
) {
  const [operation] = await db
    .select()
    .from(ecotrackMutations)
    .where(eq(ecotrackMutations.id, input.operationId));
  if (!operation) throw new Error('Carrier operation not found.');
  if (operation.state === 'applied' || operation.state === 'rejected') return;
  if (input.action === 'apply_saved') {
    if (operation.state !== 'succeeded')
      throw new EcotrackMutationConflictError(
        operation.orderId,
        'No accepted carrier response is saved. Verify the outcome with the carrier first.',
      );
    await applySavedEcotrackMutation(db, operation);
    return;
  }
  if (operation.state === 'succeeded')
    throw new EcotrackMutationConflictError(
      operation.orderId,
      'An accepted carrier response is saved. Apply that response.',
    );
  if (Date.now() < operation.createdAt.getTime() + ECOTRACK_MUTATION_TIMEOUT_MS)
    throw new EcotrackMutationConflictError(
      operation.orderId,
      'The carrier request is still within its response window. Wait before resolving it.',
    );
  let response: Record<string, unknown> = { success: input.action === 'confirm_applied' };
  if (
    input.action === 'confirm_applied' &&
    (operation.kind === 'post' || operation.kind === 'recreate')
  ) {
    if (!input.trackingNumber || input.trackingNumber === operation.trackingNumber)
      throw new Error('Provide the tracking number created by this operation.');
    const provider = operation.provider === 'emir' ? 'emir' : 'delivro';
    const result = await getEcotrackTrackingInfo(input.trackingNumber, {
      env: getEcotrackProviderEnv(provider),
    });
    const orderInfo = result.data.OrderInfo;
    if (
      orderInfo?.tracking !== input.trackingNumber ||
      String(orderInfo.reference) !== String(operation.orderId)
    )
      throw new Error('This tracking number does not match the order reference at the carrier.');
    response = {
      success: true,
      tracking: input.trackingNumber,
      message: null,
      raw: result.payload,
    };
  }
  const saved = await db.transaction(async (tx) => {
    await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, operation.orderId))
      .for('update');
    const [current] = await tx
      .select()
      .from(ecotrackMutations)
      .where(eq(ecotrackMutations.id, operation.id))
      .for('update');
    if (!current || !['pending', 'uncertain'].includes(current.state))
      throw new EcotrackMutationConflictError(
        operation.orderId,
        'The operation changed. Refresh recovery.',
      );
    const [updated] = await tx
      .update(ecotrackMutations)
      .set({
        state: input.action === 'confirm_applied' ? 'succeeded' : 'rejected',
        response: {
          ...response,
          recovery: {
            actor,
            resolvedAt: new Date().toISOString(),
          },
        },
        error: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(ecotrackMutations.id, operation.id), eq(ecotrackMutations.state, current.state)),
      )
      .returning();
    return updated!;
  });
  if (saved.state === 'succeeded') await applySavedEcotrackMutation(db, saved);
}
