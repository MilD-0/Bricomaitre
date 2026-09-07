import { marketingEventOutbox } from '@bric/db/schema';
import { and, asc, eq, inArray, lt, lte, or, sql } from 'drizzle-orm';
import {
  GOOGLE_MAX_AGE_MS,
  MAX_ATTEMPTS,
  PROCESSING_LEASE_MS,
  RETRY_DELAYS_MS,
  TIKTOK_MAX_AGE_MS,
  type Database,
} from './contract';
import { sendMarketingDestinationEvent } from './transport';

async function claimMarketingOutboxEvent(db: Database) {
  const now = new Date();
  const [row] = await db
    .update(marketingEventOutbox)
    .set({
      status: 'processing',
      attemptCount: sql`${marketingEventOutbox.attemptCount} + 1`,
      processingStartedAt: now,
      processingLeaseExpiresAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(
      inArray(
        marketingEventOutbox.id,
        db
          .select({ id: marketingEventOutbox.id })
          .from(marketingEventOutbox)
          .where(
            or(
              and(
                inArray(marketingEventOutbox.status, ['queued', 'retrying']),
                lte(marketingEventOutbox.nextAttemptAt, now),
              ),
              and(
                eq(marketingEventOutbox.status, 'processing'),
                lt(marketingEventOutbox.processingLeaseExpiresAt, now),
              ),
            ),
          )
          .orderBy(asc(marketingEventOutbox.nextAttemptAt), asc(marketingEventOutbox.id))
          .limit(1)
          .for('update', { skipLocked: true }),
      ),
    )
    .returning();
  return row;
}

export async function processMarketingOutboxBatch(db: Database, limit = 50) {
  const result = {
    claimed: 0,
    accepted: 0,
    rejected: 0,
    retrying: 0,
    exhausted: 0,
    dropped: 0,
  };
  // Claim only when ready to send; queued rows must not spend their lease waiting in memory.
  for (let index = 0; index < Math.max(1, Math.min(limit, 50)); index += 1) {
    const row = await claimMarketingOutboxEvent(db);
    if (!row) break;
    result.claimed += 1;
    const ownership = and(
      eq(marketingEventOutbox.id, row.id),
      eq(marketingEventOutbox.status, 'processing'),
      eq(marketingEventOutbox.attemptCount, row.attemptCount),
      eq(marketingEventOutbox.processingStartedAt, row.processingStartedAt!),
    );
    const maxAge = row.destination === 'google' ? GOOGLE_MAX_AGE_MS : TIKTOK_MAX_AGE_MS;
    if (row.eventTime.getTime() < Date.now() - maxAge) {
      const updated = await db
        .update(marketingEventOutbox)
        .set({
          status: 'dropped',
          processingLeaseExpiresAt: null,
          errorCode: 'delivery_window_expired',
          errorMessage: 'Event exceeded the destination delivery window.',
          payload: { redacted: true, eventName: row.eventName },
          updatedAt: new Date(),
        })
        .where(ownership)
        .returning({ id: marketingEventOutbox.id });
      result.dropped += updated.length;
      continue;
    }
    const sent = await sendMarketingDestinationEvent(row);
    const now = new Date();
    if (sent.ok) {
      const updated = await db
        .update(marketingEventOutbox)
        .set({
          status: 'accepted',
          deliveredAt: now,
          processingLeaseExpiresAt: null,
          lastHttpStatus: sent.status,
          providerRequestId: sent.requestId,
          responseSummary: sent.summary,
          payload: { redacted: true, eventName: row.eventName },
          updatedAt: now,
        })
        .where(ownership)
        .returning({ id: marketingEventOutbox.id });
      result.accepted += updated.length;
      continue;
    }
    const canRetry = sent.retryable && row.attemptCount < MAX_ATTEMPTS;
    const delay =
      RETRY_DELAYS_MS[Math.min(Math.max(row.attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
    const updated = await db
      .update(marketingEventOutbox)
      .set({
        status: canRetry ? 'retrying' : sent.retryable ? 'exhausted' : 'rejected',
        nextAttemptAt: canRetry
          ? new Date(now.getTime() + (sent.retryAfterMs ?? delay))
          : row.nextAttemptAt,
        processingLeaseExpiresAt: null,
        lastHttpStatus: sent.status,
        errorCode: sent.code,
        errorMessage: sent.message.slice(0, 2000),
        updatedAt: now,
      })
      .where(ownership)
      .returning({ id: marketingEventOutbox.id });
    if (canRetry) result.retrying += updated.length;
    else if (sent.retryable) result.exhausted += updated.length;
    else result.rejected += updated.length;
  }
  return result;
}
