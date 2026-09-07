export {
  META_ORDER_CONFIRMED_STATUSES,
  META_COMPLETED_STATUSES,
  META_ORDER_CONFIRMED_EVENT_NAME,
  META_ORDER_COMPLETED_EVENT_NAME,
  META_EVENT_MAX_AGE_MS,
  type MetaCommerceLine,
  type MetaProductDimension,
  getOrderConfirmedEventId,
  getOrderCompletedEventId,
  isMetaOrderConfirmedStatus,
  isMetaCompletedStatus,
  normalizeMetaEventTime,
} from './meta/contract';
export {
  resolveMetaCommerceLines,
  resolveOrderLineSnapshots,
  replaceOrderLineSnapshots,
  buildMetaCommerceCustomData,
  lineRowToCommerceLine,
} from './meta/commerce';
export { enqueueMetaBrowserEvent, createOrderMetaArtifacts } from './meta/enqueue';
export { sendMetaEvent } from './meta/transport';
export { processMetaOutboxBatch, updateMetaWorkerHeartbeat } from './meta/worker';
export {
  ensureOrderConfirmedEventForOrder,
  ensureOrderCompletedEventForOrder,
  reconcileOrderConfirmedEvents,
  reconcileOrderCompletedEvents,
  clearExpiredMetaAttribution,
} from './meta/reconciliation';
export {
  buildMetaUserData,
  getMetaMatchKeySummary,
  hashMetaValue,
  isValidFbc,
  isValidFbp,
  normalizeAlgeriaPhone,
  readMetaOrderLocation,
  resolveMetaOrderLocation,
  type MetaOrderLocation,
  type MetaRequestContext,
} from './meta-identity';
