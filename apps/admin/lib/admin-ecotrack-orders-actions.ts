import { getDb } from '@bric/db/client';
import { captureAdminException } from './sentry';
import {
  addEcotrackMaj as addEcotrackMajUpstream,
  deleteEcotrackOrder,
  dispatchEcotrackOrder,
  EcotrackMutationRejectedError,
  EcotrackRateLimitError,
  fetchEcotrackOrderLabel,
  getEcotrackOrdersStatus,
  readEcotrackRejected,
  requestEcotrackReturn as requestEcotrackReturnUpstream,
  updateEcotrackOrder,
} from '@bric/storefront-core/ecotrack-client';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';
import {
  buildOrderCommercialValues,
  readOrderProductSubtotal,
  resolveOrderCommercialState,
} from '@bric/storefront-core/order-commercial';
import { PDFDocument } from 'pdf-lib';
import type { ActionActor } from './action-history';
import {
  ensureFreshShipmentRow,
  getEcotrackTrackingsInfoAllowingMissing,
  type EcotrackBulkLabelResult,
  type EcotrackDispatchBatchResult,
  type EcotrackOrderDetail,
} from './admin-ecotrack-shipment-state';
import {
  buildEcotrackOrderDetailFromRow,
  getActionFlags,
  loadShipmentRowByOrderId,
} from './admin-ecotrack-shipment-view';
import type { EcotrackBulkActionFailure, EcotrackLabelItem } from './ecotrack-admin-contracts';
import { readEcotrackCatalog } from './ecotrack-catalog';
import { applySavedEcotrackMutation, type CarrierOrderChange } from './ecotrack-mutation-apply';
import {
  claimEcotrackMutation,
  ECOTRACK_MUTATION_TIMEOUT_MS,
  markEcotrackMutationUncertain,
  recordEcotrackMutationResult,
  type CarrierMutationKind,
} from './ecotrack-mutations';
import { buildEcotrackOrderPayload, createEcotrackOrdersBatch } from './ecotrack-posting';
import { formatEcotrackActionError, toEcotrackFailureRecord } from './ecotrack-shipment-errors';
import { providerRequestOptions } from './ecotrack-shipment-evidence';
import {
  buildUpdatePayload,
  parseEcotrackShipmentUpdateDraft,
  type EcotrackDispatchRequest,
  type EcotrackOrderUpdateDraft,
} from './ecotrack-shipment-input';
import { sanitizeNullableText } from './ecotrack-shipment-status';
import type { EcotrackShipmentRow as ShipmentRow } from './ecotrack-shipment-types';
import { getOrderProductLookup, toOrderRecord } from './order-records';

type ActionFlag =
  'canEdit' | 'canEditAndRecreate' | 'canDelete' | 'canDispatch' | 'canAddMaj' | 'canAskReturn';
async function loadActionableShipment(orderId: number, flag: ActionFlag, actor: ActionActor) {
  const db = getDb();
  const row = await loadShipmentRowByOrderId(db, orderId);
  if (!row) return null;
  await ensureFreshShipmentRow(db, row, { includeMaj: false, includeTracking: false, actor });
  const fresh = await loadShipmentRowByOrderId(db, orderId);
  if (!fresh) return null;
  if (
    !getActionFlags(
      fresh.currentStatus,
      fresh.deletedAt,
      fresh.order.inHouseStatus,
      fresh.lastStatusSyncedAt,
    )[flag]
  )
    throw new Error('This carrier action is no longer available. Refresh the shipment.');
  return fresh;
}

async function executeCarrierCommand(
  row: ShipmentRow,
  kind: CarrierMutationKind,
  actor: ActionActor,
  request: Record<string, unknown>,
  send: (deadlineAt: number) => Promise<Record<string, unknown>>,
) {
  const db = getDb();
  const operation = await claimEcotrackMutation(db, {
    orderId: row.order.id,
    orderUpdatedAt: row.order.updatedAt,
    kind,
    provider: row.provider === 'emir' ? 'emir' : 'delivro',
    trackingNumber: row.trackingNumber,
    request,
    actor,
  });
  let saved;
  try {
    const result = await send(operation.createdAt.getTime() + ECOTRACK_MUTATION_TIMEOUT_MS);
    saved = await recordEcotrackMutationResult(db, operation, result, true);
  } catch (error) {
    if (error instanceof EcotrackMutationRejectedError || error instanceof EcotrackRateLimitError) {
      await recordEcotrackMutationResult(db, operation, { message: error.message }, false);
    } else {
      await markEcotrackMutationUncertain(db, operation, error);
    }
    throw error;
  }
  await applySavedEcotrackMutation(db, saved);
  if (kind === 'delete') return null;
  const current = await loadShipmentRowByOrderId(db, row.order.id);
  if (current && (kind === 'dispatch' || kind === 'return')) {
    try {
      return await ensureFreshShipmentRow(db, current, {
        includeMaj: false,
        includeTracking: false,
        actor,
      });
    } catch (error) {
      // The mutation already succeeded. A failed status read must not invite a
      // second carrier mutation; return the accepted local state as stale.
      captureAdminException(error, {
        requestId: saved.id,
        operation: 'carrier-status-after-mutation',
        context: { orderId: row.order.id, kind },
      });
    }
  }
  return current ? buildEcotrackOrderDetailFromRow(db, current) : null;
}

async function prepareCarrierOrderChange(
  row: ShipmentRow,
  changes: Partial<EcotrackOrderUpdateDraft>,
) {
  const db = getDb();
  const now = new Date();
  const draft = parseEcotrackShipmentUpdateDraft({
    firstName: row.order.firstName ?? row.order.phoneNumber1,
    lastName: row.order.lastName ?? '',
    phoneNumber1: row.order.phoneNumber1,
    phoneNumber2: row.order.phoneNumber2,
    delivery: row.order.delivery,
    state: row.order.state,
    city: row.order.city ?? '',
    homeAddress: row.order.homeAddress ?? '',
    note: row.order.note,
    deliveryFee: row.order.deliveryFee,
    subtotalOverride: row.order.price,
    ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
  });
  const deliveryFee = draft.deliveryFee ?? Number(row.order.deliveryFee ?? 0);
  const commercial =
    draft.cartProducts === undefined
      ? undefined
      : await resolveOrderCommercialState(db, {
          cartProducts: draft.cartProducts,
          promoCode: row.order.promoCode,
          productPromos: row.order.productPromos,
          now,
        });
  const productSubtotal =
    commercial?.productSubtotal ?? (await readOrderProductSubtotal(db, row.order));
  const desired: CarrierOrderChange = {
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
      deliveryFee: deliveryFee.toFixed(2),
    },
    commercial,
    deliveryFee: commercial ? deliveryFee : undefined,
    totals: { productSubtotal, deliveryFee, subtotalOverride: draft.subtotalOverride },
  };
  const projected = {
    ...row.order,
    ...(commercial ? buildOrderCommercialValues(commercial, deliveryFee) : {}),
    ...desired.values,
    productSubtotal: productSubtotal.toFixed(2),
    price: draft.subtotalOverride?.toFixed(2) ?? null,
    totalAmount: ((draft.subtotalOverride ?? productSubtotal) + deliveryFee).toFixed(2),
  };
  const lookup = await getOrderProductLookup(db, [projected]);
  if (commercial)
    lookup.orderLinesByOrderId.set(
      row.order.id,
      commercial.lines.map((line) => ({
        productId: line.productId,
        contentId: line.contentId,
        rawValue: line.rawValue,
        title: line.title,
        effectiveUnitPrice: line.effectiveUnitPrice,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
        thumbnailUrl: line.thumbnailUrl,
      })),
    );
  return {
    desired,
    record: toOrderRecord(projected, [], lookup),
    catalog: await readEcotrackCatalog(db),
  };
}

export async function updatePostedEcotrackOrder(
  orderId: number,
  draft: Partial<EcotrackOrderUpdateDraft>,
  actor: ActionActor,
) {
  const row = await loadActionableShipment(orderId, 'canEdit', actor);
  if (!row) return null;
  const { desired, record, catalog } = await prepareCarrierOrderChange(row, draft);
  const payload = buildUpdatePayload(record, row.trackingNumber, catalog, row.rawOrderPayload);
  return executeCarrierCommand(
    row,
    'update',
    actor,
    { desired, record, payload },
    async (deadlineAt) => {
      const result = await updateEcotrackOrder(payload, {
        ...providerRequestOptions(row),
        deadlineAt,
      });
      return { success: result.success, raw: result.payload };
    },
  );
}

export async function recreatePostedEcotrackOrder(
  orderId: number,
  draft: Partial<EcotrackOrderUpdateDraft>,
  actor: ActionActor,
) {
  const row = await loadActionableShipment(orderId, 'canEditAndRecreate', actor);
  if (!row) return null;
  const { desired, record, catalog } = await prepareCarrierOrderChange(row, draft);
  const payload = buildEcotrackOrderPayload(record, catalog);
  return executeCarrierCommand(
    row,
    'recreate',
    actor,
    { desired, record, payload },
    async (deadlineAt) => {
      const response = await createEcotrackOrdersBatch([payload], {
        ...providerRequestOptions(row),
        deadlineAt,
      });
      const result = response.results.get(payload.reference);
      if (
        !result?.raw ||
        (!result.success && !readEcotrackRejected(result.raw)) ||
        (result.success && !result.tracking)
      )
        throw new Error('Carrier creation outcome is unknown. Open carrier recovery.');
      if (!result.success)
        throw new EcotrackMutationRejectedError(
          result.message ?? 'Carrier rejected shipment recreation.',
        );
      return result;
    },
  );
}

export async function deletePostedEcotrackOrder(orderId: number, actor: ActionActor) {
  const row = await loadActionableShipment(orderId, 'canDelete', actor);
  if (!row) return null;
  await executeCarrierCommand(row, 'delete', actor, {}, async (deadlineAt) => {
    try {
      const result = await deleteEcotrackOrder(row.trackingNumber, {
        ...providerRequestOptions(row),
        deadlineAt,
      });
      return { success: result.success, raw: result.payload };
    } catch (error) {
      // Some carrier instances return an error after deleting. Require both
      // status absence and an explicit missing-tracking response before applying locally.
      try {
        const [status, tracking] = await Promise.all([
          getEcotrackOrdersStatus([row.trackingNumber], 'all', providerRequestOptions(row)),
          getEcotrackTrackingsInfoAllowingMissing(
            [row.trackingNumber],
            providerRequestOptions(row),
          ),
        ]);
        if (!status.data.has(row.trackingNumber) && tracking.missing.has(row.trackingNumber))
          return {
            success: true,
            raw: {
              recoveredBy: 'status-and-tracking-absence',
              originalError: error instanceof Error ? error.message : String(error),
            },
          };
      } catch {
        /* Preserve the mutation error when its outcome cannot be verified. */
      }
      throw error;
    }
  });
  return { ok: true, inHouseOrderStatus: 'confirmed' as const };
}

export async function dispatchPostedEcotrackOrder(
  orderId: number,
  request: EcotrackDispatchRequest,
  actor: ActionActor,
) {
  const row = await loadActionableShipment(orderId, 'canDispatch', actor);
  if (!row) return null;
  return executeCarrierCommand(row, 'dispatch', actor, request, async (deadlineAt) => {
    const result = await dispatchEcotrackOrder(row.trackingNumber, request.askCollection, {
      ...providerRequestOptions(row),
      deadlineAt,
    });
    return { success: result.success, raw: result.payload };
  });
}

export async function addEcotrackMaj(orderId: number, content: string, actor: ActionActor) {
  const row = await loadActionableShipment(orderId, 'canAddMaj', actor);
  if (!row) return null;
  return executeCarrierCommand(row, 'maj', actor, { content }, async (deadlineAt) => {
    const result = await addEcotrackMajUpstream(row.trackingNumber, content, {
      ...providerRequestOptions(row),
      deadlineAt,
    });
    return { success: result.success, raw: result.payload };
  });
}

export async function requestEcotrackReturn(orderId: number, actor: ActionActor) {
  const row = await loadActionableShipment(orderId, 'canAskReturn', actor);
  if (!row) return null;
  return executeCarrierCommand(row, 'return', actor, {}, async (deadlineAt) => {
    const result = await requestEcotrackReturnUpstream(row.trackingNumber, {
      ...providerRequestOptions(row),
      deadlineAt,
    });
    return { success: result.success, raw: result.payload };
  });
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
