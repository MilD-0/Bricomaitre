import { metaEventOutbox, metaWorkerHeartbeat } from '@bric/db/schema';
import { and, asc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import {
  type Database,
  META_EVENT_MAX_AGE_MS,
  META_MAX_ATTEMPTS,
  META_PROCESSING_LEASE_MS,
  META_RETRY_DELAYS_MS,
} from './contract';
import { sendMetaEvent } from './transport';

async function claimMetaOutboxEvent(db: Database) {
  const now = new Date();
  const [row] = await db
    .update(metaEventOutbox)
    .set({
      status: 'processing',
      attemptCount: sql`${metaEventOutbox.attemptCount} + 1`,
      processingStartedAt: now,
      processingLeaseExpiresAt: new Date(now.getTime() + META_PROCESSING_LEASE_MS),
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(
      inArray(
        metaEventOutbox.id,
        db
          .select({ id: metaEventOutbox.id })
          .from(metaEventOutbox)
          .where(
            or(
              and(
                inArray(metaEventOutbox.status, ['pending', 'retryable']),
                lte(metaEventOutbox.nextAttemptAt, now),
              ),
              and(
                eq(metaEventOutbox.status, 'processing'),
                lt(metaEventOutbox.processingLeaseExpiresAt, now),
              ),
            ),
          )
          .orderBy(asc(metaEventOutbox.nextAttemptAt), asc(metaEventOutbox.id))
          .limit(1)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();
  return row;
}

function retryDelayMs(attemptCount: number) {
  return META_RETRY_DELAYS_MS[
    Math.min(Math.max(attemptCount - 1, 0), META_RETRY_DELAYS_MS.length - 1)
  ];
}

export async function processMetaOutboxBatch(db: Database, limit = 50) {
  let claimed = 0;
  let delivered = 0;
  let retryable = 0;
  let failed = 0;
  let skipped = 0;

  // Claim only when ready to send; queued rows must not spend their lease waiting in memory.
  for (let index = 0; index < Math.max(1, Math.min(limit, 50)); index += 1) {
    const row = await claimMetaOutboxEvent(db);
    if (!row) break;
    claimed += 1;
    const ownership = and(
      eq(metaEventOutbox.id, row.id),
      eq(metaEventOutbox.status, 'processing'),
      eq(metaEventOutbox.attemptCount, row.attemptCount),
      eq(metaEventOutbox.processingStartedAt, row.processingStartedAt!),
    );
    if (row.eventTime.getTime() < Date.now() - META_EVENT_MAX_AGE_MS) {
      const updated = await db
        .update(metaEventOutbox)
        .set({
          status: 'skipped',
          metaErrorMessage: "Event exceeded Meta's seven-day delivery window.",
          processingLeaseExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(ownership)
        .returning({ id: metaEventOutbox.id });
      skipped += updated.length;
      continue;
    }
    const result = await sendMetaEvent(row);
    const now = new Date();
    if (result.ok) {
      const updated = await db
        .update(metaEventOutbox)
        .set({
          status: 'delivered',
          deliveredAt: now,
          processingLeaseExpiresAt: null,
          lastHttpStatus: result.status,
          fbtraceId: result.fbtraceId,
          eventsReceived: result.eventsReceived,
          userData: {},
          updatedAt: now,
        })
        .where(ownership)
        .returning({ id: metaEventOutbox.id });
      delivered += updated.length;
      continue;
    }
    const canRetry =
      result.retryable &&
      row.attemptCount < META_MAX_ATTEMPTS &&
      row.eventTime.getTime() + META_EVENT_MAX_AGE_MS > now.getTime();
    const updated = await db
      .update(metaEventOutbox)
      .set({
        status: canRetry ? 'retryable' : 'failed',
        nextAttemptAt: canRetry
          ? new Date(now.getTime() + (result.retryAfterMs ?? retryDelayMs(row.attemptCount)))
          : row.nextAttemptAt,
        processingLeaseExpiresAt: null,
        lastHttpStatus: result.status,
        metaErrorCode: result.code,
        metaErrorSubcode: result.subcode,
        metaErrorMessage: result.message.slice(0, 2000),
        fbtraceId: result.fbtraceId,
        updatedAt: now,
      })
      .where(ownership)
      .returning({ id: metaEventOutbox.id });
    if (canRetry) retryable += updated.length;
    else failed += updated.length;
  }
  return { claimed, delivered, retryable, failed, skipped };
}

export async function updateMetaWorkerHeartbeat(
  db: Database,
  input: {
    successfulDrain?: boolean;
    reconciliationResult?: Record<string, unknown>;
  } = {},
) {
  const now = new Date();
  const workerKey = 'storefront-meta-worker';
  await db
    .insert(metaWorkerHeartbeat)
    .values({
      workerKey,
      release: process.env.SENTRY_RELEASE?.trim() || null,
      lastHeartbeatAt: now,
      lastSuccessfulDrainAt: input.successfulDrain ? now : null,
      lastReconciliationAt: input.reconciliationResult ? now : null,
      lastReconciliationResult: input.reconciliationResult ?? {},
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: metaWorkerHeartbeat.workerKey,
      set: {
        release: process.env.SENTRY_RELEASE?.trim() || null,
        lastHeartbeatAt: now,
        ...(input.successfulDrain ? { lastSuccessfulDrainAt: now } : {}),
        ...(input.reconciliationResult
          ? {
              lastReconciliationAt: now,
              lastReconciliationResult: input.reconciliationResult,
            }
          : {}),
        updatedAt: now,
      },
    });
}
