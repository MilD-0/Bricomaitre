import { eq } from 'drizzle-orm';
import { PDFDocument } from 'pdf-lib';
import {
  addEcotrackMaj as addEcotrackMajUpstream,
  deleteEcotrackOrder,
  dispatchEcotrackOrder,
  fetchEcotrackOrderLabel,
  getEcotrackOrdersStatus,
  requestEcotrackReturn as requestEcotrackReturnUpstream,
  updateEcotrackOrder,
} from '@bric/storefront-core/ecotrack-client';
import {
  restoreCanonicalOrderSnapshot,
  updateCanonicalOrder,
} from '@bric/storefront-core/order-write';
import { getDb } from '@bric/db/client';
import { ecotrackOrderStates, orderLineItems } from '@bric/db/schema';
import {
  readOrderProductSubtotal,
  resolveOrderCommercialState,
} from '@bric/storefront-core/order-commercial';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';

import type { EcotrackBulkActionFailure, EcotrackLabelItem } from './ecotrack-admin-contracts';
import {
  buildEcotrackOrderActionSnapshot,
  buildEcotrackShipmentActionSnapshot,
} from './ecotrack-action-snapshots';
import { getOrderProductLookup, toOrderRecord } from './order-records';
import {
  buildEcotrackOrderPayload,
  createEcotrackOrdersBatch,
  persistEcotrackPostedOrder,
  readEcotrackCatalog,
} from './ecotrack';
import { formatEcotrackActionError, toEcotrackFailureRecord } from './ecotrack-shipment-errors';
import {
  buildUpdatePayload,
  type EcotrackDispatchRequest,
  type EcotrackOrderUpdateDraft,
} from './ecotrack-shipment-input';
import { providerRequestOptions } from './ecotrack-shipment-evidence';
import { sanitizeNullableText } from './ecotrack-shipment-status';
import type { EcotrackShipmentRow as ShipmentRow } from './ecotrack-shipment-types';
import { ORDER_STATUS } from './orders';
import { refreshEcotrackOrder } from './admin-ecotrack-orders-read';
import {
  STATUS_STALE_MS,
  canonicalizeOrderCartProducts,
  ensureFreshShipmentRow,
  getActionFlags,
  getEcotrackTrackingsInfoAllowingMissing,
  isStaleAt,
  loadMajSyncSummary,
  loadShipmentRowByOrderId,
  recordEcotrackOrderAction,
  recordEcotrackMajAction,
  recordEcotrackShipmentAction,
  softDeleteShipmentRow,
  type EcotrackBulkLabelResult,
  type EcotrackDispatchBatchResult,
  type EcotrackOrderDetail,
} from './admin-ecotrack-shipment-state';

export async function updatePostedEcotrackOrder(
  orderId: number,
  draft: EcotrackOrderUpdateDraft,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, {
      includeMaj: false,
      includeTracking: false,
      actor,
    });
  } catch (error) {
    throw new Error(formatEcotrackActionError('update', row, error).summary);
  }
  if (!fresh?.canEdit) {
    throw new Error(
      formatEcotrackActionError(
        'update',
        row,
        new Error('This ECOTRACK order can no longer be modified.'),
      ).summary,
    );
  }

  const previous = {
    firstName: row.order.firstName,
    lastName: row.order.lastName,
    phoneNumber1: row.order.phoneNumber1,
    phoneNumber2: row.order.phoneNumber2,
    delivery: row.order.delivery,
    state: row.order.state,
    city: row.order.city,
    homeAddress: row.order.homeAddress,
    note: row.order.note,
    cartProducts: row.order.cartProducts,
    deliveryFee: row.order.deliveryFee,
    price: row.order.price,
    normalizedPhone: row.order.normalizedPhone,
    productSubtotal: row.order.productSubtotal,
    totalAmount: row.order.totalAmount,
    promoCode: row.order.promoCode,
    promoProductId: row.order.promoProductId,
    promoOriginalSubtotal: row.order.promoOriginalSubtotal,
    promoDiscountAmount: row.order.promoDiscountAmount,
    promoFinalSubtotal: row.order.promoFinalSubtotal,
  };

  const catalog = await readEcotrackCatalog(db);
  const now = new Date();
  const nextDeliveryFeeValue =
    draft.deliveryFee === null
      ? (row.order.deliveryFee ?? '0.00')
      : String(Number(draft.deliveryFee).toFixed(2));
  const nextCartProducts =
    draft.cartProducts === undefined
      ? row.order.cartProducts
      : await canonicalizeOrderCartProducts(db, draft.cartProducts);
  const commercial =
    draft.cartProducts === undefined
      ? null
      : await resolveOrderCommercialState(db, {
          cartProducts: nextCartProducts,
          promoCode: row.order.promoCode,
          now,
        });
  const canonicalSubtotal =
    commercial?.productSubtotal ?? (await readOrderProductSubtotal(db, row.order));
  const previousLines =
    commercial === null
      ? []
      : await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId));

  const updatedOrder = await db.transaction(async (tx) => {
    const result = await updateCanonicalOrder(tx, {
      orderId,
      values: {
        firstName: draft.firstName,
        lastName: sanitizeNullableText(draft.lastName),
        phoneNumber1: draft.phoneNumber1,
        normalizedPhone: normalizeAlgeriaPhone(draft.phoneNumber1),
        phoneNumber2: sanitizeNullableText(draft.phoneNumber2),
        delivery: draft.delivery,
        state: draft.state,
        city: draft.city,
        homeAddress: sanitizeNullableText(draft.homeAddress),
        note: sanitizeNullableText(draft.note),
        deliveryFee: nextDeliveryFeeValue,
      },
      commercial: commercial ?? undefined,
      deliveryFee: commercial ? Number(nextDeliveryFeeValue) : undefined,
      totals: {
        productSubtotal: canonicalSubtotal,
        deliveryFee: Number(nextDeliveryFeeValue),
        subtotalOverride: draft.subtotalOverride,
      },
      now,
    });
    return result.order;
  });

  try {
    const productLookup = await getOrderProductLookup(db, [updatedOrder]);
    const updatedRecord = toOrderRecord(updatedOrder, [], productLookup);
    await updateEcotrackOrder(
      buildUpdatePayload(updatedRecord, row.trackingNumber, catalog),
      providerRequestOptions(row),
    );
  } catch (error) {
    await db.transaction(async (tx) => {
      await restoreCanonicalOrderSnapshot(tx, {
        orderId,
        values: { ...previous, updatedAt: row.order.updatedAt },
        lineItems: commercial ? previousLines : undefined,
      });
    });
    throw new Error(formatEcotrackActionError('update', row, error).summary);
  }

  await db.transaction(async (tx) => {
    const beforeOrderState = buildEcotrackOrderActionSnapshot(updatedOrder);
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);

    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));

    const afterShipmentState = {
      ...beforeShipmentState,
      lastActionAt: now,
      updatedAt: now,
    };

    await recordEcotrackOrderAction(
      tx,
      buildEcotrackOrderActionSnapshot(row.order),
      beforeOrderState,
      actor,
    );
    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function recreatePostedEcotrackOrder(
  orderId: number,
  draft: EcotrackOrderUpdateDraft,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, {
      includeMaj: false,
      includeTracking: false,
      actor,
    });
  } catch (error) {
    throw new Error(formatEcotrackActionError('recreate', row, error).summary);
  }

  if (!fresh) {
    return null;
  }

  if (fresh.canEdit) {
    throw new Error(
      formatEcotrackActionError(
        'recreate',
        row,
        new Error('This ECOTRACK order should be edited directly instead of recreated.'),
      ).summary,
    );
  }

  const previousOrderValues = {
    firstName: row.order.firstName,
    lastName: row.order.lastName,
    phoneNumber1: row.order.phoneNumber1,
    phoneNumber2: row.order.phoneNumber2,
    delivery: row.order.delivery,
    state: row.order.state,
    city: row.order.city,
    homeAddress: row.order.homeAddress,
    note: row.order.note,
    cartProducts: row.order.cartProducts,
    deliveryFee: row.order.deliveryFee,
    price: row.order.price,
    normalizedPhone: row.order.normalizedPhone,
    productSubtotal: row.order.productSubtotal,
    totalAmount: row.order.totalAmount,
    promoCode: row.order.promoCode,
    promoProductId: row.order.promoProductId,
    promoOriginalSubtotal: row.order.promoOriginalSubtotal,
    promoDiscountAmount: row.order.promoDiscountAmount,
    promoFinalSubtotal: row.order.promoFinalSubtotal,
    ecotrackStatus: row.order.ecotrackStatus,
    ecotrackStatusLastUpdate: row.order.ecotrackStatusLastUpdate,
    ecotrackStatusData: row.order.ecotrackStatusData,
    ecotrackReference: row.order.ecotrackReference,
    ecotrackTrackingNumber: row.order.ecotrackTrackingNumber,
    updatedAt: row.order.updatedAt,
  };
  const previousShipmentValues = {
    deletedAt: row.deletedAt,
    lastActionAt: row.lastActionAt,
    updatedAt: row.updatedAt,
  };

  const now = new Date();
  const nextCartProducts =
    draft.cartProducts === undefined
      ? row.order.cartProducts
      : await canonicalizeOrderCartProducts(db, draft.cartProducts);
  const nextDeliveryFeeValue =
    draft.deliveryFee === null
      ? (row.order.deliveryFee ?? '0.00')
      : String(Number(draft.deliveryFee).toFixed(2));
  const commercial =
    draft.cartProducts === undefined
      ? null
      : await resolveOrderCommercialState(db, {
          cartProducts: nextCartProducts,
          promoCode: row.order.promoCode,
          now,
        });
  const canonicalSubtotal =
    commercial?.productSubtotal ?? (await readOrderProductSubtotal(db, row.order));
  const previousLines =
    commercial === null
      ? []
      : await db.select().from(orderLineItems).where(eq(orderLineItems.orderId, orderId));
  const updatedOrder = await db.transaction(async (tx) => {
    const result = await updateCanonicalOrder(tx, {
      orderId,
      values: {
        firstName: draft.firstName,
        lastName: sanitizeNullableText(draft.lastName),
        phoneNumber1: draft.phoneNumber1,
        normalizedPhone: normalizeAlgeriaPhone(draft.phoneNumber1),
        phoneNumber2: sanitizeNullableText(draft.phoneNumber2),
        delivery: draft.delivery,
        state: draft.state,
        city: draft.city,
        homeAddress: sanitizeNullableText(draft.homeAddress),
        note: sanitizeNullableText(draft.note),
        deliveryFee: nextDeliveryFeeValue,
      },
      commercial: commercial ?? undefined,
      deliveryFee: commercial ? Number(nextDeliveryFeeValue) : undefined,
      totals: {
        productSubtotal: canonicalSubtotal,
        deliveryFee: Number(nextDeliveryFeeValue),
        subtotalOverride: draft.subtotalOverride,
      },
      now,
    });
    return result.order;
  });

  let recreated = false;

  try {
    await softDeleteShipmentRow(db, row, { actor, operation: 'update' });

    const catalog = await readEcotrackCatalog(db);
    const productLookup = await getOrderProductLookup(db, [updatedOrder]);
    const updatedRecord = toOrderRecord(updatedOrder, [], productLookup);
    const payload = buildEcotrackOrderPayload(updatedRecord, catalog);
    const createResponse = await createEcotrackOrdersBatch([payload], providerRequestOptions(row));
    const createResult = createResponse.results.get(payload.reference);

    if (!createResult?.success || !createResult.tracking) {
      throw new Error(createResult?.message ?? 'Ecotrack rejected the recreated order.');
    }

    await persistEcotrackPostedOrder(
      db,
      {
        row: updatedOrder,
        record: updatedRecord,
      },
      actor,
      createResult,
      row.provider === 'emir' ? 'emir' : 'delivro',
    );
    recreated = true;
  } catch (error) {
    await db.transaction(async (tx) => {
      await restoreCanonicalOrderSnapshot(tx, {
        orderId,
        values: previousOrderValues,
        lineItems: commercial ? previousLines : undefined,
      });

      await tx
        .update(ecotrackOrderStates)
        .set(previousShipmentValues)
        .where(eq(ecotrackOrderStates.id, row.id));
    });

    throw new Error(formatEcotrackActionError('recreate', row, error).summary);
  }

  if (!recreated) {
    throw new Error(
      formatEcotrackActionError('recreate', row, new Error('Failed to recreate ECOTRACK shipment.'))
        .summary,
    );
  }

  return refreshEcotrackOrder(orderId, actor);
}

export async function deletePostedEcotrackOrder(
  orderId: number,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  let row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  if (isStaleAt(row.lastStatusSyncedAt, STATUS_STALE_MS)) {
    let fresh: EcotrackOrderDetail | null;
    try {
      fresh = await ensureFreshShipmentRow(db, row, {
        includeMaj: false,
        includeTracking: false,
        actor,
      });
    } catch (error) {
      throw new Error(formatEcotrackActionError('delete', row, error).summary);
    }
    if (!fresh) {
      return null;
    }
    if (!fresh.canDelete) {
      throw new Error(
        formatEcotrackActionError(
          'delete',
          row,
          new Error('This ECOTRACK order can no longer be deleted.'),
        ).summary,
      );
    }
    // Freshness reconciliation may update the local order. Use that revision
    // for the optimistic check after the provider deletion finishes.
    const refreshedRow = await loadShipmentRowByOrderId(db, orderId);
    if (!refreshedRow) return null;
    if (
      refreshedRow.id !== row.id ||
      refreshedRow.trackingNumber !== row.trackingNumber ||
      !getActionFlags(refreshedRow.currentStatus, refreshedRow.deletedAt).canDelete
    ) {
      throw new Error(
        'The ECOTRACK shipment changed while deletion was in progress. Refresh and retry.',
      );
    }
    row = refreshedRow;
  } else if (!getActionFlags(row.currentStatus, row.deletedAt).canDelete) {
    throw new Error(
      formatEcotrackActionError(
        'delete',
        row,
        new Error('This ECOTRACK order can no longer be deleted.'),
      ).summary,
    );
  }

  try {
    if (row.provider === 'emir') {
      await deleteEcotrackOrder(row.trackingNumber, providerRequestOptions(row));
    } else {
      await deleteEcotrackOrder(row.trackingNumber);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (!message.includes(' 400 ') && !message.includes(' 404 ')) {
      throw new Error(formatEcotrackActionError('delete', row, error).summary);
    }

    const [statusResponse, trackingResponse] = await Promise.all([
      row.provider === 'emir'
        ? getEcotrackOrdersStatus([row.trackingNumber], 'all', providerRequestOptions(row))
        : getEcotrackOrdersStatus([row.trackingNumber], 'all'),
      row.provider === 'emir'
        ? getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber], providerRequestOptions(row))
        : getEcotrackTrackingsInfoAllowingMissing([row.trackingNumber]),
    ]);

    if (
      statusResponse.data.has(row.trackingNumber) ||
      trackingResponse.data.has(row.trackingNumber)
    ) {
      throw new Error(formatEcotrackActionError('delete', row, error).summary);
    }
  }

  const deleted = await softDeleteShipmentRow(db, row, {
    actor,
    operation: 'delete',
    restorePostedOrderToConfirmed: true,
  });
  if (!deleted) {
    throw new Error(
      'The ECOTRACK shipment changed while deletion was in progress. Refresh and retry.',
    );
  }

  return { ok: true, inHouseOrderStatus: 'confirmed' as const };
}

export async function dispatchPostedEcotrackOrder(
  orderId: number,
  request: EcotrackDispatchRequest,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, {
      includeMaj: false,
      includeTracking: false,
      actor,
    });
  } catch (error) {
    throw new Error(formatEcotrackActionError('dispatch', row, error).summary);
  }
  if (!fresh?.canDispatch) {
    throw new Error(
      formatEcotrackActionError(
        'dispatch',
        row,
        new Error('This ECOTRACK order can no longer be dispatched.'),
      ).summary,
    );
  }

  try {
    await dispatchEcotrackOrder(
      row.trackingNumber,
      request.askCollection,
      providerRequestOptions(row),
    );
  } catch (error) {
    throw new Error(formatEcotrackActionError('dispatch', row, error).summary);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));
    await updateCanonicalOrder(tx, {
      orderId,
      status: { value: ORDER_STATUS.DISPATCHED, noAnswerCount: 0 },
      actor,
      now,
    });
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function dispatchEcotrackOrdersBatch(
  orderIds: number[],
  request: EcotrackDispatchRequest,
  actor: { email?: string | null; name?: string | null },
): Promise<EcotrackDispatchBatchResult> {
  const items: EcotrackOrderDetail[] = [];
  const failures: EcotrackBulkActionFailure[] = [];

  for (const orderId of orderIds) {
    const row = await loadShipmentRowByOrderId(getDb(), orderId);
    if (!row) {
      failures.push({
        orderId,
        reference: null,
        trackingNumber: null,
        message: `Order #${orderId}: Ecotrack shipment not found.`,
      });
      continue;
    }

    try {
      const item = await dispatchPostedEcotrackOrder(orderId, request, actor);
      if (item) {
        items.push(item);
      } else {
        failures.push({
          orderId,
          reference: row.reference,
          trackingNumber: row.trackingNumber,
          message: `Order #${orderId} / Ref ${row.reference} / Tracking ${row.trackingNumber}: Ecotrack shipment not found.`,
        });
      }
    } catch (error) {
      failures.push(toEcotrackFailureRecord('dispatch', row, error));
    }
  }

  const successCount = items.length;
  return {
    ok: successCount > 0 || orderIds.length === 0,
    items,
    failures,
    successCount,
    failureCount: failures.length,
    totalRequested: orderIds.length,
  };
}

export async function addEcotrackMaj(
  orderId: number,
  content: string,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, { includeTracking: false, actor });
  } catch (error) {
    throw new Error(formatEcotrackActionError('maj', row, error).summary);
  }
  if (!fresh?.canAddMaj) {
    throw new Error(
      formatEcotrackActionError(
        'maj',
        row,
        new Error('This ECOTRACK order cannot receive a follow-up update right now.'),
      ).summary,
    );
  }

  try {
    await addEcotrackMajUpstream(row.trackingNumber, content, providerRequestOptions(row));
  } catch (error) {
    throw new Error(formatEcotrackActionError('maj', row, error).summary);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);
    const beforeMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);

    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));

    const afterShipmentState = {
      ...beforeShipmentState,
      lastActionAt: now,
      updatedAt: now,
    };
    const afterMajState = await loadMajSyncSummary(tx, row.order.id, row.trackingNumber);

    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
    await recordEcotrackMajAction(tx, row.order.id, beforeMajState, afterMajState, actor);
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function requestEcotrackReturn(
  orderId: number,
  actor: { email?: string | null; name?: string | null },
) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  let fresh: EcotrackOrderDetail | null;
  try {
    fresh = await ensureFreshShipmentRow(db, row, { actor });
  } catch (error) {
    throw new Error(formatEcotrackActionError('return', row, error).summary);
  }
  if (!fresh?.canAskReturn) {
    throw new Error(
      formatEcotrackActionError(
        'return',
        row,
        new Error('Return can only be requested while the shipment is en_livraison.'),
      ).summary,
    );
  }

  try {
    await requestEcotrackReturnUpstream(row.trackingNumber, providerRequestOptions(row));
  } catch (error) {
    throw new Error(formatEcotrackActionError('return', row, error).summary);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    const beforeShipmentState = buildEcotrackShipmentActionSnapshot(row);

    await tx
      .update(ecotrackOrderStates)
      .set({
        lastActionAt: now,
        updatedAt: now,
      })
      .where(eq(ecotrackOrderStates.id, row.id));

    const afterShipmentState = {
      ...beforeShipmentState,
      lastActionAt: now,
      updatedAt: now,
    };

    await recordEcotrackShipmentAction(
      tx,
      row.order.id,
      beforeShipmentState,
      afterShipmentState,
      actor,
      'update',
    );
  });

  return refreshEcotrackOrder(orderId, actor);
}

export async function fetchSingleEcotrackLabel(orderId: number) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) {
    return null;
  }

  try {
    return await fetchEcotrackOrderLabel(row.trackingNumber, providerRequestOptions(row));
  } catch (error) {
    throw new Error(formatEcotrackActionError('label', row, error).summary);
  }
}

export async function fetchMergedEcotrackLabels(
  orderIds: number[],
): Promise<EcotrackBulkLabelResult> {
  const db = getDb();
  const rows = (
    await Promise.all(orderIds.map((orderId) => loadShipmentRowByOrderId(db, orderId)))
  ).filter(Boolean) as ShipmentRow[];
  const merged = await PDFDocument.create();
  const items: EcotrackLabelItem[] = [];
  const failures: EcotrackBulkActionFailure[] = [];

  for (const orderId of orderIds) {
    if (!rows.some((row) => row.order.id === orderId)) {
      failures.push({
        orderId,
        reference: null,
        trackingNumber: null,
        message: `Order #${orderId}: Ecotrack shipment not found.`,
      });
    }
  }

  for (const row of rows) {
    try {
      const label = await fetchEcotrackOrderLabel(row.trackingNumber, providerRequestOptions(row));
      const source = await PDFDocument.load(label.body);
      const copiedPages = await merged.copyPages(source, source.getPageIndices());
      for (const page of copiedPages) {
        merged.addPage(page);
      }
      items.push({
        orderId: row.order.id,
        reference: row.reference,
        trackingNumber: row.trackingNumber,
      });
    } catch (error) {
      failures.push(toEcotrackFailureRecord('label', row, error));
    }
  }

  const successCount = items.length;
  const body = successCount > 0 ? await merged.save() : null;

  return {
    ok: successCount > 0 || orderIds.length === 0,
    items,
    failures,
    successCount,
    failureCount: failures.length,
    totalRequested: orderIds.length,
    fileName:
      successCount > 0 ? `ecotrack-labels-${new Date().toISOString().slice(0, 10)}.pdf` : null,
    pdfBase64: body ? Buffer.from(body).toString('base64') : null,
  };
}
