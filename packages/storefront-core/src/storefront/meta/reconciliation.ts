import { metaEventOutbox, orderLineItems, orderMetaAttribution, orders } from '@bric/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { ORDER_STATUS } from '../../orders-support';
import { META_SEMANTICS_VERSION } from '../meta-contracts';
import { buildMetaUserData } from '../meta-identity';
import { buildMetaCommerceCustomData, lineRowToCommerceLine } from './commerce';
import {
  getOrderCompletedEventId,
  getOrderConfirmedEventId,
  isMetaCompletedStatus,
  isMetaOrderConfirmedStatus,
  META_EVENT_MAX_AGE_MS,
  META_ORDER_COMPLETED_EVENT_NAME,
  META_ORDER_CONFIRMED_EVENT_NAME,
  normalizeMetaEventTime,
  type Database,
  type MetaOrderStatusInput,
} from './contract';
import { insertMetaOutboxEvent } from './enqueue';

export async function ensureOrderConfirmedEventForOrder(db: Database, input: MetaOrderStatusInput) {
  return ensureMetaOrderStatusEvent(db, input, 'confirmed');
}

export async function ensureOrderCompletedEventForOrder(db: Database, input: MetaOrderStatusInput) {
  return ensureMetaOrderStatusEvent(db, input, 'completed');
}

async function ensureMetaOrderStatusEvent(
  db: Database,
  input: MetaOrderStatusInput,
  kind: 'confirmed' | 'completed',
) {
  const qualified =
    kind === 'confirmed'
      ? isMetaOrderConfirmedStatus(input.status)
      : isMetaCompletedStatus(input.status);
  if (!qualified) return { created: false, reason: 'unqualified' as const };
  const normalizedTime = normalizeMetaEventTime(input.changedAt);
  if (normalizedTime.kind === 'expired') return { created: false, reason: 'expired' as const };
  const eventName =
    kind === 'confirmed' ? META_ORDER_CONFIRMED_EVENT_NAME : META_ORDER_COMPLETED_EVENT_NAME;
  const [attribution] = await db
    .select()
    .from(orderMetaAttribution)
    .where(
      and(
        eq(orderMetaAttribution.orderId, input.orderId),
        eq(orderMetaAttribution.semanticsVersion, META_SEMANTICS_VERSION),
      ),
    )
    .limit(1);
  if (!attribution) return { created: false, reason: 'legacy' as const };
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) return { created: false, reason: 'missing_order' as const };

  const eventId =
    kind === 'confirmed'
      ? getOrderConfirmedEventId(input.orderId)
      : getOrderCompletedEventId(input.orderId);
  const [existingEvent] = await db
    .select({
      id: metaEventOutbox.id,
    })
    .from(metaEventOutbox)
    .where(and(eq(metaEventOutbox.eventName, eventName), eq(metaEventOutbox.eventId, eventId)))
    .limit(1);
  if (existingEvent) {
    return {
      created: false,
      reason: 'deduped' as const,
      outboxId: existingEvent.id,
      eventId,
    };
  }

  // Advertising events consume the saved commercial record, even after catalog changes.
  const lineRows = await db
    .select()
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, input.orderId));
  const lines = lineRows
    .map(lineRowToCommerceLine)
    .filter((line) => Number.isInteger(line.productId));
  if (lines.length === 0) return { created: false, reason: 'missing_lines' as const };

  const userData = buildMetaUserData({
    email: order.email,
    firstName: order.firstName,
    lastName: order.lastName,
    phone: order.phoneNumber1,
    city: order.city,
    state: order.state == null ? null : String(order.state),
    externalIdSource: attribution.externalIdSource,
    fbc: attribution.fbc,
    fbp: attribution.fbp,
    clientIpAddress: attribution.clientIpAddress,
    clientUserAgent: attribution.clientUserAgent,
  });
  const customData = {
    ...buildMetaCommerceCustomData(lines, order.id),
    order_status: input.status,
  };
  const outbox = await insertMetaOutboxEvent(db, {
    eventName: eventName,
    eventId,
    source: kind === 'confirmed' ? 'order_confirmation' : 'order_completion',
    orderId: order.id,
    orderStatusHistoryId: input.statusHistoryId,
    eventTime: normalizedTime.value,
    eventSourceUrl: attribution.eventSourceUrl,
    userData,
    customData,
    status: 'pending',
  });
  if (!outbox) {
    return {
      created: false,
      reason: 'deduped' as const,
      eventId,
    };
  }
  return { created: true, outboxId: outbox.id, eventId };
}

export async function reconcileOrderConfirmedEvents(db: Database, limit = 100) {
  const cutoff = new Date(Date.now() - META_EVENT_MAX_AGE_MS);
  const result = await db.execute(sql`
    select distinct on (history.order_id)
      history.id as history_id,
      history.order_id,
      history.status,
      history.changed_at
    from order_status_history history
    inner join order_meta_attribution attribution
      on attribution.order_id = history.order_id
      and attribution.semantics_version = ${META_SEMANTICS_VERSION}
    where history.status = ${ORDER_STATUS.CONFIRMED}
      and history.changed_at >= ${cutoff}
      and not exists (
        select 1 from order_status_history earlier
        where earlier.order_id = history.order_id
          and earlier.status = ${ORDER_STATUS.CONFIRMED}
          and (earlier.changed_at, earlier.id) < (history.changed_at, history.id)
      )
      and not exists (
        select 1
        from meta_event_outbox outbox
        where outbox.order_id = history.order_id
          and outbox.event_name = ${META_ORDER_CONFIRMED_EVENT_NAME}
      )
    order by history.order_id asc, history.changed_at asc, history.id asc
    limit ${Math.max(1, Math.min(limit, 500))}
  `);
  const rows = result.rows as Array<{
    history_id: number | string;
    order_id: number | string;
    status: number;
    changed_at: Date | string;
  }>;
  let created = 0;
  for (const row of rows) {
    const outcome = await ensureOrderConfirmedEventForOrder(db, {
      orderId: Number(row.order_id),
      statusHistoryId: Number(row.history_id),
      status: Number(row.status),
      changedAt: row.changed_at instanceof Date ? row.changed_at : new Date(row.changed_at),
    });
    if (outcome.created) created += 1;
  }
  return { confirmationScanned: rows.length, confirmationCreated: created };
}

export async function reconcileOrderCompletedEvents(db: Database, limit = 100) {
  const cutoff = new Date(Date.now() - META_EVENT_MAX_AGE_MS);
  const result = await db.execute(sql`
    select distinct on (history.order_id)
      history.id as history_id,
      history.order_id,
      history.status,
      history.changed_at
    from order_status_history history
    inner join order_meta_attribution attribution
      on attribution.order_id = history.order_id
      and attribution.semantics_version = ${META_SEMANTICS_VERSION}
    where history.status in (${ORDER_STATUS.COMPLETED}, ${ORDER_STATUS.MANUAL_COMPLETED})
      and history.changed_at >= ${cutoff}
      and not exists (
        select 1 from order_status_history earlier
        where earlier.order_id = history.order_id
          and earlier.status in (${ORDER_STATUS.COMPLETED}, ${ORDER_STATUS.MANUAL_COMPLETED})
          and (earlier.changed_at, earlier.id) < (history.changed_at, history.id)
      )
      and not exists (
        select 1
        from meta_event_outbox outbox
        where outbox.order_id = history.order_id
          and outbox.event_name = ${META_ORDER_COMPLETED_EVENT_NAME}
      )
    order by history.order_id asc, history.changed_at asc, history.id asc
    limit ${Math.max(1, Math.min(limit, 500))}
  `);
  const rows = result.rows as Array<{
    history_id: number | string;
    order_id: number | string;
    status: number;
    changed_at: Date | string;
  }>;
  let created = 0;
  for (const row of rows) {
    const outcome = await ensureOrderCompletedEventForOrder(db, {
      orderId: Number(row.order_id),
      statusHistoryId: Number(row.history_id),
      status: Number(row.status),
      changedAt: row.changed_at instanceof Date ? row.changed_at : new Date(row.changed_at),
    });
    if (outcome.created) created += 1;
  }
  return { completionScanned: rows.length, completionCreated: created };
}

export async function clearExpiredMetaAttribution(db: Database) {
  const now = new Date();
  const result = await db
    .update(orderMetaAttribution)
    .set({
      fbc: null,
      fbp: null,
      externalIdSource: null,
      clientIpAddress: null,
      clientUserAgent: null,
      updatedAt: now,
    })
    .where(
      sql`${orderMetaAttribution.expiresAt} <= ${now}
    and (
      ${orderMetaAttribution.externalIdSource} is not null
      or ${orderMetaAttribution.fbc} is not null
      or ${orderMetaAttribution.fbp} is not null
      or ${orderMetaAttribution.clientIpAddress} is not null
      or ${orderMetaAttribution.clientUserAgent} is not null
    )`,
    )
    .returning({ orderId: orderMetaAttribution.orderId });
  return { cleared: result.length };
}
