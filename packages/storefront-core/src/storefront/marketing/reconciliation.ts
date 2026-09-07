import { orderMarketingAttribution } from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import { ORDER_STATUS } from '../../orders-support';
import { MARKETING_SEMANTICS_VERSION } from '../marketing-contracts';
import { GOOGLE_MAX_AGE_MS, TIKTOK_MAX_AGE_MS, type Database } from './contract';
import { ensureMarketingOrderStatusEvents } from './enqueue';
import { isMarketingDestinationConfigured } from './payloads';

export async function reconcileMarketingOrderEvents(db: Database, limit = 100) {
  const googleCutoff = new Date(Date.now() - GOOGLE_MAX_AGE_MS);
  const tiktokCutoff = new Date(Date.now() - TIKTOK_MAX_AGE_MS);
  const result = await db.execute(sql`
    select history.id as history_id, history.order_id, history.status, history.changed_at
    from order_status_history history
    inner join order_marketing_attribution attribution on attribution.order_id = history.order_id
      and attribution.semantics_version = ${MARKETING_SEMANTICS_VERSION}
    where history.status in (${ORDER_STATUS.CONFIRMED}, ${ORDER_STATUS.COMPLETED}, ${ORDER_STATUS.MANUAL_COMPLETED})
      and (
        (${isMarketingDestinationConfigured('google')} and history.changed_at >= ${googleCutoff}
          and not exists (
            select 1 from marketing_event_outbox outbox
            where outbox.order_id = history.order_id and outbox.destination = 'google'
              and outbox.source = case when history.status = ${ORDER_STATUS.CONFIRMED} then 'order_confirmation' else 'order_completion' end
          ))
        or (${isMarketingDestinationConfigured('tiktok')} and history.changed_at >= ${tiktokCutoff}
          and not exists (
            select 1 from marketing_event_outbox outbox
            where outbox.order_id = history.order_id and outbox.destination = 'tiktok'
              and outbox.source = case when history.status = ${ORDER_STATUS.CONFIRMED} then 'order_confirmation' else 'order_completion' end
          ))
      )
      and not exists (
        select 1 from order_status_history earlier
        where earlier.order_id = history.order_id
          and (earlier.status = ${ORDER_STATUS.CONFIRMED}) = (history.status = ${ORDER_STATUS.CONFIRMED})
          and earlier.status in (${ORDER_STATUS.CONFIRMED}, ${ORDER_STATUS.COMPLETED}, ${ORDER_STATUS.MANUAL_COMPLETED})
          and (earlier.changed_at, earlier.id) < (history.changed_at, history.id)
      )
    order by history.changed_at asc, history.id asc
    limit ${Math.max(1, Math.min(limit, 500))}
  `);
  let created = 0;
  for (const row of result.rows as Array<{
    history_id: number | string;
    order_id: number | string;
    status: number;
    changed_at: Date | string;
  }>) {
    const outcome = await ensureMarketingOrderStatusEvents(db, {
      orderId: Number(row.order_id),
      statusHistoryId: Number(row.history_id),
      status: Number(row.status),
      changedAt: row.changed_at instanceof Date ? row.changed_at : new Date(row.changed_at),
    });
    if (outcome.created) created += 1;
  }
  return { marketingScanned: result.rows.length, marketingCreated: created };
}

export async function clearExpiredMarketingAttribution(db: Database) {
  const now = new Date();
  const cleared = await db
    .update(orderMarketingAttribution)
    .set({
      googleClientId: null,
      googleSessionId: null,
      gclid: null,
      gbraid: null,
      wbraid: null,
      tiktokClickId: null,
      tiktokCookieId: null,
      clientIpAddress: null,
      clientUserAgent: null,
      updatedAt: now,
    })
    .where(
      sql`
    ${orderMarketingAttribution.expiresAt} <= ${now}
    and (
      ${orderMarketingAttribution.googleClientId} is not null
      or ${orderMarketingAttribution.googleSessionId} is not null
      or ${orderMarketingAttribution.gclid} is not null
      or ${orderMarketingAttribution.gbraid} is not null
      or ${orderMarketingAttribution.wbraid} is not null
      or ${orderMarketingAttribution.tiktokClickId} is not null
      or ${orderMarketingAttribution.tiktokCookieId} is not null
      or ${orderMarketingAttribution.clientIpAddress} is not null
      or ${orderMarketingAttribution.clientUserAgent} is not null
    )
  `,
    )
    .returning({ orderId: orderMarketingAttribution.orderId });
  return { marketingAttributionCleared: cleared.length };
}
