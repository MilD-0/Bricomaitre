import { metaEventOutbox, orderMetaAttribution, orders } from '@bric/db/schema';
import {
  META_SEMANTICS_VERSION,
  type MetaBrowserEvent,
  type StorefrontOrderMetaResponse,
} from '../meta-contracts';
import {
  buildMetaUserData,
  getMetaMatchKeySummary,
  isValidFbc,
  isValidFbp,
  type MetaOrderLocation,
  type MetaRequestContext,
} from '../meta-identity';
import { buildMetaCommerceCustomData, resolveMetaCommerceLines } from './commerce';
import {
  type Database,
  type Executor,
  META_ATTRIBUTION_TTL_MS,
  type MetaCommerceLine,
  normalizeMetaEventTime,
  type Transaction,
} from './contract';

export async function insertMetaOutboxEvent(
  db: Executor,
  input: {
    eventName: string;
    eventId: string;
    source: string;
    orderId?: number | null;
    orderStatusHistoryId?: number | null;
    eventTime: Date;
    eventSourceUrl: string;
    userData: Record<string, unknown>;
    customData: Record<string, unknown>;
    status?: string;
  },
) {
  const [row] = await db
    .insert(metaEventOutbox)
    .values({
      eventName: input.eventName,
      eventId: input.eventId,
      source: input.source,
      orderId: input.orderId ?? null,
      orderStatusHistoryId: input.orderStatusHistoryId ?? null,
      eventTime: input.eventTime,
      eventSourceUrl: input.eventSourceUrl,
      userData: input.userData,
      customData: input.customData,
      matchKeySummary: getMetaMatchKeySummary(input.userData),
      status: input.status ?? 'pending',
      nextAttemptAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [metaEventOutbox.eventName, metaEventOutbox.eventId],
    })
    .returning();
  return row ?? null;
}

export async function enqueueMetaBrowserEvent(
  db: Database,
  event: MetaBrowserEvent,
  context: MetaRequestContext,
) {
  const normalizedTime = normalizeMetaEventTime(
    event.occurredAt ? new Date(event.occurredAt) : new Date(),
  );
  const usesCommerceLines = event.eventName !== 'PageView' && event.eventName !== 'Search';
  const lines = usesCommerceLines
    ? await resolveMetaCommerceLines(db, {
        items: event.items,
        promoCode: event.promoCode,
      })
    : [];
  const userData = buildMetaUserData({
    externalIdSource: context.externalIdSource ?? event.visitId ?? event.journeyId,
    fbc: context.fbc,
    fbp: context.fbp,
    clientIpAddress: context.clientIpAddress,
    clientUserAgent: context.clientUserAgent,
  });
  const customData =
    event.eventName === 'Search'
      ? { search_string: event.searchTerm }
      : event.eventName === 'PageView'
        ? {}
        : buildMetaCommerceCustomData(lines);
  const outbox = await insertMetaOutboxEvent(db, {
    eventName: event.eventName,
    eventId: event.eventId,
    source: 'browser',
    eventTime: normalizedTime.value,
    eventSourceUrl: event.eventSourceUrl,
    userData,
    customData,
    status: normalizedTime.kind === 'expired' ? 'skipped' : 'pending',
  });
  return {
    outbox,
    deduped: outbox === null,
    skipped: normalizedTime.kind === 'expired',
  };
}

export async function createOrderMetaArtifacts(
  tx: Transaction,
  input: {
    order: typeof orders.$inferSelect;
    lines: MetaCommerceLine[];
    eventId: string;
    eventSourceUrl: string;
    requestContext: MetaRequestContext;
    location?: MetaOrderLocation | null;
    now: Date;
  },
): Promise<StorefrontOrderMetaResponse> {
  const externalIdSource =
    input.requestContext.externalIdSource ??
    input.order.visitId ??
    input.order.journeyId ??
    input.eventId;
  const userData = buildMetaUserData({
    email: input.order.email,
    firstName: input.order.firstName,
    lastName: input.order.lastName,
    phone: input.order.phoneNumber1,
    city: input.order.city,
    state:
      input.location?.stateName ?? (input.order.state == null ? null : String(input.order.state)),
    postalCode: input.location?.postalCode,
    externalIdSource,
    fbc: input.requestContext.fbc,
    fbp: input.requestContext.fbp,
    clientIpAddress: input.requestContext.clientIpAddress,
    clientUserAgent: input.requestContext.clientUserAgent,
  });
  const customData = buildMetaCommerceCustomData(input.lines, input.order.id);
  const outbox = await insertMetaOutboxEvent(tx, {
    eventName: 'Purchase',
    eventId: input.eventId,
    source: 'order_submission',
    orderId: input.order.id,
    eventTime: input.now,
    eventSourceUrl: input.eventSourceUrl,
    userData,
    customData,
  });
  await tx
    .insert(orderMetaAttribution)
    .values({
      orderId: input.order.id,
      semanticsVersion: META_SEMANTICS_VERSION,
      leadEventId: input.eventId,
      eventSourceUrl: input.eventSourceUrl,
      fbc: isValidFbc(input.requestContext.fbc) ? input.requestContext.fbc!.trim() : null,
      fbp: isValidFbp(input.requestContext.fbp) ? input.requestContext.fbp!.trim() : null,
      externalIdSource,
      clientIpAddress: input.requestContext.clientIpAddress ?? null,
      clientUserAgent: input.requestContext.clientUserAgent ?? null,
      leadOutboxId: null,
      purchaseOutboxId: outbox?.id ?? null,
      expiresAt: new Date(input.now.getTime() + META_ATTRIBUTION_TTL_MS),
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: orderMetaAttribution.orderId });

  return {
    eventName: 'Purchase',
    eventId: input.eventId,
    value: Number(customData.value),
    currency: 'DZD',
    contents: customData.contents,
  };
}
